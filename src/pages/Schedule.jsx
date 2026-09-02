import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

export default function Schedule() {
  const { student } = useAuth()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(new Date())

  useEffect(() => {
    if (!student) return
    let cancelled = false
    supabase.from('lessons').select('*').eq('student_id', student.id).order('starts_at')
      .then(({ data }) => { if (!cancelled) { setLessons(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [student])

  const days = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const startOffset = (first.getDay() + 6) % 7 // Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [cursor])

  const lessonDates = new Set(lessons.map(l => new Date(l.starts_at).toDateString()))
  const now = new Date()
  const upcoming = lessons.filter(l => new Date(l.starts_at) >= now)
  const past = lessons.filter(l => new Date(l.starts_at) < now).reverse()

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание</h1></header>

      <section className="card calendar-card">
        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <p className="calendar-title">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
          <button className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="calendar-grid weekdays">
          {WEEKDAYS.map(w => <span key={w} className="muted">{w}</span>)}
        </div>
        <div className="calendar-grid">
          {days.map((d, i) => {
            if (!d) return <span key={i} />
            const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
            const isToday = date.toDateString() === now.toDateString()
            const hasLesson = lessonDates.has(date.toDateString())
            return (
              <div key={i} className={'calendar-day' + (isToday ? ' today' : '')}>
                {d}
                {hasLesson && <span className="calendar-dot" />}
              </div>
            )
          })}
        </div>
      </section>

      {loading ? <p className="muted">Загрузка…</p> : (
        <>
          <p className="eyebrow">Предстоящие занятия</p>
          <ul className="card-list">
            {upcoming.length === 0 && <p className="muted">Пока ничего не запланировано</p>}
            {upcoming.map(l => <LessonRow key={l.id} lesson={l} />)}
          </ul>

          <p className="eyebrow">Прошедшие занятия</p>
          <ul className="card-list">
            {past.length === 0 && <p className="muted">Истории пока нет</p>}
            {past.map(l => <LessonRow key={l.id} lesson={l} past />)}
          </ul>
        </>
      )}
    </div>
  )
}

function LessonRow({ lesson, past }) {
  return (
    <li className="card row-between">
      <div>
        <p className="card-title">{lesson.topic || lesson.title}</p>
        <p className="muted">{lesson.subject || ''} · {lesson.duration_minutes || 60} мин</p>
      </div>
      <p className="muted small-text">
        {new Date(lesson.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        <br />{new Date(lesson.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </li>
  )
}
