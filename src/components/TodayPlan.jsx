import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadProgressData, topicStats } from '../lib/progress'
import { loadMyAttempts, mistakesQueue, streakInfo } from '../lib/learning'
import { loadExamDate, pointsFor } from '../lib/settings'
import { dueMoment, fmtDue } from '../lib/due'

// Точка роста: сначала уже начатый номер, где освоено меньше 80% (больше всего баллов «лежит на полу»),
// затем — следующий по порядку номер, который ученик ещё не открывал (первая часть раньше второй).
export function growthPoint(raw, studentId) {
  const stats = topicStats(raw, studentId).filter(x => x.num && x.tasksTotal > 0)
  const started = stats.filter(x => x.started && (x.mastery ?? 0) < 80)
    .map(x => ({ num: Number(x.num), gain: pointsFor(x.num, raw.settings) * (1 - (x.mastery ?? 0) / 100), mastery: x.mastery ?? 0, started: true }))
    .sort((a, b) => b.gain - a.gain || a.num - b.num)
  if (started.length) return started[0]
  const fresh = stats.filter(x => !x.started).map(x => ({ num: Number(x.num), gain: pointsFor(x.num, raw.settings), started: false })).sort((a, b) => a.num - b.num)
  return fresh[0] || null
}

const DAY = 864e5

// Личный план на сегодня: собирается из данных самого ученика —
// ближайший дедлайн, задачи к повторению и номер, где быстрее всего добрать баллы.
export function buildPlan({ homework, attempts, f, goal, now = new Date() }) {
  const items = []
  const open = homework.filter(h => h.status === 'assigned')
    .map(h => ({ h, due: dueMoment(h) }))
    .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity))
  const overdue = open.filter(x => x.due && x.due.getTime() < now.getTime())
  const soon = open.find(x => !x.due || x.due.getTime() >= now.getTime())
  if (overdue.length) {
    items.push({ icon: '⚠️', level: 'bad', to: '/homework', title: `Сдать просроченное ДЗ: ${overdue.length}`, note: `«${overdue[0].h.title}»` })
  }
  if (soon) {
    const left = soon.due ? Math.ceil((soon.due.getTime() - now.getTime()) / DAY) : null
    items.push({
      icon: '📝', level: left != null && left <= 1 ? 'warn' : '', to: '/homework',
      title: `ДЗ «${soon.h.title}»`,
      note: soon.due ? `сдать до ${fmtDue(soon.h)}` : 'без срока',
    })
  }
  const q = mistakesQueue(attempts, now)
  if (q.due.length) {
    items.push({ icon: '🔁', level: '', to: '/training?mode=mistakes', title: `Повторить задач: ${Math.min(q.due.length, 10)}`, note: 'ошибки возвращаются, пока не решишь без подсказки' })
  }
  const g = f
  if (g) {
    const gain = String(Math.round(g.gain * 10) / 10).replace('.', ',')
    items.push({
      icon: '🚀', level: '', to: '/topics',
      title: g.started ? `№${g.num}: реши 5 задач` : `Начни №${g.num}: первые 3 задачи`,
      note: g.started ? `освоено ${g.mastery}% — здесь можно добрать до +${gain} перв. б.` : 'следующий номер по порядку',
    })
  }
  const s = streakInfo(attempts, goal, now)
  if (!s.doneToday) {
    const leftToday = Math.max(1, goal) - s.todayCount
    items.push({ icon: '🔥', level: '', to: '/training', title: `Цель дня: ещё ${leftToday} ${leftToday === 1 ? 'задача' : 'задач(и)'}`, note: s.streak ? `серия ${s.streak} дн. — не прерывай` : 'начни серию сегодня' })
  }
  return { items: items.slice(0, 4), doneToday: s.doneToday }
}

export default function TodayPlan({ student }) {
  const [plan, setPlan] = useState(null)
  const [daysLeft, setDaysLeft] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [raw, attempts, { data: hw }, examDate] = await Promise.all([
        loadProgressData([student.id]),
        loadMyAttempts(student.id),
        supabase.from('homework').select('id, title, status, due_date, due_at').eq('student_id', student.id).eq('status', 'assigned'),
        loadExamDate(),
      ])
      if (cancelled) return
      let f = null
      try { f = growthPoint(raw, student.id) } catch { /* точка роста не обязательна */ }
      setPlan(buildPlan({ homework: hw ?? [], attempts, f, goal: student.daily_goal || 1 }))
      if (examDate) {
        const d = Math.ceil((new Date(examDate + 'T09:00:00+03:00').getTime() - Date.now()) / DAY)
        setDaysLeft(d >= 0 ? d : null)
      }
    }
    load().catch(() => {})
    return () => { cancelled = true }
  }, [student.id, student.daily_goal])

  if (!plan) return null
  return (
    <section className="card plan-card">
      <div className="row-between">
        <p className="card-title" style={{ margin: 0 }}>🗓 План на сегодня</p>
        {daysLeft != null && <span className="plan-countdown">до ЕГЭ {daysLeft} дн.</span>}
      </div>
      {plan.items.length === 0
        ? <p className="muted">Всё сделано — можно отдохнуть или порешать вперемешку 💪</p>
        : plan.items.map((it, i) => (
          <Link key={i} to={it.to} className={'plan-item' + (it.level ? ' ' + it.level : '')}>
            <span className="plan-icon">{it.icon}</span>
            <span className="plan-text"><b>{it.title}</b><span className="muted small-text">{it.note}</span></span>
            <span className="plan-arrow">›</span>
          </Link>
        ))}
    </section>
  )
}
