// Автосборка ДЗ из банка задач
import { supabase } from './supabase'

export const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }

export const shortName = (n) => (String(n || '').match(/^№\s*\d+/) || [String(n || '')])[0].replace(/\s+/g, '')

// Все задачи выбранного блока (номер целиком или конкретный раздел)
export async function loadPool(block) {
  if (!block.topic_id) return []
  let q = supabase.from('tasks').select('id, topic_id, subtopic_id, position, condition, answer').eq('topic_id', block.topic_id)
  if (block.subtopic_id) q = q.eq('subtopic_id', block.subtopic_id)
  const { data } = await q.order('position')
  return data ?? []
}

// Что ученик уже решил верно или что ему уже задавали
export async function loadSeen(studentIds) {
  const seen = {}
  studentIds.forEach(id => { seen[id] = new Set() })
  if (!studentIds.length) return seen
  const { data: at } = await supabase.from('task_attempts').select('student_id, task_id').eq('is_correct', true).in('student_id', studentIds)
  ;(at ?? []).forEach(a => seen[a.student_id]?.add(a.task_id))
  const { data: hw } = await supabase.from('homework').select('id, student_id').in('student_id', studentIds)
  const owner = {}; (hw ?? []).forEach(h => { owner[h.id] = h.student_id })
  const ids = Object.keys(owner)
  for (let i = 0; i < ids.length; i += 100) {
    const { data: ht } = await supabase.from('homework_tasks').select('homework_id, task_id').in('homework_id', ids.slice(i, i + 100)).not('task_id', 'is', null)
    ;(ht ?? []).forEach(r => seen[owner[r.homework_id]]?.add(r.task_id))
  }
  return seen
}

// Собирает список задач по блокам. skip — множество id, которые нежелательны.
// Возвращает { picked: [task], short: [текст про нехватку] }
export async function pickTasks(blocks, skip, topicName, subName) {
  const picked = []; const short = []; const used = new Set()
  for (const b of blocks) {
    const pool = await loadPool(b)
    const label = b.subtopic_id ? `${shortName(topicName(b.topic_id))} · ${subName(b.subtopic_id)}` : shortName(topicName(b.topic_id))
    if (b.mode === 'pick') {
      pool.filter(t => (b.pickedIds || []).includes(t.id) && !used.has(t.id)).forEach(t => { used.add(t.id); picked.push(t) })
      continue
    }
    const n = Math.max(1, Number(b.count) || 1)
    const fresh = shuffle(pool.filter(t => !skip.has(t.id) && !used.has(t.id)))
    let take = fresh.slice(0, n)
    if (take.length < n) {
      short.push(`${label}: новых задач только ${take.length} из ${n}` + (pool.length ? ', добрал уже решённые' : ', задач в банке нет'))
      const rest = shuffle(pool.filter(t => !used.has(t.id) && !take.includes(t)))
      take = [...take, ...rest.slice(0, n - take.length)]
    }
    take.forEach(t => { used.add(t.id); picked.push(t) })
  }
  return { picked, short }
}

export const taskTitle = (t, topicName, subName) =>
  `${shortName(topicName(t.topic_id))}${t.subtopic_id ? ' · ' + subName(t.subtopic_id) : ''} — задача ${t.position}`
