import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Schedule from './pages/Schedule'
import Homework from './pages/Homework'
import Materials from './pages/Materials'
import Payment from './pages/Payment'
import TeacherPanel from './pages/TeacherPanel'
import Locked from './pages/Locked'
import './App.css'

const TEACHER_TG_ID = parseInt(import.meta.env.VITE_TEACHER_TG_ID || '0')

export default function App() {
  const [page, setPage] = useState('home')
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isTeacher, setIsTeacher] = useState(false)

  useEffect(() => {
    initApp()
  }, [])

  async function initApp() {
    // Получаем данные из Telegram WebApp
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
    }

    const tgUser = tg?.initDataUnsafe?.user
    const urlParams = new URLSearchParams(window.location.search)
    const isTeacherMode = urlParams.get('teacher') === '1'

    if (!tgUser && !isTeacherMode) {
      // Для разработки — тестовый пользователь
      setStudent({ name: 'Тест', access_granted: true, telegram_id: 0 })
      setLoading(false)
      return
    }

    if (isTeacherMode) {
      setIsTeacher(true)
      setPage('teacher')
      setLoading(false)
      return
    }

    // Ищем или создаём ученика
    const tgId = tgUser.id
    let { data: existing } = await supabase
      .from('students')
      .select('*, student_groups(group_id, groups(*))')
      .eq('telegram_id', tgId)
      .single()

    if (!existing) {
      const { data: created } = await supabase
        .from('students')
        .insert({ telegram_id: tgId, name: tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : ''), username: tgUser.username })
        .select()
        .single()
      existing = created
    }

    setStudent(existing)
    setIsTeacher(tgId === TEACHER_TG_ID)
    setLoading(false)
  }

  if (loading) return (
    <div className="loading">
      <div className="spinner" />
      <p>Загрузка...</p>
    </div>
  )

  if (!student?.access_granted && !isTeacher) {
    return <Locked student={student} />
  }

  const navItems = isTeacher
    ? [
        { id: 'teacher', icon: '👥', label: 'Ученики' },
        { id: 'schedule', icon: '📅', label: 'Расписание' },
        { id: 'homework', icon: '📝', label: 'ДЗ' },
      ]
    : [
        { id: 'home', icon: '🏠', label: 'Главная' },
        { id: 'schedule', icon: '📅', label: 'Расписание' },
        { id: 'homework', icon: '📝', label: 'ДЗ' },
        { id: 'materials', icon: '📚', label: 'Материалы' },
        { id: 'payment', icon: '💳', label: 'Оплата' },
      ]

  const renderPage = () => {
    switch (page) {
      case 'home': return <Home student={student} setPage={setPage} />
      case 'schedule': return <Schedule student={student} isTeacher={isTeacher} />
      case 'homework': return <Homework student={student} isTeacher={isTeacher} />
      case 'materials': return <Materials student={student} />
      case 'payment': return <Payment student={student} />
      case 'teacher': return <TeacherPanel />
      default: return <Home student={student} setPage={setPage} />
    }
  }

  return (
    <div className="app">
      <div className="page-content">
        {renderPage()}
      </div>
      <nav className="bottom-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
