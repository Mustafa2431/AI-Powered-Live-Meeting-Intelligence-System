import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import LiveMeeting from './pages/LiveMeeting'
import Tasks from './pages/Tasks'
import MeetingSummary from './pages/MeetingSummary'
import Settings from './pages/Settings'
import useMeeting from './hooks/useMeeting'
import useScreenshot from './hooks/useScreenshot'

export default function App() {
  const meeting = useMeeting()
  useScreenshot(meeting.recording)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Ambient background blobs */}
      <div className="ambient-bg"><div className="blob1"/><div className="blob2"/></div>

      <Sidebar 
        recording={meeting.recording} 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
      />

      <main 
        className="flex-1 overflow-y-auto relative z-10 transition-all duration-300"
        style={{ marginLeft: isSidebarOpen ? '240px' : '70px' }}
      >
        <Routes>
          <Route path="/"            element={<Dashboard   {...meeting} />} />
          <Route path="/live"        element={<LiveMeeting {...meeting} />} />
          <Route path="/tasks"       element={<Tasks       tasks={meeting.tasks} />} />
          <Route path="/summary"     element={<MeetingSummary meetings={meeting.meetings} openQuestions={meeting.openQuestions} followUps={meeting.followUps} />} />
          <Route path="/settings"    element={<Settings />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
