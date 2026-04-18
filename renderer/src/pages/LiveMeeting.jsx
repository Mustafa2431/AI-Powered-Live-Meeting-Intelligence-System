import React, { useRef, useEffect, useState } from 'react'

const COLORS = ['var(--secondary)', 'var(--primary)', 'var(--tertiary)', '#60efff', '#f9a825']

export default function LiveMeeting({ recording, transcript, tasks, summary, startRecording, stopRecording }) {
  const bottomRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)
  const startTime = useRef(null)

  // Timer
  useEffect(() => {
    if (recording) {
      startTime.current = Date.now()
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000)
      return () => clearInterval(t)
    } else {
      setElapsed(0)
    }
  }, [recording])

  // Auto-scroll transcript
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const testAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Audio access granted:', stream);
      alert('🎤 Audio access granted!');
    } catch (err) {
      console.error('Audio access error:', err);
      alert('❌ Audio access denied: ' + err.message);
    }
  }

  const testScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      console.log('Screen access granted:', stream);
      alert('🖥️ Screen access granted!');
    } catch (err) {
      console.error('Screen access error:', err);
      alert('❌ Screen access denied: ' + err.message);
    }
  }

  return (
    <div style={{ padding:'32px 40px', height:'100%', display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h2 style={{ fontSize:28, fontWeight:700, letterSpacing:'-0.03em', color:'var(--on-surface)' }}>Live Meeting</h2>
          <p style={{ color:'var(--on-surface-variant)', fontSize:13, marginTop:2 }}>
            {recording ? '● Real-time transcription active' : 'Press Start to begin recording'}
          </p>
        </div>
        {/* Timer + controls */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
          background:'rgba(38,37,40,0.7)', backdropFilter:'blur(20px)', borderRadius:40,
          border:'1px solid rgba(72,71,74,0.25)' }}>
          {recording && (
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingRight:16, borderRight:'1px solid rgba(72,71,74,0.25)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--error)' }} className="animate-pulse"/>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--on-surface)', letterSpacing:'0.05em' }}>{fmt(elapsed)}</span>
            </div>
          )}
          
          <button onClick={testAudio} title="Test Mic Access"
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'50%', color:'#fff', cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>mic_none</span>
          </button>
          
          <button onClick={testScreen} title="Test Screen Access"
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'50%', color:'#fff', cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>screen_share</span>
          </button>

          <button onClick={recording ? stopRecording : () => startRecording('Live Meeting')}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px',
              background: recording ? 'linear-gradient(135deg,#a70138,#d73357)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              border:'none', borderRadius:30, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>{recording ? 'stop_circle' : 'mic'}</span>
            {recording ? 'Stop' : 'Start Recording'}
          </button>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, flex:1, minHeight:0 }}>
        {/* Live Transcript */}
        <div style={{ background:'var(--surface-container-low)', borderRadius:20, padding:24,
          display:'flex', flexDirection:'column', minHeight:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            {recording && <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--primary)' }} className="animate-pulse"/>}
            <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--on-surface-variant)', fontWeight:600 }}>
              Live Transcript
            </span>
          </div>
          <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12 }}>
            {transcript.length === 0 ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--on-surface-variant)', fontSize:13 }}>
                {recording ? 'Listening...' : 'Start recording to see live transcript'}
              </div>
            ) : transcript.map((item, i) => (
              <div key={i} style={{ background:'var(--surface-container)', borderRadius:12, padding:'14px 16px',
                border: i===transcript.length-1 ? '1px solid rgba(167,165,255,0.2)' : '1px solid transparent' }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color: COLORS[i % COLORS.length] }}>Speaker</span>
                  <span style={{ fontSize:11, color:'var(--on-surface-variant)' }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ fontSize:14, color:'var(--on-surface)', lineHeight:1.6 }}>{item.text}</p>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:16, minHeight:0 }}>
          {/* Detected Tasks */}
          <div style={{ background:'rgba(96,1,209,0.15)', borderRadius:20, padding:20,
            border:'1px solid rgba(96,1,209,0.25)', flex:1, overflowY:'auto' }}>
            <h3 style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em',
              color:'var(--on-secondary-container)', fontWeight:600, marginBottom:14,
              display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>assignment_turned_in</span>
              Detected Tasks ({tasks.length})
            </h3>
            {tasks.length === 0 ? (
              <p style={{ fontSize:13, color:'var(--on-surface-variant)' }}>No tasks detected yet.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {tasks.slice(0,15).map((t, i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--on-surface-variant)', marginTop:2 }}>radio_button_unchecked</span>
                    <div>
                      <p style={{ fontSize:13, color:'var(--on-surface)', lineHeight:1.4 }}>{t.task}</p>
                      <p style={{ fontSize:11, color:'var(--secondary-dim)', marginTop:2 }}>
                        Assignee: <strong>{t.assignee}</strong> · {Math.round(t.confidence * 100)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rolling Summary */}
          <div style={{ background:'var(--surface-container-high)', borderRadius:20, padding:20,
            border:'1px solid rgba(72,71,74,0.2)' }}>
            <h3 style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em',
              color:'var(--primary)', fontWeight:600, marginBottom:12,
              display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>auto_awesome</span>
              Rolling Summary
            </h3>
            <p style={{ fontSize:13, color:'var(--on-surface-variant)', lineHeight:1.7 }}>
              {summary || 'Summary will appear every 30 seconds during recording.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
