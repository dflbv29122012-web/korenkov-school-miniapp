import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { topicStats } from '../lib/progress'
import { pointsFor, fullMax, toTest } from '../lib/settings'

// Прогноз балла ЕГЭ: по последним полным пробникам и по освоению номеров
export function forecast(raw, studentId) {
  const s = raw.settings
  const stats = topicStats(raw, studentId)
  const max = fullMax(s)
  const mocks = raw.mockAttempts
    .filter(m => m.student_id === studentId && m.submitted_at && Number(m.max_score) === max)
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)).slice(0, 3)
  const byMocks = mocks.length ? Math.round(mocks.reduce((a, m) => a + toTest(m.score, s.scale), 0) / mocks.length) : null

  const nums = Object.keys(s.points).map(Number).sort((a, b) => a - b)
  const statByNum = Object.fromEntries(stats.filter(x => x.num).map(x => [Number(x.num), x]))
  let primary = 0
  const gains = []
  nums.forEach(n => {
    const st = statByNum[n]
    const pts = pointsFor(n, s)
    const m = st?.mastery != null ? st.mastery / 100 : 0
    primary += pts * m
    const gain = pts * (1 - m)
    if (gain > 0.2) gains.push({ num: n, name: st?.topic?.name || `№${n}`, gain, pts, mastery: st?.mastery ?? null, topicId: st?.topic?.id })
  })
  const anyStarted = stats.some(x => x.started)
  return {
    byMocks, mocksN: mocks.length,
    byBank: anyStarted ? toTest(Math.round(primary), s.scale) : null,
    primary: Math.round(primary * 10) / 10, max,
    gains: gains.sort((a, b) => b.gain - a.gain || a.num - b.num).slice(0, 4),
  }
}

const TARGETS = [50, 60, 70, 80, 90, 100]
const GOALS = [1, 3, 5, 10]

export default function GoalView({ raw, student, onSaved, readOnly }) {
  const f = useMemo(() => forecast(raw, student.id), [raw, student.id])
  const [target, setTarget] = useState(student.target_score ?? null)
  const [goal, setGoal] = useState(student.daily_goal || 1)
  const [custom, setCustom] = useState('')
  const [msg, setMsg] = useState('')
  const main = f.byMocks ?? f.byBank

  async function save(patch) {
    setMsg('')
    const { error } = await supabase.from('students').update(patch).eq('id', student.id)
    if (error) return setMsg('Не удалось сохранить: ' + error.message)
    onSaved?.()
  }
  const pickTarget = (v) => { const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0))); if (!n) return; setTarget(n); save({ target_score: n }) }
  const pickGoal = (v) => { setGoal(v); save({ daily_goal: v }) }

  return (
    <>
      <section className="card goal-card">
        <p className="eyebrow" style={{ marginTop: 0 }}>🎯 Цель на ЕГЭ</p>
        <div className="goal-row">
          <div className="goal-box"><span className="goal-num">{target ?? '—'}</span><span className="muted small-text">цель</span></div>
          <div className="goal-box"><span className={'goal-num ' + (main == null ? '' : target && main >= target ? 'green' : 'yellow')}>{main ?? '—'}</span><span className="muted small-text">прогноз</span></div>
          <div className="goal-box"><span className="goal-num">{target && main != null ? Math.max(0, target - main) : '—'}</span><span className="muted small-text">осталось</span></div>
        </div>
        {target && main != null && main < target && <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(main / target * 100)}%` }} /></div>}
        <p className="muted small-text">
          {f.byMocks != null ? `Прогноз — средний балл последних ${f.mocksN} полных пробников.` : 'Полных пробников пока нет — прогноз по освоению номеров.'}
          {f.byMocks != null && f.byBank != null ? ` По освоению номеров: ${f.byBank}.` : ''}
        </p>
        {!readOnly && (
          <>
            <p className="muted small-text" style={{ marginBottom: 4 }}>Ваша цель (тестовые баллы):</p>
            <div className="chip-wrap">
              {TARGETS.map(v => <button key={v} className={'filter-chip' + (target === v ? ' active' : '')} onClick={() => pickTarget(v)}>{v}</button>)}
              <input className="text-input score-input" style={{ width: 70, margin: 0 }} inputMode="numeric" placeholder="своя" value={custom}
                onChange={e => setCustom(e.target.value)} onBlur={() => { if (custom) { pickTarget(custom); setCustom('') } }} />
            </div>
          </>
        )}
      </section>

      {f.gains.length > 0 && (
        <section className="card">
          <p className="eyebrow" style={{ marginTop: 0 }}>Где добрать баллы</p>
          <p className="muted small-text">Номера, которые дадут больше всего первичных баллов, если их подтянуть:</p>
          {f.gains.map(g => (
            <div key={g.num} className="row-between info-row">
              <span><b>{g.name}</b> <span className="muted small-text">{g.mastery != null ? `освоено ${g.mastery}%` : 'не начато'}</span></span>
              <span className="tag tag-yellow">до +{Math.round(g.gain * 10) / 10} перв.</span>
            </div>
          ))}
          {!readOnly && <Link to="/topics" className="btn-secondary block" style={{ textAlign: 'center', textDecoration: 'none' }}>📁 К номерам</Link>}
        </section>
      )}

      {!readOnly && (
        <section className="card">
          <p className="eyebrow" style={{ marginTop: 0 }}>🔥 Цель на каждый день</p>
          <p className="muted small-text">Сколько задач решить верно, чтобы день засчитался в серию:</p>
          <div className="chip-wrap">
            {GOALS.map(v => <button key={v} className={'filter-chip' + (goal === v ? ' active' : '')} onClick={() => pickGoal(v)}>{v} {v === 1 ? 'задача' : v < 5 ? 'задачи' : 'задач'}</button>)}
          </div>
        </section>
      )}
      {msg && <p className="error-text">⚠️ {msg}</p>}
    </>
  )
}
