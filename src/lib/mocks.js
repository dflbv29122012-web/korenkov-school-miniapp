import { supabase } from './supabase'
import { numberOf } from './progress'

// Слоты пробника вместе с заданиями и номером ЕГЭ
export async function loadExamSlots(examId) {
  const { data: slots } = await supabase.from('mock_exam_tasks').select('*').eq('exam_id', examId).order('position')
  const ids = (slots ?? []).map(s => s.task_id)
  if (!ids.length) return []
  const [{ data: tasks }, { data: topics }] = await Promise.all([
    supabase.from('tasks').select('*').in('id', ids),
    supabase.from('topics').select('id, name'),
  ])
  const tm = {}; (tasks ?? []).forEach(t => { tm[t.id] = t })
  const top = {}; (topics ?? []).forEach(t => { top[t.id] = t })
  return (slots ?? []).filter(s => tm[s.task_id]).map(s => {
    const task = tm[s.task_id]
    const topicName = top[task.topic_id]?.name || ''
    return { ...s, task, topicName, num: numberOf(topicName) || '?' }
  })
}

// Какие пробники видит ученик
export async function examsForStudent(studentId) {
  const { data: links } = await supabase.from('student_groups').select('group_id').eq('student_id', studentId)
  const gids = (links ?? []).map(l => l.group_id)
  const or = ['and(group_id.is.null,student_id.is.null)', `student_id.eq.${studentId}`]
  if (gids.length) or.push(`group_id.in.(${gids.join(',')})`)
  const { data } = await supabase.from('mock_exams').select('*').eq('is_published', true).or(or.join(',')).order('created_at', { ascending: false })
  return data ?? []
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0')
}

export const showAnswer = (a) => String(a ?? '').split('|').join(' или ')

// Пересчёт суммы баллов попытки
export function sumScore(answers) {
  return Object.values(answers || {}).reduce((s, a) => s + (a.got || 0), 0)
}
