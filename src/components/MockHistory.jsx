import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings, toTest } from '../lib/settings'
import { Review } from '../pages/Mocks'

const STATUS = { submitted: 'ждёт проверки 2 части', checked: 'проверен' }

// Маленький график процентов по попыткам
export function Sparkline({ values, height = 48 }) {
  if (values.length < 2) return null
  const w = 260, pad = 6
  const x = (i) => pad + i * (w - 2 * pad) / (values.length - 1)
  const y = (v) => height - pad - v / 100 * (height - 2 * pad)
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="sparkline" preserveAspectRatio="none">
      <line x1={pad} x2={w - pad} y1={y(50)} y2={y(50)} className="spark-grid" />
      <polyline points={pts} className="spark-line" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" className="spark-dot" />)}
    </svg>
  )
}

// Ошибки по номерам в попытке: { '5': {ok, total} }
export function byNumber(attempt) {
  const out = {}
  Object.values(attempt.answers || {}).forEach(a => {
    const n = a.num || '?'
    if (!out[n]) out[n] = { got: 0, max: 0, wait: false }
    out[n].max += a.points || 0
    if (a.got == null) out[n].wait = true
    else out[n].got += a.got
  })
  return Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
}

export function NumberChips({ attempt }) {
  return (
    <div className="num-chips">
      {byNumber(attempt).map(([n, v]) => (
        <span key={n} className={'num-chip ' + (v.wait ? 'wait' : v.got >= v.max ? 'ok' : v.got > 0 ? 'part' : 'bad')}>
          {n}{v.wait ? ' · ?' : v.max > 1 ? ` · ${v.got}/${v.max}` : ''}
        </span>
      ))}
    </div>
  )
}

export default function MockHistory({ studentId }) {
  const settings = useSettings()
  const test = (a) => toTest(a.score, settings.scale)
  const [review, setReview] = useState(null)
  const [rows, setRows] = useState(null)
  const [exams, setExams] = useState({})
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!studentId) return
    supabase.from('mock_attempts').select('*').eq('student_id', studentId).neq('status', 'in_progress').order('submitted_at')
      .then(async ({ data }) => {
        const list = data ?? []
        const ids = [...new Set(list.map(a => a.exam_id))]
        if (ids.length) {
          const { data: ex } = await supabase.from('mock_exams').select('id, title, show_solutions, is_self').in('id', ids)
          const m = {}; (ex ?? []).forEach(e => { m[e.id] = e }); setExams(m)
        }
        setRows(list)
      })
  }, [studentId])

  if (!rows) return <p className="muted">Загрузка…</p>
  if (!rows.length) return <p className="muted">Пробников пока не было</p>

  const last = rows[rows.length - 1]
  const best = Math.max(...rows.map(test))
  if (review) return (
    <>
      <button className="btn-secondary" onClick={() => setReview(null)}>← К истории</button>
      <p className="card-title" style={{ marginTop: 12 }}>{exams[review.exam_id]?.title || 'Пробник'}</p>
      <Review exam={{ id: review.exam_id, show_solutions: exams[review.exam_id]?.show_solutions ?? true }} attempt={review} embedded />
    </>
  )
  return (
    <>
      <div className="stat-row">
        <div className="stat-box"><span className="stat-num blue">{rows.length}</span><span className="stat-label">Попыток</span></div>
        <div className="stat-box"><span className="stat-num yellow">{test(last)}</span><span className="stat-label">Последний, тест.</span></div>
        <div className="stat-box"><span className="stat-num green">{best}</span><span className="stat-label">Лучший, тест.</span></div>
      </div>
      <section className="card">
        <p className="eyebrow" style={{ marginTop: 0 }}>Динамика тестового балла</p>
        <Sparkline values={rows.map(test)} />
        {rows.length < 2 && <p className="muted small-text">График появится после второго пробника</p>}
      </section>
      <ul className="card-list">
        {[...rows].reverse().map(a => (
          <li key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === a.id ? null : a.id)}>
            <div className="row-between">
              <div>
                <p className="card-title small">{exams[a.exam_id]?.title || 'Пробник'}</p>
                <p className="muted small-text">{new Date(a.submitted_at).toLocaleDateString('ru-RU')} · {STATUS[a.status] || ''}</p>
              </div>
              <div className="hist-score"><span className="score-badge test">{test(a)}</span><span className="muted small-text">{a.score}/{a.max_score} перв.</span></div>
            </div>
            {open === a.id && (
              <>
                <p className="muted small-text">По номерам (зелёный — верно, жёлтый — частично, красный — ошибка, серый — ждёт проверки):</p>
                <NumberChips attempt={a} />
                {a.teacher_comment && <p className="muted">💬 {a.teacher_comment}</p>}
                <button className="btn-secondary block" onClick={(e) => { e.stopPropagation(); setReview(a) }}>📖 Разбор и решения</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
