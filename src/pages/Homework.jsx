import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'checked', label: 'Сдано ✅' },
  { key: 'assigned', label: 'Не сдано ⏳' },
  { key: 'submitted', label: 'Проверяется' },
]

export default function Homework() {
  const { student } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!student) return
    let cancelled = false
    supabase.from('homework').select('*').eq('student_id', student.id).order('due_date', { ascending: false })
      .then(({ data }) => { if (!cancelled) { setItems(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [student])

  const filtered = filter === 'all' ? items : items.filter(h => h.status === filter)
  const current = items.find(h => h.status === 'assigned')
  const notDone = items.filter(h => h.status !== 'checked').length

  function statusTag(hw) {
    const overdue = hw.due_date && new Date(hw.due_date) < new Date() && hw.status !== 'checked'
    if (overdue) return <span className="tag tag-red">✕ Просроч.</span>
    if (hw.status === 'checked') return <span className="score-badge">{hw.correct_tasks ?? '—'}/{hw.total_tasks ?? '—'}</span>
    if (hw.status === 'submitted') return <span className="tag tag-blue">На проверке</span>
    return <span className="tag tag-yellow">⏳ Ждём</span>
  }

  return (
    <div className="screen">
      <div className="row-between">
        <h1>Домашние задания</h1>
        {notDone > 0 && <span className="tag tag-yellow">{notDone} не сдано</span>}
      </div>

      <div className="filter-row">
        {FILTERS.map(f => (
          <button key={f.key} className={'filter-chip' + (filter === f.key ? ' active' : '')} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {filtered.length === 0 && <p className="muted">Ничего не найдено</p>}
          {filtered.map(hw => (
            <li key={hw.id} className="card">
              <div className="row-between">
                <div>
                  <p className="card-title">{hw.title}</p>
                  <p className="muted">{hw.description || ''} {hw.due_date ? `· До ${new Date(hw.due_date).toLocaleDateString('ru-RU')}` : ''}</p>
                </div>
                {statusTag(hw)}
              </div>
              {hw.status === 'checked' && hw.feedback && <p className="muted small-text">💬 {hw.feedback}</p>}
              {hw.review_video_url && (
                <a className="link" href={hw.review_video_url} target="_blank" rel="noreferrer">🎬 Видео-разбор</a>
              )}
            </li>
          ))}
        </ul>
      )}

      {current && (
        <section className="card highlight-card">
          <p className="eyebrow">Текущее задание</p>
          <div className="row-between">
            <p className="card-title-lg">{current.title}</p>
            {current.due_date && <span className="tag tag-yellow">До {new Date(current.due_date).toLocaleDateString('ru-RU')}</span>}
          </div>
          <p className="muted">{current.total_tasks ? `${current.total_tasks} задач · ` : ''}{current.description}</p>
          {current.trainer_url ? (
            <a href={current.trainer_url} target="_blank" rel="noreferrer" className="btn-primary block">▶ Открыть тренажёр</a>
          ) : (
            <button className="btn-primary block" disabled>▶ Тренажёр скоро появится</button>
          )}
        </section>
      )}
    </div>
  )
}
