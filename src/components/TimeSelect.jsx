const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

// Время без ручного ввода цифр: два списка (час, минуты) + быстрые кнопки с прошлыми временами
export default function TimeSelect({ value, onChange, suggest = [] }) {
  const [h, m] = String(value || '').split(':')
  const mins = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES
  const set = (nh, nm) => onChange(`${nh}:${nm}`)
  return (
    <div className="time-select">
      <div className="time-row">
        <select className="text-input" value={h || ''} onChange={e => set(e.target.value, m || '00')}>
          <option value="" disabled>час</option>
          {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="time-colon">:</span>
        <select className="text-input" value={m || ''} onChange={e => set(h || '16', e.target.value)}>
          <option value="" disabled>мин</option>
          {mins.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      {suggest.length > 0 && (
        <div className="chip-wrap time-chips">
          {suggest.map(t => (
            <button type="button" key={t} className={'filter-chip' + (t === value ? ' active' : '')} onClick={() => onChange(t)}>{t}</button>
          ))}
        </div>
      )}
    </div>
  )
}
