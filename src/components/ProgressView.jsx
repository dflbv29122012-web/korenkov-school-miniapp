import { useMemo, useState } from 'react'
import { topicStats, ratingList, weekAgo, shortName, LEVELS, POINTS } from '../lib/progress'

// Прогресс ученика по номерам (общий для ученика, родителя и учителя)
export function ProgressView({ raw, studentId }) {
  const stats = useMemo(() => topicStats(raw, studentId), [raw, studentId])
  const [open, setOpen] = useState(null)
  const count = (lvl) => stats.filter(s => s.level === lvl).length
  const weak = stats.filter(s => s.level === 'bad' || s.level === 'mid').sort((a, b) => a.mastery - b.mastery).slice(0, 3)

  return (
    <>
      <div className="stat-row">
        <div className="stat-box"><span className="stat-num green">{count('good')}</span><span className="stat-label">Уверенно</span></div>
        <div className="stat-box"><span className="stat-num yellow">{count('mid')}</span><span className="stat-label">Повторить</span></div>
        <div className="stat-box"><span className="stat-num red">{count('bad')}</span><span className="stat-label">Слабо</span></div>
      </div>

      {weak.length > 0 && (
        <section className="card">
          <p className="eyebrow" style={{ marginTop: 0 }}>Над чем поработать</p>
          {weak.map(s => (
            <p key={s.topic.id} className="muted">
              <span className={'lvl-dot ' + LEVELS[s.level].cls} /> <b style={{ color: 'var(--text)' }}>{s.topic.name}</b> — {s.mastery}%
            </p>
          ))}
        </section>
      )}

      <p className="eyebrow">Все номера</p>
      <ul className="card-list">
        {stats.map(s => (
          <li key={s.topic.id} className="card prog-card" onClick={() => setOpen(open === s.topic.id ? null : s.topic.id)}>
            <div className="row-between">
              <span className="card-title small">{s.topic.name}</span>
              <span className={'lvl-tag ' + LEVELS[s.level].cls}>{s.mastery != null ? `${s.mastery}%` : LEVELS.none.label}</span>
            </div>
            <div className="progress-track"><div className={'progress-fill ' + LEVELS[s.level].cls} style={{ width: `${s.mastery ?? 0}%` }} /></div>
            {open === s.topic.id && (
              <div className="prog-details">
                <p className="muted">📝 Задачи из банка: решено <b>{s.solved}</b> из {s.tried} начатых{s.tasksTotal ? ` (в банке ${s.tasksTotal})` : ''}</p>
                <p className="muted">🧠 Мини-тесты: верно <b>{s.quizRight}</b> из {s.quizDone} пройденных{s.quizTotal ? ` (всего ${s.quizTotal})` : ''}</p>
                <p className="muted">📚 Домашние задания: {s.hwPct != null ? <b>{s.hwPct}%</b> : 'нет проверенных'}</p>
                <p className="muted small-text">Уровень: {LEVELS[s.level].label}. Считается из задач (40%), тестов (30%) и ДЗ (30%) — по тому, что уже есть.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

// Рейтинг учеников
export function RatingView({ raw, students, meId, showAll = false, meLabel = 'ты' }) {
  const [period, setPeriod] = useState('week')
  const list = useMemo(() => ratingList(raw, students, period === 'week' ? weekAgo() : null), [raw, students, period])
  const active = list.filter(r => r.total > 0)
  const top = showAll ? active : active.slice(0, 10)
  const me = list.find(r => r.student.id === meId)
  const meShown = top.some(r => r.student.id === meId)

  return (
    <>
      <div className="chip-wrap">
        <button className={'filter-chip' + (period === 'week' ? ' active' : '')} onClick={() => setPeriod('week')}>За неделю</button>
        <button className={'filter-chip' + (period === 'all' ? ' active' : '')} onClick={() => setPeriod('all')}>За всё время</button>
      </div>
      <section className="card">
        {top.length === 0 && <p className="muted">{period === 'week' ? 'На этой неделе ещё никто не набрал очков' : 'Пока никого нет'}</p>}
        {top.map(r => <RatingRow key={r.student.id} r={r} me={r.student.id === meId} meLabel={meLabel} />)}
        {me && !meShown && (<>{top.length > 0 && <p className="muted center">…</p>}<RatingRow r={me} me meLabel={meLabel} /></>)}
      </section>
      <p className="muted small-text">Очки: задача из банка — {POINTS.task}, вопрос теста — {POINTS.quiz} (за первый верный ответ), пробник — до 50 за лучшую попытку.</p>
    </>
  )
}

function RatingRow({ r, me, meLabel }) {
  const medal = r.total > 0 ? ['🥇', '🥈', '🥉'][r.place - 1] : null
  return (
    <div className={'rating-row' + (me ? ' me' : '')}>
      <span className="rating-place">{medal || r.place}</span>
      <span className="rating-name">{shortName(r.student)}{me ? ` (${meLabel})` : ''}</span>
      <span className="rating-pts">{r.total}</span>
    </div>
  )
}
