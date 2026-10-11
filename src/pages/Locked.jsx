import { useAuth } from '../context/AuthContext'

export default function Locked() {
  const { student } = useAuth()

  return (
    <div className="screen">
      <div className="row-between home-header">
        <h1>Korenkov School</h1>
        <div className="avatar-circle">{(student?.first_name?.[0] || '?').toUpperCase()}</div>
      </div>

      <section className="card status-card status-bad">
        <span className="status-icon">🔒</span>
        <p className="status-title">Доступ закрыт</p>
        <p className="muted">Оплата за текущий месяц не поступила.<br />Все материалы, ДЗ и расписание недоступны.</p>
      </section>

      <section className="card status-card status-bad">
        <span className="status-icon">📚</span>
        <p className="status-title">Материалы недоступны</p>
        <p className="muted">Оплатите занятия, чтобы снова получить доступ к конспектам, ДЗ и записям занятий.</p>
      </section>

      <section className="card">
        <div className="row-between info-row">
          <span className="muted">Задолженность</span>
          <span className="highlight-text">{(student?.debt_amount ?? 0).toLocaleString('ru-RU')} ₽</span>
        </div>
        {student?.access_closed_since && (
          <div className="row-between info-row">
            <span className="muted">Доступ закрыт с</span>
            <span>{new Date(student.access_closed_since).toLocaleDateString('ru-RU')}</span>
          </div>
        )}
      </section>

      <button className="btn-primary block">💳 Оплатить {(student?.debt_amount ?? 0).toLocaleString('ru-RU')} ₽</button>
      <p className="muted center small-text">После оплаты доступ откроется автоматически</p>
    </div>
  )
}
