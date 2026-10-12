import { supabase } from './supabase'

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
  const [topics, tasks, quizQuestions, taskAttempts, quizAttempts, homework, mockAttempts] = await Promise.all([
    supabase.from('topics').select('id, name, position').order('position').order('name').then(r => r.data ?? []),
    fetchAll(() => supabase.from('tasks').select('id, topic_id').order('id')),
    fetchAll(() => supabase.from('quiz_questions').select('id, topic').order('id')),
    fetchAll(() => only(supabase.from('task_attempts').select('student_id, task_id, is_correct, created_at')).order('created_at')),
    fetchAll(() => only(supabase.from('quiz_attempts').select('student_id, question_id, is_correct, created_at')).order('created_at')),
    fetchAll(() => only(supabase.from('homework').select('student_id, topic_id, correct_tasks, total_tasks, status')).eq('status', 'checked').order('id')),
    fetchAll(() => only(supabase.from('mock_attempts').select('student_id, exam_id, score, max_score, status, submitted_at')).neq('status', 'in_progress').order('id')).catch(() => []),
  ])
  return { topics, tasks, quizQuestions, taskAttempts, quizAttempts, homework, mockAttempts }
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

  raw.homework.filter(h => h.student_id === studentId).forEach(h => {
    const s = out[h.topic_id]
    if (!s) return
    s.hwC += h.correct_tasks || 0; s.hwT += h.total_tasks || 0
  })

  return raw.topics.map(t => {
    const s = out[t.id]
    s.practicePct = s.tried ? Math.round(s.solved / s.tried * 100) : null
    s.quizPct = s.quizDone ? Math.round(s.quizRight / s.quizDone * 100) : null
    s.hwPct = s.hwT ? Math.round(s.hwC / s.hwT * 100) : null
    const parts = [[s.practicePct, 0.4], [s.quizPct, 0.3], [s.hwPct, 0.3]].filter(p => p[0] != null)
    const w = parts.reduce((a, p) => a + p[1], 0)
    s.mastery = w ? Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / w) : null
    s.level = levelOf(s.mastery)
    return s
  })
}

// Очки рейтинга. since = Date -> только за период
export const POINTS = { task: 3, quiz: 1 }
export function ratingPoints(raw, since = null) {
  const after = (d) => !since || new Date(d) >= since
  const pts = {}
  const add = (sid, key, n) => {
    if (!pts[sid]) pts[sid] = { total: 0, tasks: 0, quiz: 0, mocks: 0 }
    pts[sid][key] += n; pts[sid].total += n
  }
  const firstOk = {}
  raw.taskAttempts.forEach(a => {
    if (!a.is_correct) return
    const k = a.student_id + '|' + a.task_id
    if (!firstOk[k]) { firstOk[k] = true; if (after(a.created_at)) add(a.student_id, 'tasks', POINTS.task) }
  })
  const firstQ = {}
  raw.quizAttempts.forEach(a => {
    if (!a.is_correct) return
    const k = a.student_id + '|' + a.question_id
    if (!firstQ[k]) { firstQ[k] = true; if (after(a.created_at)) add(a.student_id, 'quiz', POINTS.quiz) }
  })
  // Пробник: до 50 очков за лучшую попытку по каждому варианту
  const best = {}
  raw.mockAttempts.forEach(m => {
    if (!m.max_score || !after(m.submitted_at)) return
    const k = m.student_id + '|' + m.exam_id
    best[k] = Math.max(best[k] ?? 0, Math.round(m.score / m.max_score * 50))
  })
  Object.entries(best).forEach(([k, v]) => add(k.split('|')[0], 'mocks', v))
  return pts
}

export function ratingList(raw, students, since = null) {
  const pts = ratingPoints(raw, since)
  return students
    .filter(s => !s.is_teacher && !s.is_parent && !s.hide_in_rating)
    .map(s => ({ student: s, ...(pts[s.id] || { total: 0, tasks: 0, quiz: 0, mocks: 0 }) }))
    .sort((a, b) => b.total - a.total || shortName(a.student).localeCompare(shortName(b.student), 'ru'))
    .map((r, i) => ({ ...r, place: i + 1 }))
}

export const weekAgo = () => new Date(Date.now() - 7 * 24 * 3600 * 1000)
