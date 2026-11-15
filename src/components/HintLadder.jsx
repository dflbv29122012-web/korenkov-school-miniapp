import { useState } from 'react'

const LABELS = ['Идея', 'Инструмент', 'Следующий шаг', 'Подумайте', 'Осторожно']
const ICON = { 'Идея': '💡', 'Инструмент': '🔧', 'Следующий шаг': '➡️', 'Подумайте': '🤔', 'Осторожно': '⚠️' }

// Текст: «## Заголовок» начинает раздел, строки «Идея: …» — ступеньки
export function parseHints(text) {
  const sections = []
  let cur = null
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('## ')) { cur = { title: line.slice(3).trim(), steps: [] }; sections.push(cur); continue }
    if (!cur) { cur = { title: 'Подсказки', steps: [] }; sections.push(cur) }
    const lab = LABELS.find(l => line.startsWith(l + ':'))
    cur.steps.push(lab ? { label: lab, text: line.slice(lab.length + 1).trim() } : { label: '', text: line })
  }
  return sections.filter(s => s.steps.length)
}

function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim() }

// focus — название подтемы: показываем «С чего начать» + подходящий раздел
export default function HintLadder({ text, focus }) {
  const all = parseHints(text)
  const [showAll, setShowAll] = useState(false)
  if (all.length === 0) return <p className="muted small-text">Подсказок к этому номеру пока нет.</p>

  const f = norm(String(focus || '').replace(/^.*·/, ''))
  const matched = f ? all.filter(s => { const t = norm(s.title); return t && (f.includes(t) || t.includes(f)) }) : []
  const start = all.filter(s => norm(s.title) === 'с чего начать')
  const list = showAll || matched.length === 0 ? all : [...start, ...matched.filter(s => !start.includes(s))]

  return (
    <div className="hint-ladder">
      <p className="muted small-text">Открывайте подсказки по одной: если после ступеньки задача пошла — дальше не читайте.</p>
      {list.map((s, i) => <HintSection key={s.title + i} section={s} />)}
      {matched.length > 0 && !showAll && all.length > list.length && (
        <button className="btn-secondary block" onClick={() => setShowAll(true)}>Все подсказки номера</button>
      )}
    </div>
  )
}

function HintSection({ section }) {
  const [shown, setShown] = useState(0)
  return (
    <div className="hint-section">
      <p className="hint-title">{section.title}</p>
      {section.steps.slice(0, shown).map((st, i) => (
        <div key={i} className={'hint-step' + (st.label === 'Осторожно' ? ' warn' : '')}>
          {st.label && <span className="hint-label">{ICON[st.label]} {st.label}</span>}
          <span>{st.text}</span>
        </div>
      ))}
      {shown < section.steps.length ? (
        <button className="hint-next" onClick={() => setShown(shown + 1)}>
          {shown === 0 ? 'Открыть первую подсказку' : `Ещё подсказка (${shown}/${section.steps.length}) ›`}
        </button>
      ) : (
        <button className="hint-next muted" onClick={() => setShown(0)}>Скрыть</button>
      )}
    </div>
  )
}
