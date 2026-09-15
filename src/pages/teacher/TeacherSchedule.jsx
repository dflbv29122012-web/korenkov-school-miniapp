import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSchedule() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('lessons').select('*, students(first_name,last_name)').order('starts_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (!cancelled) { setLessons(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание занятий</h1></header>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {lessons.length === 0 && <p className="muted">Занятий пока не добавлено. Добавляйте их через Supabase → Table Editor → lessons.</p>}
          {lessons.map(l => (
            <li key={l.id} className="card row-between">
              <div>
                <p className="card-title">{l.topic || l.title}</p>
                <p className="muted">{l.students ? `${l.students.first_name} ${l.students.last_name}` : ''} · {l.subject || ''}</p>
              </div>
              <p className="muted small-text">{new Date(l.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
