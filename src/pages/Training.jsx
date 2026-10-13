import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AttachmentList } from '../components/FileUploader'
import { isCorrectAnswer, answerImages, solutionImages } from '../components/TaskBank'
import { buildSession, loadMyAttempts, mistakesQueue, streakInfo, topicLabel } from '../lib/learning'

// Тренировка: работа над ошибками или задачи вперемешку из пройденных номеров
export default function Training() {
  const { student } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState(params.get('mode') === 'mixed' ? 'mixed' : null)
  const [info, setInfo] = useState(null)       // { due, later, streak }
  const [session, setSession] = useState(null) // { tasks, topics }
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState('')
  const [res, setRes] = useState(null)         // 'ok' | 'bad'
  const [open, setOpen] = useState({})
  const [score, setScore] = useState({ ok: 0, all: 0 })
  const [loading, setLoading] = useState(false)

  async function loadInfo() {
    const att = await loadMyAttempts(student.id)
    const q = mistakesQueue(att)
    setInfo({ due: q.due.length, later: q.later.length, streak: streakInfo(att, student.daily_goal || 1) })
  }
  useEffect(() => { if (student) loadInfo() }, [student])
  useEffect(() => { if (mode && student) start(mode) }, [mode])

  async function start(m) {
    setLoading(true); setSession(null); setI(0); setAnswer(''); setRes(null); setOpen({}); setScore({ ok: 0, all: 0 })
    const s = await buildSession(student.id, m)
    setSession(s); setLoading(false)
  }

  async function check() {
    const t = session.tasks[i]
    if (!answer.trim() || res) return
    const ok = isCorrectAnswer(answer, t.answer)
    setRes(ok ? 'ok' : 'bad')
    setScore(s => ({ ok: s.ok + (ok ? 1 : 0), all: s.all + 1 }))
    await supabase.from('task_attempts').insert({ task_id: t.id, student_id: student.id, answer: answer.trim(), is_correct: ok, source: 'training' })
  }
  function next() { setI(i + 1); setAnswer(''); setRes(null); setOpen({}) }
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))

  // ---------- выбор режима ----------
  if (!mode) {
    return (
      <div className="screen">
        <header className="screen-header"><h1>Тренировка</h1></header>
        {info?.streak && <StreakCard s={info.streak} goal={student.daily_goal || 1} />}
        <button className="card choice-card" onClick={() => setMode('mistakes')} disabled={!info || info.due === 0}>
          <p className="card-title">🔁 Работа над ошибками</p>
          <p className="muted">{!info ? 'Загрузка…' : info.due > 0 ? `К повторению сегодня: ${info.due}` : info.later > 0 ? `Сегодня повторять нечего · ещё ${info.later} задач вернутся позже` : 'Ошибок для повторения нет 🎉'}</p>
          <p className="muted small-text">Задачи, где была ошибка, возвращаются через 1, 3 и 7 дней — так решение запоминается надолго.</p>
        </button>
        <button className="card choice-card" onClick={() => setMode('mixed')}>
          <p className="card-title">🎲 Вперемешку</p>
          <p className="muted">10 задач из номеров, которые вы уже начинали</p>
          <p className="muted small-text">Смешанные задачи учат узнавать тип задачи — как на настоящем экзамене.</p>
        </button>
      </div>
    )
  }

  if (loading || !session) return <div className="screen"><p className="muted">Подбираю задачи…</p></div>

  const back = <button className="btn-secondary block" onClick={() => { setMode(null); loadInfo() }}>← К выбору тренировки</button>

  if (!session.tasks.length) {
    return (
      <div className="screen">
        <header className="screen-header"><h1>Тренировка</h1></header>
        <section className="card"><p className="muted">{mode === 'mistakes' ? 'Сегодня повторять нечего.' : 'Пока нет начатых номеров. Решите несколько задач в разделе «Номера» — и тренировка соберётся из них.'}</p></section>
        <Link to="/topics" className="btn-primary block" style={{ textAlign: 'center', textDecoration: 'none' }}>📁 К номерам</Link>
        {back}
      </div>
    )
  }

  // ---------- итог ----------
  if (i >= session.tasks.length) {
    return (
      <div className="screen">
        <header className="screen-header"><h1>Готово!</h1></header>
        <section className="card status-card status-ok">
          <span className="status-icon">{score.ok === score.all ? '🏆' : '💪'}</span>
          <p className="status-title">Верно {score.ok} из {score.all}</p>
          <p className="muted">{mode === 'mistakes' ? 'Ошибки вернутся снова, пока не закрепятся.' : 'Задачи с ошибками попадут в «Работу над ошибками».'}</p>
        </section>
        <button className="btn-primary block" onClick={() => start(mode)}>Ещё 10 задач</button>
        {back}
      </div>
    )
  }

  // ---------- задача ----------
  const t = session.tasks[i]
  const aImgs = answerImages(t), sImgs = solutionImages(t)
  return (
    <div className="screen">
      <div className="row-between">
        <h1 style={{ margin: 0 }}>{mode === 'mistakes' ? '🔁 Ошибки' : '🎲 Вперемешку'}</h1>
        <span className="tag">{i + 1} / {session.tasks.length}</span>
      </div>
      <div className="progress-track" style={{ margin: '8px 0 12px' }}><div className="progress-fill" style={{ width: `${Math.round(i / session.tasks.length * 100)}%` }} /></div>

      <div className={'task-card' + (res === 'ok' ? ' solved' : '')}>
        <span className="task-num">{topicLabel(session.topics, t.topic_id)} · задача {t.position}</span>
        {t.condition && <p className="task-text">{t.condition}</p>}
        <AttachmentList items={t.condition_attachments} full />
        <div className="btn-row">
          <input className="text-input" placeholder="Ваш ответ" value={answer} disabled={!!res}
            onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') check() }} />
          {!res && <button className="btn-primary" onClick={check}>Проверить</button>}
        </div>
        {res === 'ok' && <p className="ontime-time">✅ Верно!</p>}
        {res === 'bad' && <p className="late-time">❌ Неверно. Правильный ответ: <b>{String(t.answer).split('|')[0]}</b></p>}
        <div className="task-actions">
          {t.hint && !res && <button className={'chip-btn' + (open.hint ? ' on' : '')} onClick={() => toggle('hint')}>💡 Подсказка</button>}
          {res && (t.solution || sImgs.length > 0 || aImgs.length > 0 || t.solution_video_url) && (
            <button className={'chip-btn' + (open.sol ? ' on' : '')} onClick={() => toggle('sol')}>📖 Решение</button>
          )}
        </div>
        {open.hint && <div className="task-panel hint"><p className="task-text">{t.hint}</p></div>}
        {open.sol && (
          <div className="task-panel">
            {t.solution && <p className="task-text">{t.solution}</p>}
            <AttachmentList items={sImgs} full />
            <AttachmentList items={aImgs} full />
          </div>
        )}
      </div>
      {res && <button className="btn-primary block" onClick={next}>{i + 1 < session.tasks.length ? 'Дальше →' : 'Завершить'}</button>}
      {!res && <button className="btn-secondary block" onClick={() => { setRes('bad'); setScore(s => ({ ...s, all: s.all + 1 })); supabase.from('task_attempts').insert({ task_id: t.id, student_id: student.id, answer: null, is_correct: false, source: 'training' }) }}>Не знаю — показать ответ</button>}
      {back}
    </div>
  )
}

// Карточка серии: огонёк, 7 дней, цель на сегодня
export function StreakCard({ s, goal, compact }) {
  const wd = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  return (
    <section className="card streak-card">
      <div className="row-between">
        <div>
          <p className="card-title" style={{ margin: 0 }}>🔥 Серия: {s.streak} {plural(s.streak, 'день', 'дня', 'дней')}</p>
          <p className="muted small-text">{s.doneToday ? 'Сегодня цель выполнена 🎉' : `Сегодня: ${s.todayCount} из ${goal} — реши ${goal - s.todayCount === 1 ? 'ещё одну задачу' : `ещё ${goal - s.todayCount}`}, чтобы продлить серию`}</p>
        </div>
        {!compact && <span className="muted small-text">рекорд {s.best}</span>}
      </div>
      <div className="streak-week">
        {s.week.map(d => (
          <div key={d.day} className={'streak-day' + (d.ok ? ' on' : '')}>
            <span>{d.ok ? '🔥' : '·'}</span>
            <small>{wd[(new Date(d.day + 'T12:00:00Z').getUTCDay() + 6) % 7]}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
