import { supabase } from './supabase'
import { loadSettings, toTest } from './settings'

// Supabase отдаёт максимум 1000 строк за раз — забираем постранично
export async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

// «№14. Тригонометрические уравнения» -> '14'
export function numberOf(name) {
  const m = String(name ?? '').match(/№\s*(\d+)/)
  return m ? m[1] : null
}

export function shortName(s) {
  if (!s) return '—'
  return `${s.first_name || ''} ${s.last_name ? s.last_name[0] + '.' : ''}`.trim() || 'Ученик'
}

// Загружает всё нужное для прогресса. studentIds = null -> по всем ученикам
export async function loadProgressData(studentIds = null) {
  const only = (q) => (studentIds ? q.in('student_id', studentIds) : q)
  const [topics, tasks, quizQuestions, taskAttempts, quizAttempts, homework, mockAttempts, exams, settings, hwTasks] = await Promise.all([
    supabase.from('topics').select('id, name, position').order('position').order('name').then(r => r.data ?? []),
    fetchAll(() => supabase.from('tasks').select('id, topic_id').order('id')),
    fetchAll(() => supabase.from('quiz_questions').select('id, topic').order('id')),
    fetchAll(() => only(supabase.from('task_attempts').select('student_id, task_id, is_correct, created_at, source')).order('created_at')),
    fetchAll(() => only(supabase.from('quiz_attempts').select('student_id, question_id, is_correct, created_at')).order('created_at')),
    fetchAll(() => only(supabase.from('homework').select('id, student_id, topic_id, correct_tasks, total_tasks, status')).eq('status', 'checked').order('id')),
    fetchAll(() => only(supabase.from('mock_attempts').select('student_id, exam_id, score, max_score, status, submitted_at')).neq('status', 'in_progress').order('id')).catch(() => []),
    fetchAll(() => supabase.from('mock_exams').select('id, is_self').order('id')).catch(() => []),
    loadSettings(),
    fetchAll(() => supabase.from('homework_tasks').select('homework_id, task_id, score, max_score').not('task_id', 'is', null).order('id')).catch(() => []),
  ])
  const selfExam = {}
  exams.forEach(e => { selfExam[e.id] = !!e.is_self })
  return { topics, tasks, quizQuestions, taskAttempts, quizAttempts, homework, mockAttempts, selfExam, settings, hwTasks }
}

export const LEVELS = {
  good: { label: 'Уверенно', cls: 'lvl-good' },
  mid: { label: 'Повторить', cls: 'lvl-mid' },
  bad: { label: 'Слабо', cls: 'lvl-bad' },
  none: { label: 'Не начато', cls: 'lvl-none' },
}
export function levelOf(pct) {
  if (pct == null) return 'none'
  if (pct >= 80) return 'good'
  if (pct >= 50) return 'mid'
  return 'bad'
}

// Прогресс одного ученика по каждому номеру
export function topicStats(raw, studentId) {
  const taskTopic = {}
  raw.tasks.forEach(t => { taskTopic[t.id] = t.topic_id })
  const topicByNum = {}
  raw.topics.forEach(t => { const n = numberOf(t.name); if (n) topicByNum[n] = t.id })
  const quizTopic = {}
  raw.quizQuestions.forEach(q => {
    quizTopic[q.id] = raw.topics.find(t => t.name === q.topic)?.id || topicByNum[numberOf(q.topic)] || null
  })

  const out = {}
  raw.topics.forEach(t => {
    out[t.id] = { topic: t, num: numberOf(t.name), tasksTotal: 0, tried: 0, solved: 0, quizTotal: 0, quizDone: 0, quizRight: 0, hwC: 0, hwT: 0 }
  })
  raw.tasks.forEach(t => { if (out[t.topic_id]) out[t.topic_id].tasksTotal++ })
  raw.quizQuestions.forEach(q => { const id = quizTopic[q.id]; if (out[id]) out[id].quizTotal++ })

  const taskState = {}
  raw.taskAttempts.filter(a => a.student_id === studentId).forEach(a => {
    taskState[a.task_id] = taskState[a.task_id] || a.is_correct
  })
  Object.entries(taskState).forEach(([taskId, ok]) => {
    const s = out[taskTopic[taskId]]
    if (!s) return
    s.tried++; if (ok) s.solved++
  })

  const lastQuiz = {}
  raw.quizAttempts.filter(a => a.student_id === studentId).forEach(a => { lastQuiz[a.question_id] = a.is_correct })
  Object.entries(lastQuiz).forEach(([qid, ok]) => {
    const s = out[quizTopic[qid]]
    if (!s) return
    s.quizDone++; if (ok) s.quizRight++
  })

  // ДЗ с задачами из банка считаем по номерам самих задач, остальные — по номеру ДЗ
  const bankHw = new Set((raw.hwTasks || []).map(r => r.homework_id))
  const myChecked = new Set()
  raw.homework.filter(h => h.student_id === studentId).forEach(h => {
    myChecked.add(h.id)
    if (bankHw.has(h.id)) return
    const s = out[h.topic_id]
    if (!s) return
    s.hwC += h.correct_tasks || 0; s.hwT += h.total_tasks || 0
  })
  ;(raw.hwTasks || []).filter(r => myChecked.has(r.homework_id)).forEach(r => {
    const s = out[taskTopic[r.task_id]]
    if (!s) return
    s.hwC += Number(r.score) || 0; s.hwT += Number(r.max_score) || 0
  })

  return raw.topics.map(t => {
    const s = out[t.id]
    // Каждая часть — процент от ВСЕГО, что есть в номере
    s.bankPct = s.tasksTotal ? Math.round(s.solved / s.tasksTotal * 100) : null
    s.quizPct = s.quizTotal ? Math.round(s.quizRight / s.quizTotal * 100) : null
    s.hwPct = s.hwT ? Math.round(s.hwC / s.hwT * 100) : null
    s.started = s.tried > 0 || s.quizDone > 0 || s.hwT > 0
    const parts = [s.bankPct, s.quizPct, s.hwPct].filter(v => v != null)
    s.mastery = s.started && parts.length ? Math.round(parts.reduce((a, v) => a + v, 0) / parts.length) : null
    s.level = levelOf(s.mastery)
    return s
  })
}

