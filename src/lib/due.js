// Дедлайн ДЗ: дата + (необязательно) время. Старые ДЗ хранят только дату — срок до конца дня.
const pad = (n) => String(n).padStart(2, '0')
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function dueMoment(hw) {
  if (hw.due_at) return new Date(hw.due_at)
  if (hw.due_date) return new Date(hw.due_date + 'T23:59:59')
  return null
}
export function dueParts(hw) {
  if (hw.due_at) { const d = new Date(hw.due_at); return { date: ymdOf(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } }
  return { date: hw.due_date || '', time: '' }
}
export function dueFields(date, time) {
  if (!date) return { due_date: null, due_at: null }
  return { due_date: date, due_at: time ? new Date(`${date}T${time}:00`).toISOString() : null }
}
export function fmtDue(hw, long = true) {
  const m = dueMoment(hw); if (!m) return ''
  const day = m.toLocaleDateString('ru-RU', long ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'numeric' })
  return hw.due_at ? `${day}, ${m.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : day
}
