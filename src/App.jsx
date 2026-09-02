import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { initTelegramApp } from './lib/telegram'
import BottomNav from './components/BottomNav'
import TeacherBottomNav from './components/TeacherBottomNav'
import Home from './pages/Home'
import Schedule from './pages/Schedule'
import Homework from './pages/Homework'
import Materials from './pages/Materials'
import Payment from './pages/Payment'
import Locked from './pages/Locked'
import TeacherStudents from './pages/teacher/TeacherStudents'
import TeacherSchedule from './pages/teacher/TeacherSchedule'
import TeacherHomework from './pages/teacher/TeacherHomework'
import TeacherAnalytics from './pages/teacher/TeacherAnalytics'
import TeacherSettings from './pages/teacher/TeacherSettings'
import './App.css'

function AppShell() {
  const { loading, error, student, isTeacher } = useAuth()

  useEffect(() => { initTelegramApp() }, [])

  if (error === 'not_in_telegram') {
    return <div className="screen center-screen"><p>Открой это приложение через кнопку в Telegram-боте 🤖</p></div>
  }
  if (error) {
    return <div className="screen center-screen"><p>Не удалось загрузить данные: {error}</p></div>
  }
  if (loading || !student) {
    return <div className="screen center-screen"><p>Загрузка…</p></div>
  }

  if (isTeacher) {
    return (
      <>
        <main className="app-content">
          <Routes>
            <Route path="/teacher" element={<TeacherStudents />} />
            <Route path="/teacher/schedule" element={<TeacherSchedule />} />
            <Route path="/teacher/homework" element={<TeacherHomework />} />
            <Route path="/teacher/analytics" element={<TeacherAnalytics />} />
            <Route path="/teacher/settings" element={<TeacherSettings />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        </main>
        <TeacherBottomNav />
      </>
    )
  }

  if (!student.access_open) {
    return <main className="app-content"><Locked /></main>
  }

  return (
    <>
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </AuthProvider>
  )
}
