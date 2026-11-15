import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ParentCodeForm } from './Parent'
import { loadBilling } from '../lib/billing'
import BillingCard from '../components/BillingCard'
import PayBlock from '../components/PayBlock'

export default function Locked() {
  const { student, refreshStudent } = useAuth()
  const [billing, setBilling] = useState(null)
  useEffect(() => { loadBilling(student).then(setBilling).catch(() => setBilling({ status: null })) }, [student])

  return (
    <div className="screen">
      <div className="row-between home-header">
        <h1>Korenkov School</h1>
        <div className="avatar-circle">{(student?.first_name?.[0] || '?').toUpperCase()}</div>
      </div>

      <section className="card status-card status-bad">
        <span className="status-icon">🔒</span>
        <p className="status-title">Доступ закрыт</p>
        <p className="muted">Материалы, ДЗ и расписание откроются после оплаты.<br />Переведите оплату и нажмите «Я оплатил(а)» — преподаватель подтвердит, и доступ откроется.</p>
      </section>

      {billing && (
        <>
          <BillingCard status={billing.status} plan={billing.plan} compact />
          <PayBlock target={student} sentBy={student.id} status={billing.status} plan={billing.plan} onSent={refreshStudent} />
        </>
      )}

      <ParentCodeForm onLinked={refreshStudent} />
    </div>
  )
}
