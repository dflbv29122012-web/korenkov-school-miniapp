// Постоянное расписание: дни недели -> конкретные занятия

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

export const isoWeekday = (d) => d.getDay() || 7 // Пн=1 … Вс=7
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const fmtDate = (s) => parseYmd(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

// До конца учебного года: 31 мая
export function endOfSchoolYear(from = new Date()) {
  const y = from.getMonth() > 4 ? from.getFullYear() + 1 : from.getFullYear()
  return `${y}-05-31`
}
export const plusMonths = (n, from = new Date()) => ymd(new Date(from.getFullYear(), from.getMonth() + n, from.getDate()))
export const endOfYear = (from = new Date()) => `${from.getFullYear()}-12-31`

export const MAX_DAYS = 800

// Все занятия серии от даты from (включительно) до valid_until
export function planSlots(series, from = null) {
  const out = []
  if (!series.valid_from || !series.valid_until) return out
  let start = parseYmd(series.valid_from)
  if (from && parseYmd(from) > start) start = parseYmd(from)
  const end = parseYmd(series.valid_until)
  if ((end - start) / 864e5 > MAX_DAYS) return null // слишком большой период
  const slots = (series.slots || []).filter(s => s.time && s.weekday)
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = isoWeekday(d)
    slots.filter(s => Number(s.weekday) === wd).forEach(s => {
      const date = ymd(d)
      out.push({ date, time: s.time, duration: Number(s.duration) || 60, key: `${date}|${s.time}`, startsAt: new Date(`${date}T${s.time}:00`) })
    })
  }
  return out
}

// Строки занятий, которых ещё нет в расписании
export function buildRows(series, existing, from = null) {
  const plan = planSlots(series, from) || []
  const have = new Set(existing.map(l => l.series_key))
  // дни, где занятие уже менял руками (тема, конспект, сдвиг) — повторно не создаём
  const touched = new Set(existing.filter(isTouched).map(l => l.series_date))
  const perDay = {}
  ;(series.slots || []).forEach(s => { perDay[s.weekday] = (perDay[s.weekday] || 0) + 1 })
  return plan
    .filter(p => !have.has(p.key) && !(touched.has(p.date) && perDay[isoWeekday(parseYmd(p.date))] === 1))
    .map(p => ({
      title: series.title || 'Занятие',
      starts_at: p.startsAt.toISOString(),
      duration_minutes: p.duration,
      meeting_url: series.meeting_url || null,
      board_url: series.board_url || null,
      student_id: series.student_id || null,
      group_id: series.group_id || null,
      for_all: !!series.for_all,
      series_id: series.id, series_key: p.key, series_date: p.date,
      notes_attachments: [],
    }))
}

// Занятие с содержимым: у него есть тема, конспект или его сдвинули
export const isTouched = (l) => !!(l.manual || l.topic || l.topic_id || (l.notes_attachments && l.notes_attachments.length))

export function slotsSummary(slots) {
  return (slots || []).slice().sort((a, b) => a.weekday - b.weekday || String(a.time).localeCompare(String(b.time)))
    .map(s => `${WEEKDAYS[s.weekday - 1]} ${s.time}`).join(' · ')
}

export async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('lessons').insert(rows.slice(i, i + 100))
    if (error) throw error
  }
}

export async function deleteByIds(supabase, ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('lessons').delete().in('id', ids.slice(i, i + 100))
    if (error) throw error
  }
}
