import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { loadProgressData, topicStats, shortName, LEVELS, levelOf } from '../../lib/progress'
import { ProgressView, RatingView } from '../../components/ProgressView'
import MockHistory from '../../components/MockHistory'

export default function TeacherProgress() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('table')
  const [metric, setMetric] = useState('mastery')
  const [raw, setRaw] = useState(null)
  const [students, setStudents] = useState([])
  const [error, setError] = useState('')
  const selected = params.get('student')

  async function load() {
    try {
      const [r, { data }] = await Promise.all([
        loadProgressData(),
        supabase.from('students').select('id, first_name, last_name, is_teacher, is_parent, hide_in_rating').eq('is_teacher', false).eq('is_parent', false).order('first_name'),
      ])
      setRaw(r); setStudents(data ?? [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const table = useMemo(() => raw ? students.map(s => ({ s, stats: topicStats(raw, s.id) })) : [], [raw, students])

  async function toggleHide(s) {
    await supabase.from('students').update({ hide_in_rating: !s.hide_in_rating }).eq('id', s.id)
    setStudents(prev => prev.map(x => x.id === s.id ? { ...x, hide_in_rating: !s.hide_in_rating } : x))
  }

  const sel = students.find(s => s.id === selected)
  if (sel) {
    return (
      <div className="screen">
        <button className="btn-secondary" onClick={() => setParams({})}>← Все ученики</button>
        <header className="screen-header"><h1>{sel.first_name} {sel.last_name}</h1></header>
        {raw ? <ProgressView raw={raw} studentId={sel.id} /> : <p className="muted">Загрузка…</p>}
        <p className="eyebrow">Пробники</p>
        <MockHistory studentId={sel.id} />
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Успеваемость</h1></header>
      <div className="chip-wrap">
        <button className={'filter-chip' + (tab === 'table' ? ' active' : '')} onClick={() => setTab('table')}>📊 По номерам</button>
        <button className={'filter-chip' + (tab === 'rating' ? ' active' : '')} onClick={() => setTab('rating')}>🏆 Рейтинг</button>
      </div>
      {error && <p className="error-text">⚠️ {error}</p>}
      {!raw ? <p className="muted">Загрузка…</p> : tab === 'table' ? (
        <>
          <div className="chip-wrap">
            {[['mastery', 'Общий'], ['bankPct', '📝 Банк'], ['quizPct', '🧠 Тесты'], ['hwPct', '📚 ДЗ']].map(([k, l]) => (
              <button key={k} className={'filter-chip' + (metric === k ? ' active' : '')} onClick={() => setMetric(k)}>{l}</button>
            ))}
          </div>
          <p className="muted small-text">Проценты — от всего, что есть в номере (например, решено 10 из 50 задач банка = 20%). Нажмите на ученика, чтобы открыть подробности. Цвет: зелёный — уверенно (80%+), жёлтый — повторить, красный — слабо, серый — не начато.</p>
          <div className="heat-wrap">
            <table className="heat">
              <thead>
                <tr><th className="heat-name">Ученик</th>{raw.topics.map(t => <th key={t.id} title={t.name}>{t.name.match(/№\s*\d+/)?.[0]?.replace(/\s/g, '') || t.name.slice(0, 4)}</th>)}</tr>
              </thead>
              <tbody>
                {table.map(({ s, stats }) => (
                  <tr key={s.id} onClick={() => setParams({ student: s.id })}>
                    <td className="heat-name">{shortName(s)}</td>
                    {stats.map(x => { const v = metric === 'mastery' ? x.mastery : (x.started ? x[metric] : null); return <td key={x.topic.id} className={'heat-cell ' + LEVELS[levelOf(v)].cls}>{v ?? ''}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.length === 0 && <p className="muted">Учеников пока нет</p>}
        </>
      ) : (
        <>
          <RatingView raw={raw} students={students} showAll />
          <p className="eyebrow">Показывать в рейтинге</p>
          <section className="card">
            {students.map(s => (
              <label key={s.id} className="checkbox-row">
                <input type="checkbox" checked={!s.hide_in_rating} onChange={() => toggleHide(s)} /> {s.first_name} {s.last_name}
              </label>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
