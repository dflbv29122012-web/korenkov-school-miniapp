import { useMemo } from 'react'

// Едва заметная подпись поверх всего экрана: имя и номер ученика.
// На учёбу не влияет, но любой скриншот или запись экрана с платными материалами показывает, чей это аккаунт.
export default function Watermark({ student }) {
  const bg = useMemo(() => {
    const label = `${student.first_name || ''} ${(student.last_name || '').slice(0, 1)} · ${student.telegram_id || ''}`
      .replace(/[<>&"']/g, '').trim()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="170"><text x="10" y="100" transform="rotate(-24 130 85)" font-family="sans-serif" font-size="13" fill="#ffffff" fill-opacity="0.055">${label}</text></svg>`
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  }, [student.first_name, student.last_name, student.telegram_id])
  return <div className="watermark" aria-hidden="true" style={{ backgroundImage: bg }} />
}
