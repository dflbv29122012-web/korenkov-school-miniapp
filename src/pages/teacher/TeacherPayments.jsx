import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AttachmentList } from '../../components/FileUploader'
import {
  billingStatus, lessonsUsed, applyPayment, loadPaySettings, periodLabel, rub, fmtDay, ymd,
  KIND_LABEL, DEFAULT_PAY, DEFAULT_LOCK,
} from '../../lib/billing'
import { saveSetting } from '../../lib/settings'

const LEVEL_TAG = { ok: 'tag-green', warn: 'tag-yellow', overdue: 'tag-red', none: '' }
const LEVEL_SHORT = { ok: '✅ Оплачено', warn: '⏰ Скоро', overdue: '⚠️ Долг', none: '—' }
const LEVEL_COLOR = { ok: 'var(--green)', warn: 'var(--yellow)', overdue: 'var(--red)', none: 'var(--hint)' }
const nameOf = (s) => s ? `${s.first_name} ${s.last_name || ''}`.trim() : '—'

export default function TeacherPayments() {
  const [params] = useSearchParams()
  const [students, setStudents] = useState([])
  const [plans, setPlans] = useState({})
  const [used, setUsed] = useState({})
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(params.get('student'))
  const [panel, setPanel] = useState(null) // 'pay' | 'plan' | 'history'
  const [showSettings, setShowSettings] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadAll() {
    setLoading(true)
    const [{ data: st }, { data: pl }, { data: pays }] = await Promise.all([
      supabase.from('students').select('*').eq('is_teacher', false).eq('is_parent', false).order('first_name'),
      supabase.from('subscription_plans').select('*'),
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    ])
    const pmap = Object.fromEntries((pl ?? []).map(p => [p.student_id, p]))
    const u = {}
    await Promise.all((st ?? []).filter(s => pmap[s.id]?.plan_type === 'package').map(async s => { u[s.id] = await lessonsUsed(s.id, pmap[s.id].count_from) }))
    setStudents(st ?? []); setPlans(pmap); setUsed(u); setPayments(pays ?? [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  const statusOf = (s) => billingStatus(plans[s.id], used[s.id] || 0, s)
  const pending = payments.filter(p => p.status === 'pending')
  const byId = Object.fromEntries(students.map(s => [s.id, s]))
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const okPays = payments.filter(p => p.status === 'success')
  const monthSum = okPays.filter(p => p.paid_at >= monthStart).reduce((a, p) => a + Number(p.amount || 0), 0)

  const rows = students.map(s => ({ s, st: statusOf(s) }))
  const order = { overdue: 0, warn: 1, ok: 2, none: 3 }
  const shown = rows
    .filter(r => filter === 'all' || (filter === 'debt' ? r.st.level === 'overdue' : filter === 'soon' ? r.st.level === 'warn' : true))
    .sort((a, b) => order[a.st.level] - order[b.st.level] || nameOf(a.s).localeCompare(nameOf(b.s)))
  const debtors = rows.filter(r => r.st.level === 'overdue').length
  const soon = rows.filter(r => r.st.level === 'warn').length

  return (
    <div className="screen">
      <header className="screen-header"><h1>Оплаты</h1></header>

      <div className="stat-row">
        <div className="stat-box"><span className="stat-num green">{rub(monthSum)}</span><span className="stat-label">За этот месяц</span></div>
        <div className="stat-box"><span className="stat-num" style={{ color: 'var(--red)' }}>{debtors}</span><span className="stat-label">Должников</span></div>
        <div className="stat-box"><span className="stat-num yellow">{soon}</span><span className="stat-label">Скоро оплата</span></div>
      </div>
      {msg && <p className="muted" style={{ color: 'var(--green)' }}>{msg}</p>}

      {pending.length > 0 && (
        <>
          <p className="eyebrow">📨 Ждут подтверждения ({pending.length})</p>
          {pending.map(p => <PendingCard key={p.id} p={p} student={byId[p.student_id]} plan={plans[p.student_id]} onDone={(t) => { setMsg(t); loadAll() }} />)}
        </>
      )}

      <div className="chip-wrap">
        {[['all', 'Все'], ['debt', `⚠️ Должники (${debtors})`], ['soon', `⏰ Скоро оплата (${soon})`]].map(([k, l]) => (
          <button key={k} className={'filter-chip' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {shown.length === 0 && <p className="muted">Никого нет</p>}
          {shown.map(({ s, st }) => (
            <li key={s.id} className="card">
              <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => { setOpenId(openId === s.id ? null : s.id); setPanel(null) }}>
                <div>
                  <p className="card-title">{nameOf(s)}{!s.access_open && ' 🔒'}</p>
                  <p className="muted small-text">{st.type === 'monthly' ? `Помесячно · ${rub(st.price)}` : st.type === 'package' ? `Пакет ${st.size} зан. · ${rub(st.price)}` : 'Без тарифа'}</p>
                  <p className="small-text" style={{ margin: '2px 0 0', color: LEVEL_COLOR[st.level] }}>{st.title}</p>
                </div>
                <span className={'tag ' + LEVEL_TAG[st.level]}>{LEVEL_SHORT[st.level]}</span>
              </div>
              {openId === s.id && (
                <div className="card-details">
                  <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                    <button className={panel === 'pay' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>💰 Принять оплату</button>
                    <button className={panel === 'plan' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPanel(panel === 'plan' ? null : 'plan')}>⚙️ Тариф</button>
                    <button className={panel === 'history' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPanel(panel === 'history' ? null : 'history')}>🧾 История</button>
                  </div>
                  {st.toPay > 0 && st.level !== 'ok' && <p className="muted">К оплате: <b style={{ color: 'var(--text)' }}>{rub(st.toPay)}</b></p>}
                  {panel === 'pay' && <AcceptForm s={s} plan={plans[s.id]} st={st} onDone={(t) => { setMsg(t); setPanel(null); loadAll() }} />}
                  {panel === 'plan' && <PlanForm s={s} plan={plans[s.id]} used={used[s.id] || 0} onDone={(t) => { setMsg(t); setPanel(null); loadAll() }} />}
                  {panel === 'history' && <History list={payments.filter(p => p.student_id === s.id)} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button className="btn-secondary block" onClick={() => setShowSettings(!showSettings)}>{showSettings ? 'Скрыть настройки' : '⚙️ Реквизиты и автозакрытие доступа'}</button>
      {showSettings && <PaySettings onSaved={setMsg} />}
    </div>
  )
}

// ---------- Подтверждение перевода ----------
function PendingCard({ p, student, plan, onDone }) {
  const [kind, setKind] = useState(p.kind || 'other')
  const [months, setMonths] = useState(p.months || 1)
  const [lessons, setLessons] = useState(p.lessons || plan?.package_size || 8)
  const [amount, setAmount] = useState(String(p.amount))
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirmPay() {
    setBusy(true)
    const fixed = { ...p, kind, months: Number(months) || 1, lessons: Number(lessons) || 0, amount: Number(amount) || p.amount }
    await supabase.from('payments').update({ status: 'success', kind: fixed.kind, months: fixed.months, lessons: fixed.lessons, amount: fixed.amount, period_label: periodLabel(fixed), confirmed_at: new Date().toISOString() }).eq('id', p.id)
    await applyPayment(fixed)
    setBusy(false); onDone(`Оплата ${nameOf(student)} подтверждена`)
  }
  async function reject() {
    setBusy(true)
    await supabase.from('payments').update({ status: 'rejected', comment: reason.trim() || 'Перевод не найден' }).eq('id', p.id)
    setBusy(false); onDone('Перевод отклонён')
  }

  return (
    <div className="card pending-pay">
      <div className="row-between">
        <p className="card-title" style={{ margin: 0 }}>{nameOf(student)}</p>
        <span className="tag tag-blue">{rub(p.amount)}</span>
      </div>
      <p className="muted small-text">{new Date(p.paid_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{p.sent_by && p.sent_by !== p.student_id ? ' · отправил родитель' : ''}</p>
      {p.comment && <p className="muted">💬 {p.comment}</p>}
      <AttachmentList items={p.receipt} compact />
      <div className="chip-wrap">
        {Object.entries(KIND_LABEL).map(([k, l]) => <button key={k} className={'filter-chip' + (kind === k ? ' active' : '')} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <div className="btn-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="text-input score-input" style={{ width: 110 }} value={amount} onChange={e => setAmount(e.target.value)} /> <span className="muted">₽</span>
        {kind === 'month' && <><input type="number" min="1" className="text-input score-input" value={months} onChange={e => setMonths(e.target.value)} /><span className="muted">мес.</span></>}
        {kind === 'package' && <><input type="number" min="1" className="text-input score-input" value={lessons} onChange={e => setLessons(e.target.value)} /><span className="muted">занятий</span></>}
      </div>
      {!rejecting ? (
        <div className="btn-row">
          <button className="btn-primary" disabled={busy} onClick={confirmPay}>✅ Подтвердить</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>✕ Отклонить</button>
        </div>
      ) : (
        <>
          <input className="text-input" placeholder="Причина (увидит ученик), напр. «Перевод не пришёл»" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="btn-row">
            <button className="btn-primary" disabled={busy} onClick={reject}>Отклонить</button>
            <button className="btn-secondary" onClick={() => setRejecting(false)}>Отмена</button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Внести оплату вручную ----------
function AcceptForm({ s, plan, st, onDone }) {
  const [kind, setKind] = useState(st.type === 'package' ? 'package' : st.type === 'monthly' ? 'month' : 'other')
  const [amount, setAmount] = useState(String(Math.round(st.type === 'package' ? (plan?.package_price || '') : st.type === 'monthly' ? (plan?.price || '') : (st.extra || ''))))
  const [months, setMonths] = useState(1)
  const [lessons, setLessons] = useState(plan?.package_size || 8)
  const [date, setDate] = useState(ymd(new Date()))
  const [method, setMethod] = useState('Перевод')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const sum = Number(String(amount).replace(/\s/g, '').replace(',', '.'))
    if (!sum) return setError('Укажите сумму')
    setBusy(true); setError('')
    try {
      const p = { student_id: s.id, amount: sum, kind, months: Number(months) || 1, lessons: kind === 'package' ? Number(lessons) || 0 : 0 }
      const { error: err } = await supabase.from('payments').insert({
        ...p, status: 'success', method, comment: comment.trim() || null, period_label: periodLabel(p),
        paid_at: new Date(`${date}T12:00:00`).toISOString(), confirmed_at: new Date().toISOString(),
      })
      if (err) throw err
      await applyPayment(p)
      onDone(`Оплата ${nameOf(s)} записана`)
    } catch (e) { setError('Ошибка: ' + e.message + ' (выполнили ОБНОВЛЕНИЕ_17.sql?)') }
    setBusy(false)
  }

  return (
    <div className="task-form">
      <div className="chip-wrap">
        {Object.entries(KIND_LABEL).map(([k, l]) => <button key={k} className={'filter-chip' + (kind === k ? ' active' : '')} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <div className="btn-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="text-input score-input" style={{ width: 110 }} inputMode="decimal" placeholder="Сумма" value={amount} onChange={e => setAmount(e.target.value)} /><span className="muted">₽</span>
        {kind === 'month' && <><input type="number" min="1" className="text-input score-input" value={months} onChange={e => setMonths(e.target.value)} /><span className="muted">мес.</span></>}
        {kind === 'package' && <><input type="number" min="1" className="text-input score-input" value={lessons} onChange={e => setLessons(e.target.value)} /><span className="muted">занятий</span></>}
      </div>
      {kind === 'month' && <p className="muted small-text">Продлит «оплачено до» на {months} мес.{plan?.paid_until ? ` — с ${fmdOr(plan.paid_until)}` : ' — с сегодняшнего дня'}</p>}
      {kind === 'package' && <p className="muted small-text">Добавит {lessons} занятий к остатку</p>}
      {kind === 'other' && <p className="muted small-text">Уменьшит дополнительную задолженность</p>}
      <div className="btn-row">
        <input type="date" className="text-input" value={date} onChange={e => setDate(e.target.value)} />
        <select className="text-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option>Перевод</option><option>СБП</option><option>Наличные</option>
        </select>
      </div>
      <input className="text-input" placeholder="Комментарий" value={comment} onChange={e => setComment(e.target.value)} />
      {error && <p className="error-text">⚠️ {error}</p>}
      <button className="btn-primary block" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : '💾 Записать оплату'}</button>
    </div>
  )
}
const fmdOr = (s) => fmtDay(s)

// ---------- Тариф ----------
function PlanForm({ s, plan, used, onDone }) {
  const [f, setF] = useState({
    plan_type: plan?.plan_type || 'monthly',
    price: plan?.price ?? 8000, lessons_per_month: plan?.lessons_per_month ?? 8, paid_until: plan?.paid_until || '',
    package_size: plan?.package_size ?? 8, package_price: plan?.package_price ?? 0,
    count_from: plan?.count_from || ymd(new Date()),
    left: plan ? (Number(plan.lessons_paid) || 0) + (Number(plan.lessons_adjust) || 0) - used : 0,
    debt: s.debt_amount ?? 0,
    exempt: !!s.autolock_exempt,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const up = (p) => setF({ ...f, ...p })

  async function save() {
    setBusy(true); setError('')
    try {
      const row = {
        student_id: s.id, plan_type: f.plan_type,
        price: Number(f.price) || 0, lessons_per_month: Number(f.lessons_per_month) || 0, paid_until: f.paid_until || null,
        package_size: Number(f.package_size) || 8, package_price: Number(f.package_price) || 0,
        count_from: f.count_from || null,
      }
      if (f.plan_type === 'package') {
        // «Осталось сейчас» задаётся напрямую: подгоняем поправку
        const usedNow = f.count_from === plan?.count_from ? used : 0
        row.lessons_paid = Number(plan?.lessons_paid) || 0
        row.lessons_adjust = (Number(f.left) || 0) - row.lessons_paid + usedNow
      }
      const { error: err } = plan
        ? await supabase.from('subscription_plans').update(row).eq('student_id', s.id)
        : await supabase.from('subscription_plans').insert(row)
      if (err) throw err
      await supabase.from('students').update({ debt_amount: Number(f.debt) || 0, autolock_exempt: f.exempt }).eq('id', s.id)
      onDone(`Тариф ${nameOf(s)} сохранён`)
    } catch (e) { setError('Ошибка: ' + e.message + ' (выполнили ОБНОВЛЕНИЕ_17.sql?)') }
    setBusy(false)
  }

  return (
    <div className="task-form">
      <div className="chip-wrap">
        {[['monthly', '📅 Помесячно'], ['package', '📦 Пакет занятий'], ['none', 'Без тарифа']].map(([k, l]) => (
          <button key={k} className={'filter-chip' + (f.plan_type === k ? ' active' : '')} onClick={() => up({ plan_type: k })}>{l}</button>
        ))}
      </div>
      {f.plan_type === 'monthly' && (
        <>
          <Field label="Цена за месяц, ₽"><input className="text-input" inputMode="decimal" value={f.price} onChange={e => up({ price: e.target.value })} /></Field>
          <Field label="Занятий в месяц (для информации)"><input type="number" className="text-input" value={f.lessons_per_month} onChange={e => up({ lessons_per_month: e.target.value })} /></Field>
          <Field label="Оплачено до"><input type="date" className="text-input" value={f.paid_until} onChange={e => up({ paid_until: e.target.value })} /></Field>
        </>
      )}
      {f.plan_type === 'package' && (
        <>
          <Field label="Занятий в пакете"><input type="number" className="text-input" value={f.package_size} onChange={e => up({ package_size: e.target.value })} /></Field>
          <Field label="Цена пакета, ₽"><input className="text-input" inputMode="decimal" value={f.package_price} onChange={e => up({ package_price: e.target.value })} /></Field>
          <Field label="Считать занятия из расписания с даты"><input type="date" className="text-input" value={f.count_from} onChange={e => up({ count_from: e.target.value })} /></Field>
          <Field label="Осталось оплаченных занятий сейчас"><input type="number" className="text-input" value={f.left} onChange={e => up({ left: e.target.value })} /></Field>
          <p className="muted small-text">Каждое прошедшее занятие ученика (личное или его группы) из расписания списывается автоматически. Если занятие отменилось — в расписании нажмите ✏️ и снимите «Списывать с пакета».</p>
        </>
      )}
      <Field label="Дополнительная задолженность, ₽"><input className="text-input" inputMode="decimal" value={f.debt} onChange={e => up({ debt: e.target.value })} /></Field>
      <label className="checkbox-row"><input type="checkbox" checked={f.exempt} onChange={e => up({ exempt: e.target.checked })} />
        Не закрывать доступ автоматически этому ученику</label>
      {error && <p className="error-text">⚠️ {error}</p>}
      <button className="btn-primary block" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : '💾 Сохранить тариф'}</button>
    </div>
  )
}

function Field({ label, children }) {
  return <div><p className="muted small-text" style={{ margin: '6px 0 2px' }}>{label}</p>{children}</div>
}

function History({ list }) {
  if (!list.length) return <p className="muted">Платежей пока нет</p>
  return list.map(p => (
    <div key={p.id} className="row-between info-row">
      <span className="muted small-text">{new Date(p.paid_at).toLocaleDateString('ru-RU')} · {periodLabel(p)} · {p.method || 'Перевод'}{p.status === 'pending' ? ' · ⏳ ждёт' : p.status === 'rejected' ? ' · ✕ отклонён' : ''}</span>
      <span>{rub(p.amount)}</span>
    </div>
  ))
}

// ---------- Реквизиты и автозакрытие ----------
function PaySettings({ onSaved }) {
  const [d, setD] = useState(DEFAULT_PAY)
  const [lock, setLock] = useState(DEFAULT_LOCK)
  const [busy, setBusy] = useState(false)
  useEffect(() => { loadPaySettings().then(s => { setD(s.details); setLock(s.lock) }) }, [])

  async function save() {
    setBusy(true)
    const e1 = await saveSetting('payment_details', d)
    const e2 = await saveSetting('payment_autolock', { ...lock, grace_days: Number(lock.grace_days) || 0, grace_lessons: Number(lock.grace_lessons) || 0 })
    setBusy(false)
    onSaved(e1 || e2 ? 'Ошибка сохранения: ' + (e1 || e2).message : 'Настройки оплаты сохранены')
  }

  return (
    <div className="card task-form">
      <p className="eyebrow" style={{ marginTop: 0 }}>Реквизиты для перевода (видят ученики и родители)</p>
      <input className="text-input" placeholder="Телефон для СБП, напр. +7 900 123-45-67" value={d.phone} onChange={e => setD({ ...d, phone: e.target.value })} />
      <input className="text-input" placeholder="Банк для СБП, напр. Т-Банк" value={d.bank} onChange={e => setD({ ...d, bank: e.target.value })} />
      <input className="text-input" placeholder="Номер карты (по желанию)" value={d.card} onChange={e => setD({ ...d, card: e.target.value })} />
      <input className="text-input" placeholder="Получатель, напр. Иван К." value={d.name} onChange={e => setD({ ...d, name: e.target.value })} />
      <input className="text-input" placeholder="Подсказка, напр. «В комментарии к переводу укажите имя ученика»" value={d.note} onChange={e => setD({ ...d, note: e.target.value })} />

      <p className="eyebrow">Автозакрытие доступа</p>
      <label className="checkbox-row"><input type="checkbox" checked={!!lock.enabled} onChange={e => setLock({ ...lock, enabled: e.target.checked })} />
        Закрывать доступ ученику при просрочке оплаты</label>
      {lock.enabled && (
        <>
          <Field label="Помесячно: сколько дней ждать после окончания оплаты"><input type="number" min="0" className="text-input" value={lock.grace_days} onChange={e => setLock({ ...lock, grace_days: e.target.value })} /></Field>
          <Field label="Пакет: сколько неоплаченных занятий допускать"><input type="number" min="0" className="text-input" value={lock.grace_lessons} onChange={e => setLock({ ...lock, grace_lessons: e.target.value })} /></Field>
          <p className="muted small-text">Доступ откроется сам, как только вы подтвердите оплату. Если ученику нужно дать отсрочку — в его тарифе отметьте «Не закрывать доступ автоматически».</p>
        </>
      )}
      <button className="btn-primary block" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : '💾 Сохранить'}</button>
    </div>
  )
}
