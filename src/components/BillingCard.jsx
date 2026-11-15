import { fmtDay, rub } from '../lib/billing'

const ICON = { ok: '✅', warn: '⏰', overdue: '⚠️', none: '💳' }
const CLS = { ok: 'status-ok', warn: 'status-warn', overdue: 'status-bad', none: '' }

// Карточка статуса оплаты (ученик, родитель, учитель)
export default function BillingCard({ status, plan, compact }) {
  if (!status) return null
  return (
    <section className={'card status-card ' + (CLS[status.level] || '')}>
      <span className="status-icon">{ICON[status.level]}</span>
      <p className="status-title">{status.title}</p>
      {!compact && status.type === 'monthly' && (
        <p className="muted">Тариф: {rub(status.price)} в месяц{plan?.lessons_per_month ? ` · ${plan.lessons_per_month} занятий` : ''}</p>
      )}
      {!compact && status.type === 'package' && (
        <>
          <div className="progress-track" style={{ margin: '8px 0' }}>
            <div className="progress-fill" style={{ width: `${status.paid ? Math.max(0, Math.min(100, Math.round(Math.max(0, status.left) / status.paid * 100))) : 0}%` }} />
          </div>
          <p className="muted">Пакет: {status.size} занятий за {rub(status.price)} · прошло {status.used} из {status.paid}</p>
        </>
      )}
      {status.extra > 0 && status.type !== 'none' && <p className="muted">Дополнительная задолженность: {rub(status.extra)}</p>}
      {!compact && status.type === 'monthly' && status.level === 'overdue' && status.paidUntil && <p className="muted">Было оплачено до {fmtDay(status.paidUntil)}</p>}
    </section>
  )
}
