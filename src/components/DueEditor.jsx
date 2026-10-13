import TimeSelect from './TimeSelect'
import { ymdOf } from '../lib/due'

// Дедлайн: дата + время (время можно не указывать)
export default function DueEditor({ date, time, onChange, suggest = ['12:00', '18:00', '20:00', '21:00', '23:59'] }) {
  const quick = [['Сегодня', 0], ['Завтра', 1], ['Через 3 дня', 3], ['Через неделю', 7]]
  return (
    <div className="due-editor">
      <input type="date" className="text-input" value={date || ''} onChange={e => onChange(e.target.value, time)} />
      <div className="chip-wrap">
        {quick.map(([l, n]) => {
          const v = ymdOf(new Date(Date.now() + n * 864e5))
          return <button key={n} type="button" className={'filter-chip' + (date === v ? ' active' : '')} onClick={() => onChange(v, time)}>{l}</button>
        })}
        {date && <button type="button" className="filter-chip" onClick={() => onChange('', '')}>Без дедлайна</button>}
      </div>
      {date && (
        <>
          <p className="muted small-text">Время (если не выбрать — до конца дня):</p>
          <TimeSelect value={time || ''} onChange={t => onChange(date, t)} suggest={suggest} />
          {time && <button type="button" className="filter-chip" onClick={() => onChange(date, '')}>Без времени</button>}
        </>
      )}
    </div>
  )
}
