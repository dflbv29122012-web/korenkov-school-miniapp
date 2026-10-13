import { useEffect, useState } from 'react'
import { loadBilling, loadPaySettings, autoLocked } from './lib/billing'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DraftProvider } from './context/DraftContext'
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
import TeacherMaterials from './pages/teacher/TeacherMaterials'
import TeacherSettings from './pages/teacher/TeacherSettings'
import TeacherTopics from './pages/teacher/TeacherTopics'
import Topics from './pages/Topics'
import Quizzes from './pages/Quizzes'
import TeacherQuizzes from './pages/teacher/TeacherQuizzes'
import Progress from './pages/Progress'
import Mocks from './pages/Mocks'
import Training from './pages/Training'
import Parent from './pages/Parent'
import TeacherProgress from './pages/teacher/TeacherProgress'
import TeacherMocks from './pages/teacher/TeacherMocks'
import TeacherParentPreview from './pages/teacher/TeacherParentPreview'
import TeacherPayments from './pages/teacher/TeacherPayments'
import './App.css'

// Автозакрытие доступа при просрочке оплаты (если включено учителем)
function useAutoLock(student, isTeacher) {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!student || isTeacher || student.is_parent || !student.access_open) { setLocked(false); return }
    let cancelled = false
    Promise.all([loadPaySettings(), loadBilling(student)])
      .then(([s, b]) => { if (!cancelled) setLocked(autoLocked(b.status, s.lock, student)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [student, isTeacher])
  return locked
}

function AppShell() {
  const { loading, error, student, isTeacher } = useAuth()
  const autoLock = useAutoLock(student, isTeacher)

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
            <Route path="/teacher/materials" element={<TeacherMaterials />} />
            <Route path="/teacher/topics" element={<TeacherTopics />} />
            <Route path="/teacher/quizzes" element={<TeacherQuizzes />} />
            <Route path="/teacher/progress" element={<TeacherProgress />} />
            <Route path="/teacher/mocks" element={<TeacherMocks />} />
            <Route path="/teacher/parent-preview" element={<TeacherParentPreview />} />
            <Route path="/teacher/payments" element={<TeacherPayments />} />
            <Route path="/teacher/settings" element={<TeacherSettings />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        </main>
        <TeacherBottomNav />
      </>
    )
  }

  if (student.is_parent) {
    return <main className="app-content"><Parent /></main>
  }

  if (!student.access_open || autoLock) {
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
          <Route path="/topics" element={<Topics />} />
          <Route path="/quiz" element={<Quizzes />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/mocks" element={<Mocks />} />
          <Route path="/training" element={<Training />} />
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
      <DraftProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </DraftProvider>
    </AuthProvider>
  )
}
