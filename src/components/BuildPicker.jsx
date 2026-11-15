import { useState } from 'react'

// Выбор состава варианта: по каждому номеру — сколько заданий и (по желанию) какие прототипы.
// plan: { [num]: { count: число, subs: [id темы, ...] } }  (subs пусто = любой прототип)
export function poolFor(x, entry, tasks) {
  const subs = entry?.subs || []
  return tasks.filter(t => t.topic_id === x.topicId && (!subs.length || subs.includes(t.subtopic_id)))
}

export function planTotal(plan) {
  return Object.values(plan || {}).reduce((s, e) => s + (e?.count || 0), 0)
}

// Случайный набор по плану: сначала нерешённые ранее задания (solved — Set id), без повторов
export function pickFromPlan(nums, plan, tasks, solved = new Set()) {
  const out = []
  nums.forEach(x => {
    const e = plan[x.num]
    if (!e?.count) return
    const pool = poolFor(x, e, tasks)
    const shuffle = (a) => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1])
    const fresh = shuffle(pool.filter(t => !solved.has(t.id)))
    const old = shuffle(pool.filter(t => solved.has(t.id)))
    ;[...fresh, ...old].slice(0, e.count).forEach(task => out.push({ task, num: x.num }))
  })
  return out
}

export default function BuildPicker({ nums, tasks, subtopics, plan, onChange }) {
  const [openNum, setOpenNum] = useState(null)

  function setEntry(num, patch) {
    const cur = plan[num] || { count: 0, subs: [] }
    onChange({ ...plan, [num]: { ...cur, ...patch } })
  }

  return (
    <div className="build-list">
      {nums.map(x => {
        const e = plan[x.num] || { count: 0, subs: [] }
        const pool = poolFor(x, e, tasks)
        const total = tasks.filter(t => t.topic_id === x.topicId).length
        const subs = subtopics.filter(s => s.topic_id === x.topicId && tasks.some(t => t.subtopic_id === s.id))
        const showSubs = openNum === x.num
        return (
          <div key={x.num} className={'build-row' + (e.count ? ' on' : '')}>
            <div className="row-between">
              <span className="build-num">№{x.num}</span>
              <span className="muted small-text">в банке: {pool.length}{e.subs.length ? ` из ${total}` : ''}</span>
              <div className="row-center" style={{ gap: 6 }}>
                <button type="button" className="file-move" disabled={!e.count} onClick={() => setEntry(x.num, { count: Math.max(0, e.count - 1) })}>−</button>
                <input className="inline-input" type="number" min="0" max={pool.length} value={e.count}
                  onChange={ev => setEntry(x.num, { count: Math.min(pool.length, Math.max(0, Number(ev.target.value) || 0)) })} style={{ width: 52, textAlign: 'center' }} />
                <button type="button" className="file-move" disabled={e.count >= pool.length} onClick={() => setEntry(x.num, { count: e.count + 1 })}>+</button>
              </div>
            </div>
            {subs.length > 1 && (
              <button type="button" className="chip-btn" onClick={() => setOpenNum(showSubs ? null : x.num)}>
                🎯 {e.subs.length ? `прототипы: ${e.subs.length}` : 'любые прототипы'} {showSubs ? '▲' : '▼'}
              </button>
            )}
            {showSubs && (
              <div className="chip-wrap">
                {subs.map(s => {
                  const on = e.subs.includes(s.id)
                  const n = tasks.filter(t => t.subtopic_id === s.id).length
                  return (
                    <button type="button" key={s.id} className={'filter-chip' + (on ? ' active' : '')}
                      onClick={() => {
                        const next = on ? e.subs.filter(i => i !== s.id) : [...e.subs, s.id]
                        const cnt = poolFor(x, { subs: next }, tasks).length
                        setEntry(x.num, { subs: next, count: Math.min(e.count, cnt) })
                      }}>{s.name} ({n})</button>
                  )
                })}
                {e.subs.length > 0 && <button type="button" className="filter-chip" onClick={() => setEntry(x.num, { subs: [] })}>Сбросить</button>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
