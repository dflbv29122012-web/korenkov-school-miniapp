// Привычка и повторение: серия дней, работа над ошибками, тренировка вперемешку
import { supabase } from './supabase'
import { fetchAll, numberOf } from './progress'

const DAY = 864e5
// День по Москве: '2026-10-13'
export const mskDay = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ---------- Серия дней ----------
// День засчитан, если решена верно хотя бы `goal` задач. Один пропуск в неделю серию не обнуляет.
export function streakInfo(attempts, goal = 1, now = new Date()) {
  const perDay = {}
  attempts.forEach(a => { if (a.is_correct) { const k = mskDay(a.created_at); perDay[k] = (perDay[k] || 0) + 1 } })
  const ok = (d) => (perDay[d] || 0) >= Math.max(1, goal)
  const today = mskDay(now)
  const todayCount = perDay[today] || 0

  function walk(start) {
    let n = 0, d = start, lastFreeze = null
    for (let guard = 0; guard < 2000; guard++) {
      if (ok(d)) { n++; d = addDays(d, -1); continue }
      // пропуск: прощаем, если день до него засчитан и за последние 7 дней пропуск ещё не прощали
      const prev = addDays(d, -1)
      const canFreeze = ok(prev) && (!lastFreeze || (new Date(lastFreeze) - new Date(d)) / DAY >= 7)
      if (canFreeze) { lastFreeze = d; d = prev; continue }
      break
    }
    return n
  }
  const streak = ok(today) ? walk(today) : walk(addDays(today, -1))
  // рекорд
  const days = Object.keys(perDay).filter(ok).sort()
  let best = 0, run = 0, prev = null
  days.forEach(d => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d })
  best = Math.max(best, streak)
  // последние 7 дней для полоски
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { day: d, count: perDay[d] || 0, ok: ok(d) } })
  return { streak, best, todayCount, doneToday: ok(today), week }
}

// ---------- Работа над ошибками ----------
// После ошибки задача возвращается через 1 день, после верного повтора — через 3, потом через 7. Три повтора — выучено.
const STEPS = [1, 3, 7]
export function mistakesQueue(attempts, now = new Date()) {
  const byTask = {}
  attempts.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach(a => {
    const t = new Date(a.created_at).getTime()
    let s = byTask[a.task_id]
    if (!a.is_correct) { byTask[a.task_id] = { task_id: a.task_id, stage: 0, due: t + STEPS[0] * DAY, wrongs: (s?.wrongs || 0) + 1, last: t }; return }
    if (!s || s.stage >= STEPS.length) return
    s.last = t
    if (t >= s.due - 12 * 3600e3) { // повтор засчитан, если был не раньше срока (с запасом полдня)
      s.stage++
      if (s.stage < STEPS.length) s.due = t + STEPS[s.stage] * DAY
    }
  })
  const list = Object.values(byTask).filter(s => s.stage < STEPS.length)
  const nowT = now.getTime()
  return {
    due: list.filter(s => s.due <= nowT).sort((a, b) => a.due - b.due),
    later: list.filter(s => s.due > nowT).sort((a, b) => a.due - b.due),
    total: list.length,
  }
}

// ---------- Данные ученика ----------
export async function loadMyAttempts(studentId) {
  return fetchAll(() => supabase.from('task_attempts').select('task_id, is_correct, created_at, source').eq('student_id', studentId).order('created_at'))
}

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }

// Набор задач для тренировки. mode: 'mistakes' | 'mixed'
export async function buildSession(studentId, mode, size = 10) {
  const attempts = await loadMyAttempts(studentId)
  const topics = (await supabase.from('topics').select('id, name, position').order('position')).data ?? []
  let ids = []
  if (mode === 'mistakes') {
    ids = mistakesQueue(attempts).due.slice(0, size).map(s => s.task_id)
  } else {
    // номера, которые ученик уже начинал — задачи из них вперемешку, сначала ещё не решённые
    const tried = [...new Set(attempts.map(a => a.task_id))]
    const triedRows = tried.length ? await fetchByIds(tried, 'id, topic_id') : []
    const startedTopics = [...new Set(triedRows.map(t => t.topic_id).filter(Boolean))]
    if (!startedTopics.length) return { tasks: [], topics, attempts }
    const pool = await fetchAll(() => supabase.from('tasks').select('id, topic_id, answer').in('topic_id', startedTopics).order('id'))
    const solved = new Set(attempts.filter(a => a.is_correct).map(a => a.task_id))
    const byTopic = {}
    shuffle(pool.filter(t => t.answer)).sort((a, b) => Number(solved.has(a.id)) - Number(solved.has(b.id)))
      .forEach(t => { (byTopic[t.topic_id] ||= []).push(t.id) })
    // по кругу из разных номеров, чтобы соседние задачи были на разные темы
    const queues = shuffle(Object.values(byTopic))
    while (ids.length < size && queues.some(q => q.length)) queues.forEach(q => { if (q.length && ids.length < size) ids.push(q.shift()) })
  }
  const rows = ids.length ? await fetchByIds(ids, '*') : []
  const order = Object.fromEntries(ids.map((id, i) => [id, i]))
  const tasks = rows.filter(t => t.answer).sort((a, b) => order[a.id] - order[b.id])
  return { tasks, topics, attempts }
}

async function fetchByIds(ids, cols) {
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('tasks').select(cols).in('id', ids.slice(i, i + 100))
    out.push(...(data ?? []))
  }
  return out
}

export const topicLabel = (topics, id) => {
  const t = topics.find(x => x.id === id)
  if (!t) return ''
  const n = numberOf(t.name)
  return n ? `№${n}` : t.name
}
