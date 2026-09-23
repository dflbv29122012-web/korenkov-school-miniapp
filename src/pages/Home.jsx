import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { student, refreshStudent } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [nameForm, setNameForm] = useState({ first_name: '', last_name: '' })
  const [savingName, setSavingName] = useState(false)
  const [nextLesson, setNextLesson] = useState(null)
  const [stats, setStats] = useState({ done: 0, hwDone: 0, hwTotal: 0, avgScore: 0 })
  const [lastHw, setLastHw] = useState(null)
  const [topicProgress, setTopicProgress] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) return
    let cancelled = false

    async function load() {
      setLoading(true)

      const { data: groupLinks } = await supabase.from('student_groups').select('group_id').eq('student_id', student.id)
      const groupIds = (groupLinks ?? []).map(g => g.group_id)
      const nowIso = new Date().toISOString()

      let lessonsQuery = supabase.from('lessons').select('*').gte('starts_at', nowIso).order('starts_at').limit(1)
      lessonsQuery = groupIds.length > 0
        ? lessonsQuery.or(`student_id.eq.${student.id},group_id.in.(${groupIds.join(',')})`)
        : lessonsQuery.eq('student_id', student.id)

      const [{ data: lessons }, { data: hwList }] = await Promise.all([
        lessonsQuery,
        supabase.from('homework').select('*').eq('student_id', student.id).order('created_at', { ascending: false }),
      ])

      if (cancelled) return

      const done = (hwList ?? []).filter(h => h.status === 'checked')
      const totalTasksSum = done.reduce((s, h) => s + (h.total_tasks || 0), 0)
      const correctSum = done.reduce((s, h) => s + (h.correct_tasks || 0), 0)
      const avg = totalTasksSum > 0 ? Math.round((correctSum / totalTasksSum) * 100) : 0

      let passedQuery = supabase.from('lessons').select('*', { count: 'exact', head: true }).lt('starts_at', nowIso)
      passedQuery = groupIds.length > 0
        ? passedQuery.or(`student_id.eq.${student.id},group_id.in.(${groupIds.join(',')})`)
        : passedQuery.eq('student_id', student.id)
      const { count: lessonsPassed } = await passedQuery

      setNextLesson(lessons?.[0] ?? null)
      setStats({ done: lessonsPassed ?? 0, hwDone: done.length, hwTotal: (hwList ?? []).length, avgScore: avg })
      setLastHw((hwList ?? [])[0] ?? null)

      // Прогресс по темам (номерам ЕГЭ) на основе проверенных ДЗ
      const checkedWithTopic = done.filter(h => h.topic_id)
      const byTopic = {}
      checkedWithTopic.forEach(h => {
        if (!byTopic[h.topic_id]) byTopic[h.topic_id] = { correct: 0, total: 0 }
        byTopic[h.topic_id].correct += h.correct_tasks || 0
        byTopic[h.topic_id].total += h.total_tasks || 0
      })
      const topicIds = Object.keys(byTopic)
      if (topicIds.length > 0) {
        const { data: topicRows } = await supabase.from('topics').select('id, name').in('id', topicIds)
        const progress = (topicRows ?? []).map(t => ({
          name: t.name,
          pct: byTopic[t.id].total > 0 ? Math.round((byTopic[t.id].correct / byTopic[t.id].total) * 100) : 0,
        })).sort((a, b) => b.pct - a.pct)
        setTopicProgress(progress)
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [student])

  async function saveName() {
    if (!nameForm.first_name.trim()) return
    setSavingName(true)
    await supabase.from('students').update({
      first_name: nameForm.first_name.trim(),
      last_name: nameForm.last_name.trim() || null,
    }).eq('id', student.id)
    setSavingName(false)
    setEditingName(false)
    refreshStudent()
  }

  return (
    <div className="screen">
      <div className="home-header">
        <div>
          {editingName ? (
            <div className="card" style={{ margin: '0 0 8px' }}>
              <input className="text-input" placeholder="Имя" value={nameForm.first_name}
                onChange={e => setNameForm({ ...nameForm, first_name: e.target.value })} />
              <input className="text-input" placeholder="Фамилия" value={nameForm.last_name}
                onChange={e => setNameForm({ ...nameForm, last_name: e.target.value })} />
              <div className="btn-row">
                <button className="btn-primary" disabled={savingName} onClick={saveName}>{savingName ? 'Сохранение…' : 'Сохранить'}</button>
                <button className="btn-secondary" onClick={() => setEditingName(false)}>Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <h1>
                Привет, {student?.first_name || 'ученик'} 👋{' '}
                <button
                  className="edit-name-btn"
                  onClick={() => { setNameForm({ first_name: student?.first_name || '', last_name: student?.last_name || '' }); setEditingName(true) }}
                >✏️</button>
              </h1>
              <p className="muted">{student?.grade_level || 'Личный кабинет'}</p>
            </>
          )}
        </div>
        <div className="avatar-circle">{(student?.first_name?.[0] || '?').toUpperCase()}</div>
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <>
          <section className="card highlight-card">
            <p className="eyebrow">Следующее занятие</p>
            {nextLesson ? (
              <>
                <p className="card-title-lg">{nextLesson.topic || nextLesson.title}</p>
                <p className="muted">
                  📅 {new Date(nextLesson.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{nextLesson.duration_minutes} минут
                  {nextLesson.group_id ? ' · 👥 группа' : ''}
                </p>
                <div className="btn-row">
                  <button className="btn-primary">📹 Подключиться</button>
                  <Link to="/materials" className="btn-secondary">📄 Конспект</Link>
                </div>
              </>
            ) : <p className="muted">Занятий не запланировано</p>}
          </section>

          <div className="stat-row">
            <div className="stat-box"><span className="stat-num green">{stats.done}</span><span className="stat-label">Занятий пройдено</span></div>
            <div className="stat-box"><span className="stat-num yellow">{stats.hwDone}/{stats.hwTotal}</span><span className="stat-label">ДЗ сдано</span></div>
            <div className="stat-box"><span className="stat-num blue">{stats.avgScore}%</span><span className="stat-label">Средний балл</span></div>
          </div>

          {topicProgress.length > 0 && (
            <section className="card">
              <p className="eyebrow">Прогресс по номерам</p>
              {topicProgress.map((t, i) => (
                <div key={i} className="progress-item">
                  <div className="row-between">
                    <span className="card-title small">{t.name}</span>
                    <span className="muted">{t.pct}%</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${t.pct}%` }} /></div>
                </div>
              ))}
            </section>
          )}

          {lastHw && (
            <section className="card">
              <p className="eyebrow">Последнее ДЗ</p>
              <div className="row-between">
                <div>
                  <p className="card-title">{lastHw.title}</p>
                  <p className="muted">Сдано {lastHw.created_at ? new Date(lastHw.created_at).toLocaleDateString('ru-RU') : ''}</p>
                </div>
                {lastHw.status === 'checked' && <span className="badge badge-checked">Проверено</span>}
              </div>
              {lastHw.total_tasks && (
                <p className="score-line">{lastHw.correct_tasks}/{lastHw.total_tasks} <span className="muted">задач верно</span></p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
