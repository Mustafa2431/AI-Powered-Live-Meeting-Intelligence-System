import React, { useState } from 'react'

const getDuration = (start, end) => {
  if (!start || !end) return '';
  const diff = new Date(end) - new Date(start);
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return ` • ${m}m ${s}s`;
}

export default function MeetingSummary({ meetings, openQuestions = [], followUps = [] }) {
  const [selected, setSelected] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [localSummaries, setLocalSummaries] = useState({}) // Cache loaded summaries { [id]: summaryObj }
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)

  const meeting = selected !== null ? meetings[selected] : null

  // Merge live + persisted insights when a meeting is selected
  const questions = meeting?.openQuestions?.length ? meeting.openQuestions : openQuestions
  const followups = meeting?.followUps?.length      ? meeting.followUps      : followUps

  const currentSummary = meeting ? (localSummaries[meeting._id] || meeting.summary) : null;

  async function handleGenerateSummary(force = false) {
    if (!meeting || isGenerating) return;   // guard: no duplicate requests
    setIsGenerating(true)
    try {
      const res = await fetch(`http://localhost:3001/api/summary/${meeting._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      })
      const data = await res.json()
      if (data.ok && data.summary) {
        setLocalSummaries(prev => ({ ...prev, [meeting._id]: data.summary }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const sectionCard = (bg, border, icon, label, children) => (
    <div style={{ background: bg, borderRadius: 16, padding: 20, marginBottom: 20, border: `1px solid ${border}` }}>
      <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
        {label}
      </h4>
      {children}
    </div>
  )

  return (
    <div style={{ padding: '40px 48px', display: 'flex', gap: 24, height: '100%' }}>
      {/* Meeting list */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>Summaries</h2>
        <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 24 }}>Post-meeting AI analysis</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meetings.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', padding: '20px 0' }}>No meetings yet.</p>
          )}
          {meetings.map((m, i) => (
            <button key={m._id || i} onClick={() => setSelected(i)} style={{
              background: selected === i
                ? 'linear-gradient(135deg,rgba(79,70,229,0.3),rgba(124,58,237,0.3))'
                : 'var(--surface-container-low)',
              border: `1px solid ${selected === i ? 'rgba(79,70,229,0.5)' : 'rgba(72,71,74,0.2)'}`,
              borderRadius: 14, padding: '14px 16px', textAlign: 'left',
              cursor: 'pointer', width: '100%', transition: 'all .15s',
            }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface)', marginBottom: 4 }}>{m.title || 'Meeting'}</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {new Date(m.startedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, background: 'var(--surface-container-low)', borderRadius: 20,
        padding: 32, overflowY: 'auto', border: '1px solid rgba(72,71,74,0.2)' }}>
        {!meeting ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', color: 'var(--on-surface-variant)', gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .3 }}>receipt_long</span>
            <p>Select a meeting to view its summary</p>
            {/* Show live insights even without a selected meeting */}
            {(openQuestions.length > 0 || followUps.length > 0) && (
              <div style={{ width: '100%', maxWidth: 520, marginTop: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginBottom: 16, textAlign: 'center' }}>
                  Live insights from current session
                </p>
                {openQuestions.length > 0 && sectionCard(
                  'rgba(234,179,8,0.08)', 'rgba(234,179,8,0.2)',
                  'help', `Open Questions (${openQuestions.length})`,
                  openQuestions.map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#eab308', marginTop: 1 }}>question_mark</span>
                      <div>
                        <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.5 }}>{q.question}</p>
                        <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{q.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
                {followUps.length > 0 && sectionCard(
                  'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.2)',
                  'event', `Suggested Follow-ups (${followUps.length})`,
                  followUps.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#10b981', marginTop: 1 }}>calendar_add_on</span>
                      <div>
                        <p style={{ fontSize: 13, color: 'var(--on-surface)', fontWeight: 500 }}>{f.suggestion}</p>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2, lineHeight: 1.4 }}>"{f.context}"</p>
                        <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{f.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{meeting.title}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                  {new Date(meeting.startedAt).toLocaleString()}
                  {meeting.endedAt ? ` → ${new Date(meeting.endedAt).toLocaleTimeString()}` : ' (ongoing)'}
                  {getDuration(meeting.startedAt, meeting.endedAt)}
                </p>
                {currentSummary?.generatedAt && (
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                    Last generated: {new Date(currentSummary.generatedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
              <button 
                onClick={() => handleGenerateSummary(!!currentSummary?.overview)}
                disabled={isGenerating}
                style={{
                  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {isGenerating ? 'hourglass_empty' : (currentSummary?.overview ? 'refresh' : 'auto_awesome')}
                </span>
                {isGenerating ? 'Generating...' : (currentSummary?.overview ? 'Regenerate' : 'Generate Summary')}
              </button>
            </div>

            {isGenerating ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
                 <div className="skeleton-bar" style={{ height: 20, width: '100%', borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite' }} />
                 <div className="skeleton-bar" style={{ height: 20, width: '85%', borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite', animationDelay: '0.2s' }} />
                 <div className="skeleton-bar" style={{ height: 20, width: '90%', borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite', animationDelay: '0.4s' }} />
                 <style>{`@keyframes pulse { 0% { opacity: 0.5 } 50% { opacity: 1 } 100% { opacity: 0.5 } }`}</style>
              </div>
            ) : currentSummary?.overview ? (
              <>
                {/* AI Summary */}
                {sectionCard('rgba(96,1,209,0.1)', 'rgba(96,1,209,0.2)', 'auto_awesome', 'Meeting Overview',
                  <p style={{ fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.7 }}>
                    {currentSummary.overview}
                  </p>
                )}

                {/* Topics */}
                {currentSummary.topics?.length > 0 && sectionCard('rgba(255,255,255,0.03)', 'rgba(255,255,255,0.1)', 'tag', 'Key Topics',
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {currentSummary.topics.map((t, i) => (
                      <span key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 12, fontSize: 12, color: 'var(--on-surface)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Decisions */}
                {currentSummary.decisions?.length > 0 && sectionCard('rgba(245,158,11,0.1)', 'rgba(245,158,11,0.2)', 'gavel', 'Decisions',
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--on-surface)', fontSize: 13, lineHeight: 1.6 }}>
                    {currentSummary.decisions.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}

                {/* ── Assigned Tasks (always shown from real-time detection) ───────── */}
                {(() => {
                  // Merge AI tasks + raw detected tasks, deduplicated by task text
                  const rawTasks = meeting.tasks || [];
                  const aiTasks  = currentSummary.tasks || [];

                  // Build combined list: raw detected tasks first (they have status/confidence)
                  // then any AI-only tasks not already in raw list
                  const rawTexts = new Set(rawTasks.map(t => (t.task||'').toLowerCase().slice(0,40)));
                  const aiExtras = aiTasks.filter(t => !rawTexts.has((t.task||'').toLowerCase().slice(0,40)));
                  const allTasks = [...rawTasks, ...aiExtras];

                  if (!allTasks.length) return null;

                  const statusColor = { pending: '#f59e0b', 'in-progress': '#3b82f6', done: '#10b981' };
                  const statusIcon  = { pending: 'schedule', 'in-progress': 'autorenew', done: 'check_circle' };

                  return sectionCard('rgba(20,184,166,0.1)', 'rgba(20,184,166,0.2)', 'task_alt',
                    `Assigned Tasks (${allTasks.length})`,
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {allTasks.map((t, i) => {
                        const isRaw     = i < rawTasks.length;
                        const assignee  = t.assignee || 'Unassigned';
                        const hasOwner  = assignee.toLowerCase() !== 'unassigned';
                        const status    = t.status || 'pending';
                        const conf      = t.confidence != null ? Math.round(t.confidence * 100) : null;

                        return (
                          <div key={i} style={{
                            display: 'flex', gap: 12, padding: '12px 14px',
                            background: 'rgba(20,184,166,0.06)', borderRadius: 12,
                            border: '1px solid rgba(20,184,166,0.15)',
                            alignItems: 'flex-start'
                          }}>
                            {/* Status icon */}
                            <span className="material-symbols-outlined" style={{
                              fontSize: 18, color: statusColor[status] || '#14b8a6', marginTop: 1, flexShrink: 0
                            }}>{statusIcon[status] || 'task_alt'}</span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Task text */}
                              <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.5, marginBottom: 6 }}>
                                {t.task || t}
                              </p>

                              {/* Assignee pill + status badge + confidence */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                {/* Assignee */}
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: hasOwner ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${hasOwner ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                  borderRadius: 20, padding: '2px 10px', fontSize: 11,
                                  color: hasOwner ? '#a5b4fc' : 'var(--on-surface-variant)',
                                  fontWeight: 500
                                }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person</span>
                                  {assignee}
                                </span>

                                {/* Status badge (only on real detected tasks) */}
                                {isRaw && (
                                  <span style={{
                                    background: `${statusColor[status]}22`,
                                    border: `1px solid ${statusColor[status]}66`,
                                    color: statusColor[status],
                                    borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600,
                                    textTransform: 'uppercase', letterSpacing: '0.04em'
                                  }}>{status}</span>
                                )}

                                {/* Confidence bar (only on real detected tasks with confidence) */}
                                {isRaw && conf !== null && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                                    color: 'var(--on-surface-variant)' }}>
                                    <div style={{
                                      width: 40, height: 4, borderRadius: 4,
                                      background: 'rgba(255,255,255,0.08)', overflow: 'hidden'
                                    }}>
                                      <div style={{
                                        width: `${conf}%`, height: '100%', borderRadius: 4,
                                        background: conf > 70 ? '#10b981' : conf > 40 ? '#f59e0b' : '#ef4444'
                                      }} />
                                    </div>
                                    {conf}%
                                  </span>
                                )}

                                {/* AI-only label */}
                                {!isRaw && (
                                  <span style={{ fontSize: 10, color: 'var(--on-surface-variant)',
                                    background: 'rgba(255,255,255,0.04)', borderRadius: 20,
                                    padding: '2px 8px', border: '1px solid rgba(255,255,255,0.08)'
                                  }}>AI detected</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Visual Highlights */}
                {currentSummary.highlights?.length > 0 && sectionCard('rgba(59,130,246,0.1)', 'rgba(59,130,246,0.2)', 'image', 'Visual Highlights',
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--on-surface)', fontSize: 13, lineHeight: 1.6 }}>
                    {currentSummary.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                )}

                {/* Timeline */}
                {currentSummary.timeline?.length > 0 && sectionCard('rgba(255,255,255,0.02)', 'rgba(255,255,255,0.08)', 'history', 'Timeline',
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {currentSummary.timeline.map((tl, i) => (
                      <div key={i} style={{ display: 'flex', gap: 16 }}>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 600, width: 90, flexShrink: 0 }}>{tl.range}</div>
                        <div style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.5 }}>{tl.summary || tl.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Generated Open Questions */}
                {currentSummary.openQuestions?.length > 0 && sectionCard('rgba(234,179,8,0.08)', 'rgba(234,179,8,0.2)', 'help', 'Open Questions',
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--on-surface)', fontSize: 13, lineHeight: 1.6 }}>
                    {currentSummary.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                )}

                {/* Generated Follow-ups */}
                {currentSummary.followUps?.length > 0 && sectionCard('rgba(16,185,129,0.08)', 'rgba(16,185,129,0.2)', 'event', 'Follow-ups & Scheduled Meetings',
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--on-surface)', fontSize: 13, lineHeight: 1.6 }}>
                    {currentSummary.followUps.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12, marginBottom: 20 }}>
                  <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>Click "Generate Summary" to run AI analysis.</p>
                </div>

                {/* Show detected tasks even without a generated summary */}
                {meeting.tasks?.length > 0 && (() => {
                  const statusColor = { pending: '#f59e0b', 'in-progress': '#3b82f6', done: '#10b981' };
                  const statusIcon  = { pending: 'schedule', 'in-progress': 'autorenew', done: 'check_circle' };
                  return sectionCard('rgba(20,184,166,0.1)', 'rgba(20,184,166,0.2)', 'task_alt',
                    `Detected Tasks (${meeting.tasks.length})`,
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {meeting.tasks.map((t, i) => {
                        const assignee = t.assignee || 'Unassigned';
                        const hasOwner = assignee.toLowerCase() !== 'unassigned';
                        const status   = t.status || 'pending';
                        const conf     = t.confidence != null ? Math.round(t.confidence * 100) : null;
                        return (
                          <div key={i} style={{
                            display: 'flex', gap: 12, padding: '12px 14px',
                            background: 'rgba(20,184,166,0.06)', borderRadius: 12,
                            border: '1px solid rgba(20,184,166,0.15)', alignItems: 'flex-start'
                          }}>
                            <span className="material-symbols-outlined" style={{
                              fontSize: 18, color: statusColor[status] || '#14b8a6', marginTop: 1, flexShrink: 0
                            }}>{statusIcon[status] || 'task_alt'}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.5, marginBottom: 6 }}>{t.task}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: hasOwner ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${hasOwner ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                  borderRadius: 20, padding: '2px 10px', fontSize: 11,
                                  color: hasOwner ? '#a5b4fc' : 'var(--on-surface-variant)', fontWeight: 500
                                }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person</span>
                                  {assignee}
                                </span>
                                <span style={{
                                  background: `${statusColor[status]}22`, border: `1px solid ${statusColor[status]}66`,
                                  color: statusColor[status], borderRadius: 20, padding: '2px 8px',
                                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em'
                                }}>{status}</span>
                                {conf !== null && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--on-surface-variant)' }}>
                                    <div style={{ width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                      <div style={{ width: `${conf}%`, height: '100%', borderRadius: 4,
                                        background: conf > 70 ? '#10b981' : conf > 40 ? '#f59e0b' : '#ef4444' }} />
                                    </div>
                                    {conf}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}

            {/* Live Session Open Questions (fallback before summary is generated) */}
            {!currentSummary?.overview && questions.length > 0 && sectionCard(
              'rgba(234,179,8,0.08)', 'rgba(234,179,8,0.2)',
              'help', `Live Open Questions (${questions.length})`,
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.map((q, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: 'rgba(234,179,8,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#eab308', marginTop: 1 }}>question_mark</span>
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.5 }}>{q.question || q}</p>
                      <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{q.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Live Session Follow-ups (fallback before summary is generated) */}
            {!currentSummary?.overview && followups.length > 0 && sectionCard(
              'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.2)',
              'event', `Live Suggested Follow-ups (${followups.length})`,
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {followups.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#10b981', marginTop: 1 }}>calendar_add_on</span>
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--on-surface)', fontWeight: 500 }}>{f.suggestion || f}</p>
                      {f.context && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2, fontStyle: 'italic' }}>"{f.context}"</p>}
                      <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{f.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Screen Captures — always shown, backward compatible */}
            {(meeting.imageDescriptions || []).length > 0 && (
              <section style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: 12 }}>📸 Screen Captures</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {(meeting.imageDescriptions || []).map((img, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 16, padding: 16,
                      background: 'rgba(59,130,246,0.06)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      borderRadius: 14
                    }}>
                      {/* Thumbnail */}
                      <img
                        src={`file:///${img.filePath.replace(/\\/g, '/')}`}
                        alt={`Screen ${i + 1}`}
                        style={{ width: 140, height: 88, objectFit: 'cover',
                          borderRadius: 8, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      {/* Caption */}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 6 }}>
                          ⏱ {new Date(img.timestamp).toLocaleTimeString()}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.6 }}>
                          📝 {img.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Transcript (Collapsible) */}
            {meeting.transcript && (
              <div style={{ marginTop: 24, marginBottom: 20 }}>
                <button onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: isTranscriptOpen ? 12 : 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isTranscriptOpen ? 'expand_less' : 'expand_more'}</span>
                    Full Transcript
                  </h4>
                </button>
                {isTranscriptOpen && (
                  <div style={{ background: 'var(--surface-container)', borderRadius: 14, padding: 20,
                    fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.8, maxHeight: 400, overflowY: 'auto' }}>
                    {meeting.transcript}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
