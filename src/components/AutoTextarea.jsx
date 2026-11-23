import { useEffect, useRef } from 'react'

// Поле, которое растёт по мере ввода: весь текст виден целиком, без прокрутки стрелками
export default function AutoTextarea({ value, onChange, minRows = 1, className = 'text-input', style, ...rest }) {
  const ref = useRef(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 2 + 'px'
  }
  useEffect(fit, [value])
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit) }, [])
  return <textarea ref={ref} rows={minRows} className={className} style={{ resize: 'none', overflow: 'hidden', ...style }} value={value ?? ''} onChange={onChange} {...rest} />
}
