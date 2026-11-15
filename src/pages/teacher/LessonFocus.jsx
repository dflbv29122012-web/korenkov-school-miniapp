import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchAll, numberOf } from '../../lib/progress'
import { AttachmentList } from '../../components/FileUploader'

const DAY = 864e5
const WINDOW_DAYS = 14
const HOUR = 3600e3

// Задачи, на которых группа ошибается прямо сейчас: последняя попытка ученика за 14 дней — неверная.
export function focusByGroup({ groups, links, attempts, tasks, topics, students, now = Date.now() }) {
  const since = now - WINDOW_DAYS * DAY
  const last = {} // student|task -> последняя попытка
  attempts.forEach(a => {
    if (new Date(a.created_at).getTime() < since) return
    const k = a.student_id + '|' + a.task_id
    if (!last[k] || a.created_at > last[k].created_at) last[k] = a
  })
  const taskById = Object.fromEntries(tasks.map(t => [t.id, t]))
  const topicById = Object.fromEntries(topics.map(t => [t.id, t]))
  const nameOf = Object.fromEntries(students.map(s => [s.id, s.first_name || 'Ученик']))
  return groups.map(g => {
    const members = links.filter(l => l.group_id === g.id).map(l => l.student_id).filter(id => nameOf[id])
    const wrong = {}
    members.forEach(sid => {
      Object.values(last).forEach(a => {
        if (a.student_id !== sid || a.is_correct) return
        ;(wrong[a.task_id] ||= []).push(sid)
      })
    })
    const need = members.length >= 3 ? 2 : 1
    const rows = Object.entries(wrong)
      .filter(([tid, who]) => who.length >= need && taskById[tid])
      .map(([tid, who]) => {
        const t = taskById[tid]
        const topic = topicById[t.topic_id]
        const num = numberOf(topic?.name)
        return { task: t, who: who.map(id => nameOf[id]), label: (num ? `№${num}` : topic?.name || 'Задача') + ` · задача ${t.position ?? ''}`.trimEnd() }
      })
      .sort((a, b) => b.who.length - a.who.length)
      .slice(0, 6)
    return { group: g, size: members.length, rows }
  }).filter(x => x.rows.length)
}

export default function LessonFocus() {
  const [data, setData] = useState(null)
  const [waiting, setWaiting] = useState(null)
  const [openTask, setOpenTask] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sinceIso = new Date(Date.now() - WINDOW_DAYS * DAY).toISOString()
      const [{ data: groups }, { data: links }, { data: students }, { data: topics }, attempts, { data: hw }, { data: mocks }] = await Promise.all([
        supabase.from('groups').select('id, name').order('name'),
        supabase.from('student_groups').select('student_id, group_id'),
        supabase.from('students').select('id, first_name').eq('is_teacher', false).eq('is_parent', false).eq('access_open', true),
        supabase.from('topics').select('id, name'),
        fetchAll(() => supabase.from('task_attempts').select('student_id, task_id, is_correct, created_at').gte('created_at', sinceIso).order('created_at')),
        supabase.from('homework').select('id, submitted_at').eq('status', 'submitted'),
        supabase.from('mock_attempts').select('id, submitted_at').eq('status', 'submitted'),
      ])
      const ids = [...new Set(attempts.filter(a => !a.is_correct).map(a => a.task_id))]
      const tasks = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('tasks').select('id, topic_id, position, condition, condition_attachments').in('id', ids.slice(i, i + 100))
        tasks.push(...(data ?? []))
      }
      if (cancelled) return
      setData(focusByGroup({ groups: groups ?? [], links: links ?? [], attempts, tasks, topics: topics ?? [], students: students ?? [] }))
      const queue = [...(hw ?? []), ...(mocks ?? [])].filter(x => x.submitted_at)
      if (queue.length) {
        const oldest = Math.min(...queue.map(x => new Date(x.submitted_at).getTime()))
        setWaiting({ n: queue.length, hours: Math.floor((Date.now() - oldest) / HOUR) })
      }
    }
    load().catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [])

  if (!data && !waiting) return null
  return (
    <>
      {waiting && (
        <Link to="/teacher/homework" className={'card check-queue' + (waiting.hours >= 24 ? ' late' : '')} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="row-between">
            <p className="card-title" style={{ margin: 0 }}>📥 Ждут проверки: {waiting.n}</p>
            <span className="muted small-text">самая давняя — {waiting.hours < 1 ? 'меньше часа' : `${waiting.hours} ч`}</span>
          </div>
          {waiting.hours >= 24 && <p className="muted small-text">Больше суток без ответа — быстрая проверка ценится учениками и родителями сильнее всего.</p>}
        </Link>
      )}
      {data && data.length > 0 && (
        <section className="card">
          <p className="card-title">🎯 Что разобрать на занятии</p>
          <p className="muted small-text">Задачи, в которых ученики группы ошиблись за последние {WINDOW_DAYS} дней и ещё не исправили.</p>
          {data.map(({ group, size, rows }) => (
            <div key={group.id} className="focus-group">
              <p className="eyebrow">{group.name}</p>
              {rows.map(r => (
                <div key={r.task.id} className="attention-row">
                  <button type="button" className="focus-row" onClick={() => setOpenTask(openTask === r.task.id ? null : r.task.id)}>
                    <b>{r.label}</b>
                    <span className="reason-chip">{r.who.length} из {size}</span>
                  </button>
                  <p className="muted small-text">{r.who.join(', ')}</p>
                  {openTask === r.task.id && (
                    <>
                      {r.task.condition && <p className="small-text">{r.task.condition}</p>}
                      <AttachmentList items={r.task.condition_attachments} full />
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  )
}
