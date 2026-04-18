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

  // Electron IPC fallback
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onTranscriptUpdate(d => setTranscript(prev => [...prev.slice(-9), d]))
    window.electronAPI.onTaskDetected(d => setTasks(prev => [d, ...prev]))
    window.electronAPI.onSummaryUpdate(d => setSummary(d.text))
    window.electronAPI.onRecordingStatus(d => setRecording(d.recording))
  }, [])

  // Drag support (moves the div within the fullscreen transparent window)
  const onMouseDown = (e) => {
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
          <button onClick={() => setCollapsed(c=>!c)} style={{ background:'none', border:'none', cursor:'pointer', color:'#adaaad', fontSize:18, lineHeight:1 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>{collapsed?'expand_more':'chevron_right'}</span>
          </button>
        </div>

        {!collapsed && (
          <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14, maxHeight:580, overflowY:'auto' }}>
            {/* Live Transcript */}
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

            {/* Tasks */}
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

            {/* Summary */}
            <div style={{ background:'rgba(31,31,34,0.9)', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(72,71,74,0.2)' }}>
              <h3 style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.07em',color:'#a7a5ff',fontWeight:600,marginBottom:8,display:'flex',gap:6 }}>
                <span className="material-symbols-outlined" style={{ fontSize:12 }}>auto_awesome</span>
                Rolling Summary
              </h3>
              <p style={{ fontSize:12,color:'#adaaad',lineHeight:1.6 }}>
                {summary || 'Summary updates every 30s during recording.'}
              </p>
            </div>

            {/* Stop button */}
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
    </div>
  )
}
