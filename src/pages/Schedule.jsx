import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Calendar from '../components/Calendar'
import { AttachmentList } from '../components/FileUploader'


export default function Schedule() {
  const { student } = useAuth()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    if (!student) return
    let cancelled = false
    async function load() {
      const { data: gl } = await supabase.from('student_groups').select('group_id').eq('student_id', student.id)
      const gids = (gl ?? []).map(g => g.group_id)
      const scope = [`student_id.eq.${student.id}`, 'for_all.eq.true']
      if (gids.length) scope.push(`group_id.in.(${gids.join(',')})`)
      const { data } = await supabase.from('lessons').select('*').or(scope.join(',')).order('starts_at')
      if (!cancelled) { setLessons(data ?? []); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [student])

  const now = new Date()
  const dayLessons = selectedDay ? lessons.filter(l => new Date(l.starts_at).toDateString() === selectedDay) : null
  const upcoming = lessons.filter(l => new Date(l.starts_at) >= now)
  const past = lessons.filter(l => new Date(l.starts_at) < now).reverse()

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание</h1></header>
      <Calendar dates={new Set(lessons.map(l => new Date(l.starts_at).toDateString()))}
        selected={selectedDay} onSelect={setSelectedDay} />

      {loading ? <p className="muted">Загрузка…</p> : dayLessons ? (
        <>
          <p className="eyebrow">{new Date(selectedDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>
          <ul className="card-list">
            {dayLessons.length === 0 && <p className="muted">В этот день занятий нет</p>}
            {dayLessons.map(l => <LessonRow key={l.id} lesson={l} />)}
          </ul>
        </>
      ) : (
        <>
          <p className="eyebrow">Предстоящие занятия</p>
          <ul className="card-list">
            {upcoming.length === 0 && <p className="muted">Пока ничего не запланировано</p>}
            {upcoming.map(l => <LessonRow key={l.id} lesson={l} />)}
          </ul>
          <p className="eyebrow">Прошедшие занятия</p>
          <ul className="card-list">
            {past.length === 0 && <p className="muted">Истории пока нет</p>}
            {past.map(l => <LessonRow key={l.id} lesson={l} />)}
          </ul>
        </>
      )}
    </div>
  )
}

function LessonRow({ lesson }) {
  return (
    <li className="card">
      <div className="row-between">
        <div>
          <p className="card-title">{lesson.topic || lesson.title}</p>
          <p className="muted">{lesson.subject || ''} · {lesson.duration_minutes || 60} мин {lesson.group_id ? '· 👥 группа' : ''}</p>
        </div>
        <p className="muted small-text" style={{ textAlign: 'right' }}>
          {new Date(lesson.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          <br />{new Date(lesson.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {(lesson.meeting_url || lesson.board_url) && (
        <div className="btn-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          {lesson.meeting_url && <a href={lesson.meeting_url} target="_blank" rel="noreferrer" className="btn-primary">🎥 Подключиться</a>}
          {lesson.board_url && <a href={lesson.board_url} target="_blank" rel="noreferrer" className="btn-secondary">🖊 Доска</a>}
        </div>
      )}
      {lesson.notes_attachments?.length > 0 && <p className="eyebrow">Конспект</p>}
      <AttachmentList items={lesson.notes_attachments} compact />
    </li>
  )
}
