// Учёт оплат: помесячно («оплачено до») и пакеты занятий (остаток считается по расписанию)
import { supabase } from './supabase'

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }
export const fmtDay = (s) => s ? parseYmd(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
export const rub = (n) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`
export const addMonths = (s, n) => { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())) }
const today = () => ymd(new Date())
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5)

export const KIND_LABEL = { month: 'Месяц занятий', package: 'Пакет занятий', other: 'Другое / долг' }

// ---------- Настройки (реквизиты, автозакрытие) ----------
export const DEFAULT_PAY = { card: '', phone: '', bank: '', name: '', note: '' }
export const DEFAULT_LOCK = { enabled: false, grace_days: 3, grace_lessons: 1 }

export async function loadPaySettings() {
  try {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', ['payment_details', 'payment_autolock'])
    const get = (k) => (data ?? []).find(r => r.key === k)?.value
    return { details: { ...DEFAULT_PAY, ...(get('payment_details') || {}) }, lock: { ...DEFAULT_LOCK, ...(get('payment_autolock') || {}) } }
  } catch { return { details: DEFAULT_PAY, lock: DEFAULT_LOCK } }
}

// ---------- Сколько занятий пакета уже прошло ----------
export async function lessonsUsed(studentId, from) {
  const { data: gl } = await supabase.from('student_groups').select('group_id').eq('student_id', studentId)
  const gids = (gl ?? []).map(g => g.group_id)
  const scope = [`student_id.eq.${studentId}`]
  if (gids.length) scope.push(`group_id.in.(${gids.join(',')})`)
  let q = supabase.from('lessons').select('id', { count: 'exact', head: true })
    .lt('starts_at', new Date().toISOString()).eq('charge', true).or(scope.join(','))
  if (from) q = q.gte('starts_at', parseYmd(from).toISOString())
  const { count, error } = await q
  return error ? 0 : (count ?? 0)
}

// ---------- Статус оплаты ----------
// level: ok | warn | overdue | none ; toPay — сколько предложить заплатить
export function billingStatus(plan, used, student) {
  const extra = Number(student?.debt_amount) || 0
  const type = plan?.plan_type || (plan ? 'monthly' : 'none')
  if (!plan || type === 'none') {
    return extra > 0
      ? { type: 'none', level: 'overdue', title: `Задолженность ${rub(extra)}`, toPay: extra, extra }
      : { type: 'none', level: 'none', title: 'Тариф не назначен', toPay: 0, extra }
  }
  if (type === 'package') {
    const paid = (Number(plan.lessons_paid) || 0) + (Number(plan.lessons_adjust) || 0)
    const left = paid - (used || 0)
    const price = Number(plan.package_price) || 0
    const size = Number(plan.package_size) || 8
    const base = { type, left, used, paid, size, price, extra }
    if (left < 0) return { ...base, level: 'overdue', owedLessons: -left, title: `Пакет закончился, не оплачено занятий: ${-left}`, toPay: price + extra }
    if (left <= 1) return { ...base, level: 'warn', title: left === 0 ? 'Оплаченные занятия закончились' : 'Осталось 1 оплаченное занятие', toPay: price + extra }
    return { ...base, level: extra > 0 ? 'overdue' : 'ok', title: `Осталось занятий: ${left} из ${paid}`, toPay: extra > 0 ? extra : price }
  }
  // monthly
  const price = Number(plan.price) || 0
  const base = { type: 'monthly', price, paidUntil: plan.paid_until, extra }
  if (!plan.paid_until) return { ...base, level: 'warn', title: 'Оплата ещё не отмечена', toPay: price + extra }
  const d = daysBetween(today(), plan.paid_until) // дней до конца оплаченного периода
  if (d < 0) {
    const months = Math.max(1, Math.ceil(-d / 30))
    return { ...base, level: 'overdue', daysOver: -d, months, title: `Оплата просрочена на ${-d} дн.`, toPay: price * months + extra }
  }
  if (d <= 3) return { ...base, level: 'warn', daysLeft: d, title: d === 0 ? `Оплачено по сегодня` : `Оплачено до ${fmtDay(plan.paid_until)} (осталось ${d} дн.)`, toPay: price + extra }
  return { ...base, level: extra > 0 ? 'overdue' : 'ok', daysLeft: d, title: `Оплачено до ${fmtDay(plan.paid_until)}`, toPay: extra > 0 ? extra : price }
}

export async function loadBilling(student) {
  const { data: plan } = await supabase.from('subscription_plans').select('*').eq('student_id', student.id).maybeSingle()
  const used = plan?.plan_type === 'package' ? await lessonsUsed(student.id, plan.count_from) : 0
  return { plan, used, status: billingStatus(plan, used, student) }
}

// Закрыть ли доступ автоматически
export function autoLocked(status, lock, student) {
  if (student?.autolock_exempt) return false
  if (!lock?.enabled || !status || status.level !== 'overdue') return false
  if (status.type === 'monthly') return (status.daysOver || 0) > (Number(lock.grace_days) || 0)
  if (status.type === 'package') return (status.owedLessons || 0) > (Number(lock.grace_lessons) || 0)
  return false
}

// ---------- Провести платёж: продлить месяц / добавить занятия / погасить долг ----------
export async function applyPayment(p) {
  const { data: plan } = await supabase.from('subscription_plans').select('*').eq('student_id', p.student_id).maybeSingle()
  if (p.kind === 'month') {
    const n = Math.max(1, Number(p.months) || 1)
    const start = plan?.paid_until || today()
    const paid_until = addMonths(start, n)
    if (plan) await supabase.from('subscription_plans').update({ paid_until }).eq('student_id', p.student_id)
    else await supabase.from('subscription_plans').insert({ student_id: p.student_id, plan_type: 'monthly', price: Number(p.amount) / n, paid_until })
  } else if (p.kind === 'package') {
    const n = Math.max(0, Number(p.lessons) || 0)
    if (plan) await supabase.from('subscription_plans').update({ lessons_paid: (Number(plan.lessons_paid) || 0) + n, ...(plan.count_from ? {} : { count_from: today() }) }).eq('student_id', p.student_id)
    else await supabase.from('subscription_plans').insert({ student_id: p.student_id, plan_type: 'package', package_size: n || 8, package_price: Number(p.amount) || 0, lessons_paid: n, count_from: today() })
  } else {
    const { data: st } = await supabase.from('students').select('debt_amount').eq('id', p.student_id).maybeSingle()
    const left = Math.max(0, (Number(st?.debt_amount) || 0) - (Number(p.amount) || 0))
    await supabase.from('students').update({ debt_amount: left }).eq('id', p.student_id)
  }
  // оплатили — доступ открываем
  await supabase.from('students').update({ access_open: true, access_closed_since: null }).eq('id', p.student_id)
}

export function periodLabel(p) {
  if (p.kind === 'month') return p.months > 1 ? `${p.months} мес. занятий` : 'Месяц занятий'
  if (p.kind === 'package') return `Пакет: ${p.lessons} занятий`
  return p.period_label || 'Оплата'
}
