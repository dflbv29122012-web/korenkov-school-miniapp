import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadBilling, periodLabel, rub } from '../lib/billing'
import BillingCard from '../components/BillingCard'
import PayBlock from '../components/PayBlock'

export default function Payment() {
  const { student } = useAuth()
  const [billing, setBilling] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [b, { data }] = await Promise.all([
      loadBilling(student),
      supabase.from('payments').select('*').eq('student_id', student.id).order('paid_at', { ascending: false }),
    ])
    setBilling(b); setPayments((data ?? []).filter(p => p.status !== 'pending')); setLoading(false)
  }
  useEffect(() => { if (student) load() }, [student])

  if (loading) return <div className="screen"><p className="muted">Загрузка…</p></div>

  return (
    <div className="screen">
      <header className="screen-header"><h1>Оплата</h1></header>
      <BillingCard status={billing.status} plan={billing.plan} />
      <PayBlock target={student} sentBy={student.id} status={billing.status} plan={billing.plan} onSent={load} />
      <PaymentHistory payments={payments} />
    </div>
  )
}

export function PaymentHistory({ payments }) {
  return (
    <>
      <p className="eyebrow">История платежей</p>
      <ul className="card-list">
        {payments.length === 0 && <p className="muted">Платежей пока нет</p>}
        {payments.map(p => (
          <li key={p.id} className="card row-between">
            <div>
              <p className="card-title">{p.status === 'rejected' ? '✕ ' : '💳 '}{periodLabel(p)}</p>
              <p className="muted">{new Date(p.paid_at).toLocaleDateString('ru-RU')} · {p.method || 'Перевод'}{p.status === 'rejected' ? ' · не подтверждён' : ''}</p>
              {p.status === 'rejected' && p.comment && <p className="muted small-text">{p.comment}</p>}
            </div>
            <p className="score-line">{rub(p.amount)}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
