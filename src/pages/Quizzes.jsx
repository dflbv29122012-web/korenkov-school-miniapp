import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const KINDS = { formula: 'Формула', next_step: 'Следующий шаг', result: 'Результат шага', find_error: 'Найди ошибку', picture: 'По картинке' }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Quizzes() {
  const { student } = useAuth()
  const [questions, setQuestions] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState(null)       // выбранная тема
  const [session, setSession] = useState(null)   // {list, i, chosen, score}

  async function load() {
    const [{ data: q }, { data: a }] = await Promise.all([
      supabase.from('quiz_questions').select('*').order('position'),
      supabase.from('quiz_attempts').select('question_id, is_correct, created_at').eq('student_id', student.id).order('created_at'),
    ])
    setQuestions(q ?? [])
    setAttempts(a ?? [])
    setLoading(false)
  }
  useEffect(() => { if (student) load() }, [student])

  const topics = useMemo(() => {
    const m = {}
    questions.forEach(q => { (m[q.topic] ||= []).push(q) })
    return m
  }, [questions])

  // последний результат по каждому вопросу
  const last = useMemo(() => {
    const m = {}
    attempts.forEach(a => { m[a.question_id] = a.is_correct })
    return m
  }, [attempts])

  function start(list) {
    if (!list.length) return
    const prepared = shuffle(list).map(q => ({
      ...q,
      order: shuffle((q.options ?? []).map((text, idx) => ({ text, idx }))),
    }))
    setSession({ list: prepared, i: 0, chosen: null, score: 0, wrong: [] })
  }

  async function choose(opt) {
    if (session.chosen !== null) return
    const q = session.list[session.i]
    const ok = opt.idx === q.correct_index
    setSession({ ...session, chosen: opt.idx, score: session.score + (ok ? 1 : 0), wrong: ok ? session.wrong : [...session.wrong, q] })
    await supabase.from('quiz_attempts').insert({ student_id: student.id, question_id: q.id, chosen_index: opt.idx, is_correct: ok })
  }

  function next() {
    if (session.i + 1 >= session.list.length) setSession({ ...session, done: true })
    else setSession({ ...session, i: session.i + 1, chosen: null })
  }

  function exit() { setSession(null); load() }

  if (loading) return <div className="screen"><p className="muted">Загрузка…</p></div>

  // ---------- Прохождение ----------
  if (session && session.done) {
    const total = session.list.length
    return (
      <div className="screen">
        <header className="screen-header"><h1>Результат</h1></header>
        <div className="card status-card">
          <span className="status-icon">{session.score === total ? '🏆' : session.score >= total / 2 ? '👍' : '💪'}</span>
          <p className="status-title">{session.score} из {total}</p>
          <p className="muted">{Math.round(session.score / total * 100)}% верно</p>
        </div>
        {session.wrong.length > 0 && (
          <>
            <p className="eyebrow">Повтори</p>
            {session.wrong.map(q => (
              <div key={q.id} className="card">
                <p className="card-title">{q.question}</p>
                <p className="ontime-time">✓ {q.options[q.correct_index]}</p>
                {q.explanation && <p className="muted">{q.explanation}</p>}
              </div>
            ))}
          </>
        )}
        <div className="btn-row">
          {session.wrong.length > 0 && <button className="btn-primary" onClick={() => start(session.wrong)}>Повторить ошибки</button>}
          <button className="btn-secondary" onClick={exit}>К темам</button>
        </div>
      </div>
    )
  }

  if (session) {
    const q = session.list[session.i]
    const answered = session.chosen !== null
    return (
      <div className="screen">
        <div className="row-between">
          <span className="muted">Вопрос {session.i + 1} из {session.list.length}</span>
          <button className="file-move" onClick={exit}>✕ Выйти</button>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${(session.i + (answered ? 1 : 0)) / session.list.length * 100}%` }} /></div>
        <div className="card">
          <p className="eyebrow" style={{ marginTop: 0 }}>{q.topic}</p>
          {q.kind && KINDS[q.kind] && q.kind !== 'formula' && <span className="tag tag-blue">{KINDS[q.kind]}</span>}
          {q.context && <p className="quiz-context">{q.context}</p>}
          {q.image_url && <img className="quiz-img" src={q.image_url} alt="" />}
          <p className="card-title-lg">{q.question}</p>
          {q.order.map(opt => {
            const isRight = opt.idx === q.correct_index
            const isChosen = opt.idx === session.chosen
            let cls = 'btn-secondary'
            let mark = ''
            if (answered && isRight) { cls = 'btn-secondary quiz-right'; mark = '✓ ' }
            else if (answered && isChosen) { cls = 'btn-secondary quiz-wrong'; mark = '✗ ' }
            return (
              <button key={opt.idx} className={cls + ' block quiz-option'} disabled={answered} onClick={() => choose(opt)}>
                {mark}{opt.text}
              </button>
            )
          })}
          {answered && (
            <div className={'card ' + (session.chosen === q.correct_index ? 'status-ok' : 'status-bad')} style={{ margin: '12px 0 0' }}>
              <p className="card-title">{session.chosen === q.correct_index ? '✓ Верно!' : '✗ Неверно'}</p>
              {session.chosen !== q.correct_index && <p className="muted">Правильно: <b>{q.options[q.correct_index]}</b></p>}
              {q.explanation && <p className="muted">{q.explanation}</p>}
            </div>
          )}
        </div>
        {answered && <button className="btn-primary block" onClick={next}>{session.i + 1 >= session.list.length ? 'Закончить' : 'Дальше →'}</button>}
      </div>
    )
  }

  // ---------- Выбор темы ----------
  const names = Object.keys(topics)
  const answeredCount = Object.keys(last).length
  const rightCount = Object.values(last).filter(Boolean).length
  return (
    <div className="screen">
      <header className="screen-header"><h1>Мини-тесты</h1></header>
      <p className="muted">Формулы, теоремы и свойства. Выбери тему или пройди всё подряд.</p>

      <div className="stat-row">
        <div className="stat-box"><span className="stat-num blue">{questions.length}</span><span className="stat-label">Вопросов</span></div>
        <div className="stat-box"><span className="stat-num yellow">{answeredCount}</span><span className="stat-label">Пройдено</span></div>
        <div className="stat-box"><span className="stat-num green">{rightCount}</span><span className="stat-label">Верно сейчас</span></div>
      </div>

      {questions.length === 0 && <p className="muted">Тестов пока нет</p>}
      {questions.length > 0 && (
        <button className="btn-primary block" onClick={() => start(questions)}>🎲 Все вопросы вперемешку</button>
      )}

      <ul className="card-list">
        {names.map(name => {
          const list = topics[name]
          const done = list.filter(q => q.id in last).length
          const right = list.filter(q => last[q.id]).length
          const pct = list.length ? Math.round(right / list.length * 100) : 0
          return (
            <li key={name} className="card" style={{ cursor: 'pointer' }} onClick={() => start(list)}>
              <div className="row-between">
                <div>
                  <p className="card-title">{name}</p>
                  <p className="muted">{list.length} вопросов · пройдено {done} · верно {right}</p>
                </div>
                <span className="badge badge-checked">▶</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
