import { useMemo, useState } from 'react'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

// dates — Set из date.toDateString() дней, где есть занятия
// selected — выбранный день (toDateString) или null
export default function Calendar({ dates, selected, onSelect }) {
  const [cursor, setCursor] = useState(new Date())
  const now = new Date()

  const days = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const offset = (new Date(y, m, 1).getDay() + 6) % 7
    const total = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    return cells
  }, [cursor])

  return (
    <section className="card calendar-card">
      <div className="calendar-nav">
        <button className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
        <p className="calendar-title">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
        <button className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="calendar-grid weekdays">
        {WEEKDAYS.map(w => <span key={w} className="muted">{w}</span>)}
      </div>
      <div className="calendar-grid">
        {days.map((d, i) => {
          if (!d) return <span key={i} />
          const key = new Date(cursor.getFullYear(), cursor.getMonth(), d).toDateString()
          const cls = ['calendar-day', 'clickable']
          if (key === now.toDateString()) cls.push('today')
          if (key === selected) cls.push('selected')
          return (
            <div key={i} className={cls.join(' ')} onClick={() => onSelect && onSelect(key === selected ? null : key)}>
              {d}
              {dates.has(key) && <span className="calendar-dot" />}
            </div>
          )
        })}
      </div>
      {selected && (
        <button className="btn-secondary block" onClick={() => onSelect(null)}>Показать все дни</button>
      )}
    </section>
  )
}
