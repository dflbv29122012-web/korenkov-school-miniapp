import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Поле ответа. На iPhone клавиатура не содержит минуса, дроби, π, корня и т. п., поэтому над ней,
// пока поле в фокусе, показываем прокручиваемую панель символов. Набор подобран по реальным ответам банка
// (по частоте): − / , π ( ) ; √ + ∪ [ ] ∞ ℤ ∈ ± arccos arctg arcsin ₂ ₃ ₅ а) б) в)
const KEYS = [
  ['−', '-'], ['/', '/'], [',', ','], ['π', 'π'], ['√', '√'], ['(', '('], [')', ')'], [';', '; '],
  ['∪', '∪'], ['∞', '∞'], ['[', '['], [']', ']'], ['+', '+'], ['±', '±'],
  ['arccos', 'arccos('], ['arctg', 'arctg('], ['arcsin', 'arcsin('], ['log', 'log'],
  ['₂', '₂'], ['₃', '₃'], ['₅', '₅'], ['ℤ', 'ℤ'], ['∈', '∈'],
  ['а)', 'а) '], ['б)', 'б) '], ['в)', 'в) '],
]

export default function AnswerInput({ value, onChange, placeholder = 'Ваш ответ', onEnter, disabled = false }) {
  const ref = useRef(null)
  const [focus, setFocus] = useState(false)
  const [top, setTop] = useState(null)

  // панель всегда прижата к верхней границе клавиатуры (visualViewport)
  useEffect(() => {
    if (!focus) return
    const vv = window.visualViewport
    const place = () => setTop(vv ? vv.offsetTop + vv.height - 44 : window.innerHeight - 44)
    place()
    vv?.addEventListener('resize', place); vv?.addEventListener('scroll', place)
    return () => { vv?.removeEventListener('resize', place); vv?.removeEventListener('scroll', place) }
  }, [focus])

  function insert(ch) {
    const el = ref.current
    const v = String(value ?? '')
    const a = el?.selectionStart ?? v.length, b = el?.selectionEnd ?? v.length
    onChange(v.slice(0, a) + ch + v.slice(b))
    requestAnimationFrame(() => { try { el?.focus(); el?.setSelectionRange(a + ch.length, a + ch.length) } catch { /* ignore */ } })
  }

  return (
    <>
      <input ref={ref} className="text-input" style={{ flex: 1, minWidth: 0 }} inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
        placeholder={placeholder} value={String(value ?? '')} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }} />
      {focus && top != null && createPortal(
        <div style={{ position: 'fixed', left: 0, right: 0, top, height: 44, zIndex: 9999, display: 'flex', gap: 6, padding: '4px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: '#14142a', borderTop: '1px solid #2a2a44', boxSizing: 'border-box' }}>
          {KEYS.map(([label, ch]) => (
            <button key={label} type="button"
              onPointerDown={e => { e.preventDefault(); insert(ch) }}
              style={{ flex: '0 0 auto', minWidth: 44, padding: '0 10px', borderRadius: 8, border: '1px solid #2a2a44', background: '#1f1f3a', color: '#ffd24a', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{label}</button>
          ))}
        </div>, document.body)}
    </>
  )
}
