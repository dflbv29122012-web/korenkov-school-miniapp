import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Payment() {
  const { student } = useAuth()
  const [plan, setPlan] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) return
    let cancelled = false

    Promise.all([
      supabase.from('subscription_plans').select('*').eq('student_id', student.id).maybeSingle(),
      supabase.from('payments').select('*').eq('student_id', student.id).order('paid_at', { ascending: false }),
    ]).then(([{ data: planData }, { data: paymentsData }]) => {
      if (cancelled) return
      setPlan(planData)
      setPayments(paymentsData ?? [])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [student])

  if (loading) return <div className="screen"><p className="muted">Загрузка…</p></div>

  return (
    <div className="screen">
      <header className="screen-header"><h1>Оплата</h1></header>

      <section className={'card status-card ' + (student?.access_open ? 'status-ok' : 'status-bad')}>
        <span className="status-icon">{student?.access_open ? '✅' : '🔒'}</span>
        <p className="status-title">{student?.access_open ? 'Доступ открыт' : 'Доступ закрыт'}</p>
        <p className="muted">
          {student?.access_open
            ? (plan?.paid_until ? `Оплачено до ${new Date(plan.paid_until).toLocaleDateString('ru-RU')}` : '')
            : 'Оплатите занятия и напишите учителю — доступ откроется сразу.'}
        </p>
      </section>

      {plan && (
        <section className="card">
          <p className="eyebrow">Текущий план</p>
          <InfoRow label="Тариф" value={`${plan.lessons_per_month} занятий / месяц`} />
          <InfoRow label="Стоимость" value={`${plan.price.toLocaleString('ru-RU')} ₽ / мес`} />
          {plan.next_charge_date && <InfoRow label="Следующее списание" value={new Date(plan.next_charge_date).toLocaleDateString('ru-RU')} highlight />}
          <InfoRow label="Автооплата" value={plan.auto_pay ? '🔄 Включена' : 'Выключена'} />
        </section>
      )}

      <p className="eyebrow">История платежей</p>
      <ul className="card-list">
        {payments.length === 0 && <p className="muted">Платежей пока нет</p>}
        {payments.map(p => (
          <li key={p.id} className="card row-between">
            <div>
              <p className="card-title">💳 {p.period_label || new Date(p.paid_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p>
              <p className="muted">{new Date(p.paid_at).toLocaleDateString('ru-RU')} · {p.method}</p>
            </div>
            <p className="score-line">{p.amount.toLocaleString('ru-RU')} ₽</p>
          </li>
        ))}
      </ul>

      {!student?.access_open && (
        <>
          <section className="card">
            <InfoRow label="Задолженность" value={`${(student?.debt_amount ?? 0).toLocaleString('ru-RU')} ₽`} highlight />
            {student?.access_closed_since && <InfoRow label="Доступ закрыт с" value={new Date(student.access_closed_since).toLocaleDateString('ru-RU')} />}
          </section>
          <button className="btn-primary block">💳 Оплатить {(student?.debt_amount ?? plan?.price ?? 0).toLocaleString('ru-RU')} ₽</button>
          <p className="muted center small-text">После оплаты доступ откроется автоматически</p>
        </>
      )}
    </div>
  )
}

function InfoRow({ label, value, highlight }) {
  return (
    <div className="row-between info-row">
      <span className="muted">{label}</span>
      <span className={highlight ? 'highlight-text' : ''}>{value}</span>
    </div>
  )
}
