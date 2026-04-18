/**
 * useMeeting.js
 * Central hook – talks to backend via SSE + REST.
 * Exposes: recording state, transcript lines, tasks, summary.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'http://localhost:3001'

export default function useMeeting() {
  const [recording, setRecording]     = useState(false)
  const [transcript, setTranscript]   = useState([])   // [{text, timestamp}]
  const [tasks, setTasks]             = useState([])    // [{task,assignee,confidence,timestamp}]
  const [summary, setSummary]         = useState('')
  const [openQuestions, setOpenQuestions] = useState([]) // [{question, timestamp}]
  const [followUps, setFollowUps]         = useState([]) // [{suggestion, context, timestamp}]
  const [meetings, setMeetings]       = useState([])
  const esRef = useRef(null)

  // ── Subscribe to SSE ─────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${API}/events`)
    esRef.current = es

    es.addEventListener('transcript', (e) => {
      const data = JSON.parse(e.data)
      setTranscript(prev => [...prev.slice(-49), data])   // keep last 50
    })
    es.addEventListener('task', (e) => {
      const data = JSON.parse(e.data)
      setTasks(prev => [data, ...prev])
    })
    es.addEventListener('summary', (e) => {
      const data = JSON.parse(e.data)
      setSummary(data.text)
    })
    es.addEventListener('status', (e) => {
      const data = JSON.parse(e.data)
      setRecording(data.recording)
    })
    es.addEventListener('open-question', (e) => {
      const data = JSON.parse(e.data)
      setOpenQuestions(prev => [...prev, data])
    })
    es.addEventListener('follow-up', (e) => {
      const data = JSON.parse(e.data)
      setFollowUps(prev => [...prev, data])
    })
    es.addEventListener('error', (e) => {
      const data = JSON.parse(e.data)
      alert('⚠️ Transcription Error: ' + data.message)
    })

    return () => es.close()
  }, [])

  // Also listen to Electron IPC if available (for overlay window)
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub1 = window.electronAPI.onTranscriptUpdate((d) =>
      setTranscript(prev => [...prev.slice(-49), d]))
    const unsub2 = window.electronAPI.onTaskDetected((d) =>
      setTasks(prev => [d, ...prev]))
    const unsub3 = window.electronAPI.onSummaryUpdate((d) =>
      setSummary(d.text))
    const unsub4 = window.electronAPI.onRecordingStatus((d) =>
      setRecording(d.recording))
    return () => { unsub1?.(); unsub2?.(); unsub3?.(); unsub4?.() }
  }, [])

  // ── Load past meetings ────────────────────────────────────────────────────
  const loadMeetings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/meetings`)
      setMeetings(await r.json())
    } catch (_) {}
  }, [])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  // ── Start / Stop ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async (title = 'New Meeting') => {
    try {
      await fetch(`${API}/recording/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setTranscript([])
      setTasks([])
      setSummary('')
      setOpenQuestions([])
      setFollowUps([])
      loadMeetings()
    } catch (_) {}
    // Also notify Electron main
    window.electronAPI?.startRecording()
  }, [loadMeetings])

  const stopRecording = useCallback(async () => {
    try {
      await fetch(`${API}/recording/stop`, { method: 'POST' })
      loadMeetings()
    } catch (_) {}
    window.electronAPI?.stopRecording()
  }, [loadMeetings])

  return { recording, transcript, tasks, summary, openQuestions, followUps, meetings, startRecording, stopRecording, loadMeetings }
}
