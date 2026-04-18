import React, { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:3001'

export default function Overlay() {
  const [transcript, setTranscript] = useState([])
  const [tasks, setTasks]           = useState([])
  const [summary, setSummary]       = useState('')
  const [recording, setRecording]   = useState(false)
  const [collapsed, setCollapsed]   = useState(false)
  const [dragging, setDragging]     = useState(false)
  const [pos, setPos]               = useState({ x: window.innerWidth - 360, y: 40 })
  const dragStart = useRef(null)

  // Region capture state
  const [selectingRegion, setSelectingRegion] = useState(false)
  const [selectionRect, setSelectionRect]     = useState(null)
  const [monitoring, setMonitoring]           = useState(false)
  const [captureCount, setCaptureCount]       = useState(0)
  const selectionStart = useRef(null)
  const isDrawing = useRef(false)

  // ── SSE subscription ────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${API}/events`)
    es.addEventListener('transcript', e => {
      const d = JSON.parse(e.data)
      setTranscript(prev => [...prev.slice(-9), d])
    })
    es.addEventListener('task', e => setTasks(prev => [JSON.parse(e.data), ...prev]))
    es.addEventListener('summary', e => setSummary(JSON.parse(e.data).text))
    es.addEventListener('status', e => setRecording(JSON.parse(e.data).recording))
    return () => es.close()
  }, [])

  // ── Electron IPC fallback ───────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onTranscriptUpdate(d => setTranscript(prev => [...prev.slice(-9), d]))
    window.electronAPI.onTaskDetected(d => setTasks(prev => [d, ...prev]))
    window.electronAPI.onSummaryUpdate(d => setSummary(d.text))
    window.electronAPI.onRecordingStatus(d => setRecording(d.recording))
  }, [])

  // ── Region screenshot listener ──────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onRegionScreenshot) return
    const unsub = window.electronAPI.onRegionScreenshot(() => {
      setCaptureCount(prev => prev + 1)
    })
    return unsub
  }, [])

  // ── Escape key to cancel selection ──────────────────────────────
  useEffect(() => {
    if (!selectingRegion) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectingRegion(false)
        setSelectionRect(null)
        isDrawing.current = false
        window.electronAPI?.setOverlayInteractive(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectingRegion])

  // ── Panel drag logic ────────────────────────────────────────────
  const onMouseDown = (e) => {
    if (selectingRegion) return
    setDragging(true)
    dragStart.current = { clientX: e.clientX, clientY: e.clientY }
  }
  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const dx = e.clientX - dragStart.current.clientX
      const dy = e.clientY - dragStart.current.clientY
      dragStart.current = { clientX: e.clientX, clientY: e.clientY }
      setPos(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  // ── Region selection handlers ───────────────────────────────────
  const enterSelectionMode = () => {
    setSelectingRegion(true)
    setSelectionRect(null)
    window.electronAPI?.setOverlayInteractive(true)
  }

  const handleSelectionMouseDown = (e) => {
    e.preventDefault()
    isDrawing.current = true
    selectionStart.current = { x: e.clientX, y: e.clientY }
    setSelectionRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
  }

  const handleSelectionMouseMove = (e) => {
    if (!isDrawing.current || !selectionStart.current) return
    const s = selectionStart.current
    setSelectionRect({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    })
  }

  const handleSelectionMouseUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    setSelectingRegion(false)
    window.electronAPI?.setOverlayInteractive(false)

    if (selectionRect && selectionRect.width > 20 && selectionRect.height > 20) {
      setMonitoring(true)
      setCaptureCount(0)
      window.electronAPI?.startRegionCapture(selectionRect)
    } else {
      setSelectionRect(null)
    }
  }

  const stopMonitoringRegion = () => {
    setMonitoring(false)
    setSelectionRect(null)
    setCaptureCount(0)
    window.electronAPI?.stopRegionCapture()
  }

  const handleCloseOverlay = () => {
    window.electronAPI?.hideOverlay()
  }

  const panelStyle = {
    width: 320, borderRadius: 16, overflow: 'hidden',
    background: 'rgba(38,37,40,0.85)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(72,71,74,0.3)',
    boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05)',
    fontFamily: 'Inter, sans-serif',
    color: '#f9f5f8',
    userSelect: 'none',
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {/* ── Selection mode overlay ── */}
      {selectingRegion && (
        <div
          onMouseDown={handleSelectionMouseDown}
          onMouseMove={handleSelectionMouseMove}
          onMouseUp={handleSelectionMouseUp}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000,
            background: 'rgba(0,0,0,0.05)',
            cursor: 'crosshair',
          }}
        >
          {/* Instruction pill */}
          <div style={{
            position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(38,37,40,0.92)', backdropFilter: 'blur(16px)',
            padding: '10px 20px', borderRadius: 12,
            border: '1px solid rgba(167,165,255,0.3)',
            fontSize: 13, color: '#f9f5f8', fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#a7a5ff' }}>crop_free</span>
            Drag to select a region
            <span style={{ color: '#666', margin: '0 4px' }}>·</span>
            <span style={{ color: '#adaaad' }}>ESC to cancel</span>
          </div>

          {/* Selection rectangle */}
          {selectionRect && selectionRect.width > 0 && (
            <div style={{
              position: 'absolute',
              left: selectionRect.x, top: selectionRect.y,
              width: selectionRect.width, height: selectionRect.height,
              border: '2px solid rgba(167,165,255,0.8)',
              background: 'transparent',
              borderRadius: 4,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}>
              {/* Corner handles */}
              <div style={{ position:'absolute', top:-3, left:-3, width:8, height:8, border:'2px solid #a7a5ff', borderRight:'none', borderBottom:'none' }}/>
              <div style={{ position:'absolute', top:-3, right:-3, width:8, height:8, border:'2px solid #a7a5ff', borderLeft:'none', borderBottom:'none' }}/>
              <div style={{ position:'absolute', bottom:-3, left:-3, width:8, height:8, border:'2px solid #a7a5ff', borderRight:'none', borderTop:'none' }}/>
              <div style={{ position:'absolute', bottom:-3, right:-3, width:8, height:8, border:'2px solid #a7a5ff', borderLeft:'none', borderTop:'none' }}/>

              {/* Dimension label */}
              <div style={{
                position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(38,37,40,0.92)', padding: '3px 10px', borderRadius: 6,
                fontSize: 11, color: '#a7a5ff', whiteSpace: 'nowrap',
                fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em',
                border: '1px solid rgba(167,165,255,0.2)',
              }}>
                {Math.round(selectionRect.width)} × {Math.round(selectionRect.height)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Intelligence Panel ── */}
      {!selectingRegion && (
        <div
          style={{ ...panelStyle, position: 'absolute', left: pos.x, top: pos.y, zIndex: 9999 }}
          onMouseEnter={() => window.electronAPI?.setOverlayInteractive(true)}
          onMouseLeave={() => window.electronAPI?.setOverlayInteractive(false)}
        >
          {/* Drag handle / header */}
          <div onMouseDown={onMouseDown} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', cursor: dragging ? 'grabbing' : 'grab', borderBottom:'1px solid rgba(72,71,74,0.25)',
            background:'rgba(255,255,255,0.03)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {recording && <span style={{ width:8,height:8,borderRadius:'50%',background:'#ff6e84',animation:'pulse 2s infinite' }}/>}
              <span style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#adaaad' }}>
                Intelligence Panel
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:2 }}>
              <button onClick={() => setCollapsed(c=>!c)} style={{ background:'none', border:'none', cursor:'pointer', color:'#adaaad', lineHeight:1, padding:4, borderRadius:6, display:'flex', alignItems:'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>{collapsed?'expand_more':'chevron_right'}</span>
              </button>
              <button onClick={handleCloseOverlay} style={{ background:'none', border:'none', cursor:'pointer', color:'#adaaad', lineHeight:1, padding:4, borderRadius:6, display:'flex', alignItems:'center' }}
                onMouseEnter={e => e.currentTarget.style.color='#ff6e84'}
                onMouseLeave={e => e.currentTarget.style.color='#adaaad'}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>close</span>
              </button>
            </div>
          </div>

          {!collapsed && (
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14, maxHeight:580, overflowY:'auto' }}>

              {/* ── Region Monitor ── */}
              <div style={{
                background: monitoring ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)',
                borderRadius: 12, padding: '10px 14px',
                border: `1px solid ${monitoring ? 'rgba(16,185,129,0.25)' : 'rgba(72,71,74,0.2)'}`,
              }}>
                {monitoring ? (
                  <>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} className="animate-pulse"/>
                        <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', color:'#10b981', fontWeight:600 }}>
                          Monitoring Region
                        </span>
                      </div>
                      <span style={{ fontSize:11, color:'#adaaad', fontVariantNumeric:'tabular-nums' }}>
                        {captureCount} capture{captureCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'#adaaad', marginBottom:10 }}>
                      {selectionRect && `${Math.round(selectionRect.width)}×${Math.round(selectionRect.height)}px`} · Auto-capturing on visual changes
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={enterSelectionMode} style={{
                        flex:1, padding:'7px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(72,71,74,0.3)',
                        borderRadius:8, color:'#adaaad', fontSize:11, fontWeight:500, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize:13 }}>crop_free</span>
                        Reselect
                      </button>
                      <button onClick={stopMonitoringRegion} style={{
                        flex:1, padding:'7px', background:'rgba(167,42,42,0.12)', border:'1px solid rgba(255,110,132,0.25)',
                        borderRadius:8, color:'#ff6e84', fontSize:11, fontWeight:500, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize:13 }}>stop_circle</span>
                        Stop
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={enterSelectionMode} style={{
                    width:'100%', padding:'6px', background:'none', border:'none',
                    color:'#adaaad', fontSize:12, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize:15, color:'#a7a5ff' }}>crop_free</span>
                    Select Region to Monitor
                  </button>
                )}
              </div>

              {/* ── Live Transcript ── */}
              <div>
                <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:8 }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:'#a7a5ff' }} className="animate-pulse"/>
                  <span style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.07em',color:'#adaaad',fontWeight:600 }}>Live Transcript</span>
                </div>
                {transcript.length === 0 ? (
                  <p style={{ fontSize:12,color:'#adaaad' }}>{recording?'Listening...':'Not recording'}</p>
                ) : transcript.slice(-3).map((item, i) => (
                  <div key={i} style={{ background:'rgba(25,25,28,0.8)', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                    <p style={{ fontSize:13, color:'#f9f5f8', lineHeight:1.5 }}>{item.text}</p>
                    <p style={{ fontSize:10, color:'#adaaad', marginTop:4 }}>{new Date(item.timestamp).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>

              {/* ── Tasks ── */}
              <div style={{ background:'rgba(96,1,209,0.2)', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(96,1,209,0.25)' }}>
                <h3 style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.07em',color:'#e1d0ff',fontWeight:600,marginBottom:10,display:'flex',gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:12 }}>assignment_turned_in</span>
                  Detected Tasks ({tasks.length})
                </h3>
                {tasks.slice(0,5).map((t, i) => (
                  <div key={i} style={{ display:'flex',gap:8,alignItems:'flex-start',marginBottom:8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:14,color:'#adaaad',marginTop:1 }}>radio_button_unchecked</span>
                    <div>
                      <p style={{ fontSize:12,color:'#f9f5f8',lineHeight:1.4 }}>{t.task}</p>
                      <p style={{ fontSize:10,color:'#8a4cfc',marginTop:2 }}>{t.assignee}</p>
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p style={{ fontSize:12,color:'#adaaad' }}>No tasks yet</p>}
              </div>

              {/* ── Summary ── */}
              <div style={{ background:'rgba(31,31,34,0.9)', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(72,71,74,0.2)' }}>
                <h3 style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.07em',color:'#a7a5ff',fontWeight:600,marginBottom:8,display:'flex',gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:12 }}>auto_awesome</span>
                  Rolling Summary
                </h3>
                <p style={{ fontSize:12,color:'#adaaad',lineHeight:1.6 }}>
                  {summary || 'Summary updates every 30s during recording.'}
                </p>
              </div>

              {/* ── Stop button ── */}
              {recording && (
                <button onClick={async () => { await fetch(`${API}/recording/stop`,{method:'POST'}) }}
                  style={{ width:'100%', padding:'10px', background:'linear-gradient(135deg,#a70138,#d73357)',
                    border:'none', borderRadius:10, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16 }}>stop_circle</span>
                  Stop Recording
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
