import { useMemo, useState } from 'react'
import { topicStats, totals, ratingList, shortName, LEVELS, POINTS, currentMonth, shiftMonth, firstMonth, monthGen } from '../lib/progress'

// Одна полоса: подпись, «12 из 50», процент
function Bar({ icon, label, got, of, pct, unit = 'из', empty = 'нет данных' }) {
  return (
    <div className="pbar">
      <div className="row-between">
        <span className="pbar-label">{icon} {label}</span>
        <span className="pbar-val">{pct == null ? <span className="muted small-text">{empty}</span> : <>{got} {unit} {of} · <b>{pct}%</b></>}</span>
      </div>
      <div className="progress-track"><div className={'progress-fill ' + LEVELS[pct == null ? 'none' : (pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad')].cls} style={{ width: `${pct ?? 0}%` }} /></div>
    </div>
  )
}

// Прогресс ученика по номерам (общий для ученика, родителя и учителя)
export function ProgressView({ raw, studentId }) {
  const stats = useMemo(() => topicStats(raw, studentId), [raw, studentId])
  const tot = useMemo(() => totals(stats), [stats])
  const [open, setOpen] = useState(null)
  const weak = stats.filter(s => s.started && (s.level === 'bad' || s.level === 'mid')).sort((a, b) => Number(b.stale) - Number(a.stale) || a.mastery - b.mastery).slice(0, 3)

  return (
    <>
      <section className="card">
        <p className="eyebrow" style={{ marginTop: 0 }}>Всего по всем номерам</p>
        <Bar icon="📝" label="Банк задач" got={tot.bank.got} of={tot.bank.of} pct={tot.bank.pct} />
        <Bar icon="🧠" label="Мини-тесты" got={tot.quiz.got} of={tot.quiz.of} pct={tot.quiz.pct} />
        <Bar icon="📚" label="Домашние задания" got={tot.hw.got} of={tot.hw.of} pct={tot.hw.pct} empty="нет проверенных" />
      </section>

      {weak.length > 0 && (
        <section className="card">
          <p className="eyebrow" style={{ marginTop: 0 }}>Над чем поработать</p>
          {weak.map(s => (
            <p key={s.topic.id} className="muted">
              <span className={'lvl-dot ' + LEVELS[s.level].cls} /> <b style={{ color: 'var(--text)' }}>{s.topic.name}</b> — {s.mastery}%{s.stale ? ' · давно не повторяли' : ''}
            </p>
          ))}
        </section>
      )}

      <p className="eyebrow">По номерам</p>
      <ul className="card-list">
        {stats.map(s => (
          <li key={s.topic.id} className="card prog-card" onClick={() => setOpen(open === s.topic.id ? null : s.topic.id)}>
            <div className="row-between">
              <span className="card-title small">{s.topic.name}{s.stale && <span className="stale-mark" title="Давно не решали — уровень снижен"> ⏳</span>}</span>
              <span className={'lvl-tag ' + LEVELS[s.level].cls}>{s.mastery != null ? `${s.mastery}%` : LEVELS.none.label}</span>
            </div>
            <div className="mini-bars">
              <MiniBar title="Банк" pct={s.bankPct} />
              <MiniBar title="Тесты" pct={s.quizPct} />
              <MiniBar title="ДЗ" pct={s.hwPct} />
            </div>
            {open === s.topic.id && (
              <div className="prog-details">
                <Bar icon="📝" label="Банк задач" got={s.solved} of={s.tasksTotal} pct={s.bankPct} empty="в банке нет задач" />
                {s.tried > s.solved && <p className="muted small-text">Начато, но не решено верно: {s.tried - s.solved}</p>}
                <Bar icon="🧠" label="Мини-тесты" got={s.quizRight} of={s.quizTotal} pct={s.quizPct} empty="тестов нет" />
                <Bar icon="📚" label="ДЗ (верно задач)" got={s.hwC} of={s.hwT} pct={s.hwPct} empty="нет проверенных" />
                <p className="muted small-text">Общий процент номера — среднее этих трёх частей.</p>
                {s.stale && <p className="muted small-text">⏳ Последний раз решали верно {s.daysIdle} дн. назад — уровень снижен на ступень. Решите пару задач, и он вернётся.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function MiniBar({ title, pct }) {
  const lvl = pct == null ? 'none' : pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad'
  return (
    <div className="mini-bar">
      <span className="mini-bar-t">{title} {pct != null ? pct + '%' : '—'}</span>
      <div className="progress-track"><div className={'progress-fill ' + LEVELS[lvl].cls} style={{ width: `${pct ?? 0}%` }} /></div>
    </div>
  )
}

// Рейтинг учеников: по месяцам (с историей) и за всё время
export function RatingView({ raw, students, meId, showAll = false, meLabel = 'ты' }) {
  const now = currentMonth()
  const first = useMemo(() => firstMonth(raw), [raw])
  const [mode, setMode] = useState('month')
  const [period, setPeriod] = useState(now)
  const list = useMemo(() => ratingList(raw, students, mode === 'month' ? period : null), [raw, students, mode, period])
  const active = list.filter(r => r.total > 0)
  const top = showAll ? active : active.slice(0, 10)
  const me = list.find(r => r.student.id === meId)
  const meShown = top.some(r => r.student.id === meId)
  const isCurrent = period.key === now.key
  const canBack = period.key > first.key

  return (
    <>
      <div className="chip-wrap">
        <button className={'filter-chip' + (mode === 'month' ? ' active' : '')} onClick={() => setMode('month')}>📅 По месяцам</button>
        <button className={'filter-chip' + (mode === 'all' ? ' active' : '')} onClick={() => setMode('all')}>♾ За всё время</button>
      </div>

      {mode === 'month' && (
        <div className="month-nav">
          <button className="month-arrow" disabled={!canBack} onClick={() => setPeriod(shiftMonth(period, -1))}>‹</button>
          <div className="month-title">
            <span>{period.label}</span>
            <span className="muted small-text">{isCurrent ? 'идёт сейчас' : 'итоги месяца'}</span>
          </div>
          <button className="month-arrow" disabled={isCurrent} onClick={() => setPeriod(shiftMonth(period, 1))}>›</button>
        </div>
      )}

      {mode === 'month' && !isCurrent && active[0] && (
        <section className="card winner-card">
          <span className="winner-cup">🏆</span>
          <div>
            <p className="muted small-text" style={{ margin: 0 }}>Победитель {monthGen(period)}</p>
            <p className="card-title" style={{ margin: 0 }}>{shortName(active[0].student)} — {active[0].total} очков</p>
          </div>
        </section>
      )}

      <section className="card">
        {top.length === 0 && <p className="muted">{mode === 'month' ? (isCurrent ? 'В этом месяце ещё никто не набрал очков' : 'В этом месяце очков не было') : 'Пока никого нет'}</p>}
        {top.map(r => <RatingRow key={r.student.id} r={r} me={r.student.id === meId} meLabel={meLabel} />)}
        {me && !meShown && (<>{top.length > 0 && <p className="muted center">…</p>}<RatingRow r={me} me meLabel={meLabel} /></>)}
      </section>
      <p className="muted small-text">
        Очки: задача из банка (📝) — {POINTS.task}, вопрос теста (🧠) — {POINTS.quiz} — за первый верный ответ; пробник (📄) — тестовый балл лучшей попытки (до 100); свой пробник засчитывается один, лучший за месяц.
        {mode === 'month' ? ' Каждый месяц рейтинг начинается с нуля, прошлые месяцы сохраняются — листайте стрелками.' : ''}
      </p>
    </>
  )
}

function RatingRow({ r, me, meLabel }) {
  const medal = r.total > 0 ? ['🥇', '🥈', '🥉'][r.place - 1] : null
  return (
    <div className={'rating-row' + (me ? ' me' : '')}>
      <span className="rating-place">{medal || r.place}</span>
      <span className="rating-name">{shortName(r.student)}{me ? ` (${meLabel})` : ''}</span>
      <span className="rating-detail">📝{r.tasks} 🧠{r.quiz}{r.mocks ? ` 📄${r.mocks}` : ''}</span>
      <span className="rating-pts">{r.total}</span>
    </div>
  )
}
