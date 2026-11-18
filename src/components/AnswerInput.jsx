// Поле ответа. На iPhone цифровая клавиатура не содержит минуса, поэтому оставляем
// обычную клавиатуру и добавляем кнопку «−», которая ставит/убирает минус в начале ответа.
export default function AnswerInput({ value, onChange, placeholder = 'Ваш ответ', onEnter, disabled = false }) {
  const v = String(value ?? '')
  const neg = /^[-−–]/.test(v.trim())
  const toggleMinus = () => onChange(neg ? v.trim().replace(/^[-−–]\s*/, '') : '-' + v.trim())
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flex: 1, minWidth: 0 }}>
      <button type="button" disabled={disabled} onClick={toggleMinus} aria-label="Поставить или убрать минус"
        style={{ flex: '0 0 auto', width: 48, borderRadius: 12, border: '1px solid #2a2a44', fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer',
          background: neg ? '#5b6cff' : '#1b1b30', color: neg ? '#fff' : '#ffd24a' }}>−</button>
      <input className="text-input" style={{ flex: 1, minWidth: 0 }} inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
        placeholder={placeholder} value={v} disabled={disabled} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }} />
    </div>
  )
}
