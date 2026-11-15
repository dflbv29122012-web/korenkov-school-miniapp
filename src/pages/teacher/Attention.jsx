import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { loadProgressData, fetchAll } from '../../lib/progress'
import { toTest } from '../../lib/settings'
import { dueMoment } from '../../lib/due'

const INACTIVE_DAYS = 7
const MOCK_DROP = 5
const DAY = 864e5

// Кому нужно внимание: давно не занимался, просрочил ДЗ, упал балл пробника
export function attentionList(raw, students, homework, now = Date.now()) {
  const last = {}
  const seen = (sid, at) => { if (sid && at && (!last[sid] || at > last[sid])) last[sid] = at }
  raw.taskAttempts.forEach(a => seen(a.student_id, a.created_at))
  raw.quizAttempts.forEach(a => seen(a.student_id, a.created_at))
  raw.mockAttempts.forEach(a => seen(a.student_id, a.submitted_at))
  homework.forEach(h => seen(h.student_id, h.submitted_at))

  return students.map(s => {
    const reasons = []
    const l = last[s.id]
    const idle = l ? Math.floor((now - new Date(l)) / DAY) : null
    if (idle == null) reasons.push({ text: 'ещё ни разу не занимался в приложении', level: 'warn' })
    else if (idle >= INACTIVE_DAYS) reasons.push({ text: `не занимался ${idle} дн.`, level: idle >= 14 ? 'bad' : 'warn' })
    const overdue = homework.filter(h => h.student_id === s.id && h.status === 'assigned' && dueMoment(h) && dueMoment(h).getTime() < now)
    if (overdue.length) reasons.push({ text: `просрочено ДЗ: ${overdue.length}`, level: overdue.length >= 2 ? 'bad' : 'warn' })
    const mocks = raw.mockAttempts.filter(m => m.student_id === s.id && m.submitted_at && m.max_score)
      .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
    if (mocks.length >= 2) {
      const t = (m) => toTest(m.score, raw.settings.scale)
      const [a, b] = [t(mocks[0]), t(mocks[1])]
      if (a <= b - MOCK_DROP) reasons.push({ text: `пробник: ${b} → ${a}`, level: 'bad' })
    }
    const weight = reasons.reduce((w, r) => w + (r.level === 'bad' ? 2 : 1), 0)
    return { s, reasons, weight, idle }
  }).filter(r => r.reasons.length).sort((a, b) => b.weight - a.weight)
}

export default function Attention() {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadProgressData(),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).eq('is_parent', false).eq('access_open', true),
      fetchAll(() => supabase.from('homework').select('id, student_id, status, due_date, due_at, submitted_at').order('id')).catch(() => []),
    ]).then(([raw, { data: st }, hw]) => { if (!cancelled) setRows(attentionList(raw, st ?? [], hw)) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [])

  if (!rows || rows.length === 0) return null
  const shown = open ? rows : rows.slice(0, 3)
  return (
    <section className="card attention-card">
      <div className="row-between">
        <p className="card-title" style={{ margin: 0 }}>⚠️ Требуют внимания: {rows.length}</p>
      </div>
      {shown.map(({ s, reasons }) => (
        <div key={s.id} className="attention-row">
          <div className="row-between">
            <b>{s.first_name} {s.last_name || ''}</b>
            <Link to={`/teacher/progress?student=${s.id}`} className="muted small-text">прогресс →</Link>
          </div>
          <div>{reasons.map((r, i) => <span key={i} className={'reason-chip' + (r.level === 'warn' ? ' warn' : '')}>{r.text}</span>)}</div>
        </div>
      ))}
      {rows.length > 3 && <button className="btn-secondary block" onClick={() => setOpen(!open)}>{open ? 'Свернуть' : `Показать всех (${rows.length})`}</button>}
    </section>
  )
}