// Итог по всем номерам: банк, тесты, ДЗ
export function totals(stats) {
  const sum = (k) => stats.reduce((a, s) => a + (s[k] || 0), 0)
  const pct = (a, b) => (b ? Math.round(a / b * 100) : null)
  return {
    bank: { got: sum('solved'), of: sum('tasksTotal'), pct: pct(sum('solved'), sum('tasksTotal')) },
    quiz: { got: sum('quizRight'), of: sum('quizTotal'), pct: pct(sum('quizRight'), sum('quizTotal')) },
    hw: { got: sum('hwC'), of: sum('hwT'), pct: pct(sum('hwC'), sum('hwT')) },
  }
}

// ---------- Рейтинг ----------
export const POINTS = { task: 3, quiz: 1 }
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

// Период рейтинга: { key: '2026-10', from, to, label } или null = за всё время
export function monthPeriod(y, m) {
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, y, m, from: new Date(y, m, 1), to: new Date(y, m + 1, 1), label: `${MONTHS[m]} ${y}` }
}
export const currentMonth = () => { const d = new Date(); return monthPeriod(d.getFullYear(), d.getMonth()) }
export const shiftMonth = (p, n) => monthPeriod(new Date(p.y, p.m + n, 1).getFullYear(), new Date(p.y, p.m + n, 1).getMonth())
export const monthGen = (p) => MONTHS_GEN[p.m]

// Самый ранний месяц, в котором была активность
export function firstMonth(raw) {
  const dates = [...raw.taskAttempts.map(a => a.created_at), ...raw.quizAttempts.map(a => a.created_at), ...raw.mockAttempts.map(a => a.submitted_at)].filter(Boolean).sort()
  const d = dates.length ? new Date(dates[0]) : new Date()
  return monthPeriod(d.getFullYear(), d.getMonth())
}

export function ratingPoints(raw, period = null) {
  const inP = (d) => !period || (d && new Date(d) >= period.from && new Date(d) < period.to)
  const pts = {}
  const add = (sid, key, n) => {
    if (!pts[sid]) pts[sid] = { total: 0, tasks: 0, quiz: 0, mocks: 0 }
    pts[sid][key] += n; pts[sid].total += n
  }
  // Очки дают только за ПЕРВЫЙ верный ответ — в том месяце, когда он был
  const firstOk = {}
  raw.taskAttempts.forEach(a => {
    // решения внутри пробника идут в прогресс, но очки за них даёт сам пробник
    if (!a.is_correct || a.source === 'mock') return
    const k = a.student_id + '|' + a.task_id
    if (!firstOk[k]) { firstOk[k] = true; if (inP(a.created_at)) add(a.student_id, 'tasks', POINTS.task) }
  })
  const firstQ = {}
  raw.quizAttempts.forEach(a => {
    if (!a.is_correct) return
    const k = a.student_id + '|' + a.question_id
    if (!firstQ[k]) { firstQ[k] = true; if (inP(a.created_at)) add(a.student_id, 'quiz', POINTS.quiz) }
  })
  // Пробник: очки = тестовый балл (до 100) лучшей попытки.
  // Пробник учителя — за каждый вариант; свои пробники ученика — один лучший за месяц
  const best = {}
  const scale = raw.settings?.scale
  raw.mockAttempts.forEach(m => {
    if (!m.max_score || !m.submitted_at || !inP(m.submitted_at)) return
    const d = new Date(m.submitted_at)
    const k = raw.selfExam?.[m.exam_id]
      ? `${m.student_id}|self-${d.getFullYear()}-${d.getMonth()}`
      : `${m.student_id}|${m.exam_id}`
    const v = scale ? toTest(m.score, scale) : Math.round(m.score / m.max_score * 100)
    best[k] = Math.max(best[k] ?? 0, v)
  })
  Object.entries(best).forEach(([k, v]) => add(k.split('|')[0], 'mocks', v))
  return pts
}

export function ratingList(raw, students, period = null) {
  const pts = ratingPoints(raw, period)
  return students
    .filter(s => !s.is_teacher && !s.is_parent && !s.hide_in_rating)
    .map(s => ({ student: s, ...(pts[s.id] || { total: 0, tasks: 0, quiz: 0, mocks: 0 }) }))
    .sort((a, b) => b.total - a.total || shortName(a.student).localeCompare(shortName(b.student), 'ru'))
    .map((r, i) => ({ ...r, place: i + 1 }))
}

export const weekAgo = () => new Date(Date.now() - 7 * 24 * 3600 * 1000)
