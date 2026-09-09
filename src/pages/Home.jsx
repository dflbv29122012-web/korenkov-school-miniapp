import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { student } = useAuth()
  const [nextLesson, setNextLesson] = useState(null)
  const [stats, setStats] = useState({ done: 0, hwDone: 0, hwTotal: 0, avgScore: 0 })
  const [lastHw, setLastHw] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const [{ data: lessons }, { data: hwList }] = await Promise.all([
        supabase.from('lessons').select('*').eq('student_id', student.id)
          .gte('starts_at', new Date().toISOString()).order('starts_at').limit(1),
        supabase.from('homework').select('*').eq('student_id', student.id).order('created_at', { ascending: false }),
      ])

      if (cancelled) return

      const done = (hwList ?? []).filter(h => h.status === 'checked')
      const totalTasksSum = done.reduce((s, h) => s + (h.total_tasks || 0), 0)
      const correctSum = done.reduce((s, h) => s + (h.correct_tasks || 0), 0)
      const avg = totalTasksSum > 0 ? Math.round((correctSum / totalTasksSum) * 100) : 0

      const { count: lessonsPassed } = await supabase
        .from('lessons').select('*', { count: 'exact', head: true })
        .eq('student_id', student.id).lt('starts_at', new Date().toISOString())

      setNextLesson(lessons?.[0] ?? null)
      setStats({ done: lessonsPassed ?? 0, hwDone: done.length, hwTotal: (hwList ?? []).length, avgScore: avg })
      setLastHw((hwList ?? [])[0] ?? null)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [student])

  return (
    <div className="screen">
      <div className="home-header">
        <div>
          <h1>Привет, {student?.first_name || 'ученик'} 👋</h1>
          <p className="muted">{student?.grade_level || 'Личный кабинет'}</p>
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
