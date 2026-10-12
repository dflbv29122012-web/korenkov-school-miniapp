import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadFiles } from '../lib/storage'
import { loadExamSlots, examsForStudent, fmtTime, showAnswer, sumScore } from '../lib/mocks'
import { isCorrectAnswer, answerImages, solutionImages } from '../components/TaskBank'
import { AttachmentList } from '../components/FileUploader'
import { NumberChips } from '../components/MockHistory'

export default function Mocks() {
  const { student } = useAuth()
  const [exams, setExams] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [run, setRun] = useState(null) // { exam, attempt }
  const [view, setView] = useState(null) // { exam, attempt } — разбор

  async function load() {
    const list = await examsForStudent(student.id)
    const { data } = await supabase.from('mock_attempts').select('*').eq('student_id', student.id).order('started_at')
    setExams(list); setAttempts(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function start(exam) {
    const open = attempts.find(a => a.exam_id === exam.id && a.status === 'in_progress')
    if (open) return setRun({ exam, attempt: open })
    const { data, error } = await supabase.from('mock_attempts').insert({ exam_id: exam.id, student_id: student.id }).select().single()
    if (error) return alert('Ошибка: ' + error.message)
    setRun({ exam, attempt: data })
  }

  if (run) return <TakeExam {...run} studentId={student.id} onDone={(attempt) => { setRun(null); setView({ exam: run.exam, attempt }); load() }} />
  if (view) return <Review {...view} onBack={() => setView(null)} />

  return (
    <div className="screen">
      <header className="screen-header"><h1>Пробники</h1></header>
      <p className="muted">Полный вариант на время. Первая часть проверяется сразу, вторую проверит учитель.</p>
      {!exams ? <p className="muted">Загрузка…</p> : exams.length === 0 ? <p className="muted">Пробников пока нет</p> : (
        <ul className="card-list">
          {exams.map(e => {
            const mine = attempts.filter(a => a.exam_id === e.id)
            const done = mine.filter(a => a.status !== 'in_progress')
            const inProgress = mine.some(a => a.status === 'in_progress')
            const best = done.reduce((b, a) => (!b || a.score / (a.max_score || 1) > b.score / (b.max_score || 1)) ? a : b, null)
            return (
              <li key={e.id} className="card">
                <p className="card-title">{e.title}</p>
                {e.description && <p className="muted">{e.description}</p>}
                <p className="muted small-text">
                  {e.time_limit_minutes ? `⏱ ${e.time_limit_minutes} мин` : 'Без ограничения времени'}
                  {done.length ? ` · попыток: ${done.length} · лучший: ${best.score}/${best.max_score}` : ''}
                </p>
                <div className="btn-row">
                  <button className="btn-primary" onClick={() => start(e)}>{inProgress ? '▶ Продолжить' : done.length ? '🔁 Пройти ещё раз' : '▶ Начать'}</button>
                  {done.length > 0 && <button className="btn-secondary" onClick={() => setView({ exam: e, attempt: done[done.length - 1] })}>Разбор</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------- Прохождение ----------
function TakeExam({ exam, attempt, studentId, onDone }) {
  const [slots, setSlots] = useState(null)
  const [answers, setAnswers] = useState(attempt.answers || {})
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState('')
  const saveTimer = useRef(null)
  const submitted = useRef(false)

  useEffect(() => { loadExamSlots(exam.id).then(setSlots) }, [exam.id])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const left = exam.time_limit_minutes ? exam.time_limit_minutes * 60 - (now - new Date(attempt.started_at).getTime()) / 1000 : null
  useEffect(() => { if (left != null && left <= 0 && slots && !submitted.current) submit(true) }, [left, slots])

  function setAns(slotId, patch) {
    setAnswers(prev => {
      const cur = prev[slotId] || {}
      const next = { ...prev, [slotId]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => supabase.from('mock_attempts').update({ answers: next }).eq('id', attempt.id), 1200)
      return next
    })
  }

  async function addPhotos(slotId, files) {
    if (!files.length) return
    setBusy('Загрузка фото…')
    try {
      const up = await uploadFiles('materials', files)
      setAns(slotId, cur => ({ files: [...(cur.files || []), ...up] }))
    } catch (e) { alert('Ошибка загрузки: ' + e.message) }
    setBusy('')
  }

  async function submit(auto = false) {
    if (submitted.current) return
    if (!auto && !confirm('Завершить пробник и отправить ответы?')) return
    submitted.current = true
    clearTimeout(saveTimer.current)
    setBusy('Проверяю…')
    const final = {}
    let max = 0, hasManual = false
    const attemptsRows = []
    slots.forEach(s => {
      const a = answers[s.id] || {}
      max += s.points
      const base = { answer: a.answer || '', files: a.files || [], num: s.num, points: s.points, mode: s.check_mode }
      if (s.check_mode === 'manual' || !s.task.answer) {
        hasManual = true
        final[s.id] = { ...base, mode: 'manual', got: (a.answer || a.files?.length) ? null : 0 }
      } else {
        const ok = isCorrectAnswer(a.answer, s.task.answer)
        final[s.id] = { ...base, got: ok ? s.points : 0, ok }
        if (a.answer?.trim()) attemptsRows.push({ task_id: s.task_id, student_id: studentId, answer: a.answer, is_correct: ok })
      }
    })
    const pending = Object.values(final).some(a => a.got == null)
    const row = {
      answers: final, score: sumScore(final), max_score: max,
      status: pending ? 'submitted' : 'checked', submitted_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('mock_attempts').update(row).eq('id', attempt.id).select().single()
    if (attemptsRows.length) await supabase.from('task_attempts').insert(attemptsRows)
    if (error) { submitted.current = false; setBusy(''); return alert('Ошибка: ' + error.message) }
    onDone(data)
  }

  if (!slots) return <div className="screen"><p className="muted">Загрузка варианта…</p></div>
  const answered = slots.filter(s => answers[s.id]?.answer?.trim() || answers[s.id]?.files?.length).length

  return (
    <div className="screen">
      <div className="mock-bar">
        <span>{exam.title}</span>
        <span className={left != null && left < 300 ? 'mock-timer warn' : 'mock-timer'}>{left != null ? '⏱ ' + fmtTime(left) : `${answered}/${slots.length}`}</span>
      </div>
      {slots.length === 0 && <p className="muted">В пробнике пока нет заданий</p>}
      {slots.map((s, i) => {
        const a = answers[s.id] || {}
        const manual = s.check_mode === 'manual' || !s.task.answer
        return (
          <section key={s.id} className="card">
            <div className="row-between">
              <span className="task-num">Задание {i + 1}</span>
              <span className="muted small-text">№{s.num} · {s.points} балл{s.points === 1 ? '' : s.points < 5 ? 'а' : 'ов'}</span>
            </div>
            {s.task.condition && <p className="task-text">{s.task.condition}</p>}
            <AttachmentList items={s.task.condition_attachments} full />
            {manual ? (
              <>
                <textarea className="text-input" rows={2} placeholder="Ответ (необязательно)" value={a.answer || ''} onChange={e => setAns(s.id, { answer: e.target.value })} />
                <PhotoPicker onPick={(f) => addPhotos(s.id, f)} count={a.files?.length || 0} />
                <AttachmentList items={a.files} compact />
              </>
            ) : (
              <input className="text-input" inputMode="decimal" placeholder="Ответ" value={a.answer || ''} onChange={e => setAns(s.id, { answer: e.target.value })} />
            )}
          </section>
        )
      })}
      {busy && <p className="muted">{busy}</p>}
      <button className="btn-primary block" disabled={!!busy} onClick={() => submit(false)}>✅ Завершить ({answered} из {slots.length})</button>
      <p className="muted center small-text">Ответы сохраняются автоматически — можно закрыть и продолжить позже{exam.time_limit_minutes ? ', но время идёт' : ''}.</p>
    </div>
  )
}

function PhotoPicker({ onPick, count }) {
  const ref = useRef(null)
  return (
    <>
      <button type="button" className="file-drop" onClick={() => ref.current?.click()}>📷 Фото решения {count ? `(${count})` : ''}</button>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={e => { onPick(Array.from(e.target.files || [])); e.target.value = '' }} />
    </>
  )
}

// ---------- Разбор ----------
export function Review({ exam, attempt, onBack, footer, embedded = false }) {
  const [slots, setSlots] = useState(null)
  useEffect(() => { loadExamSlots(exam.id).then(setSlots) }, [exam.id])
  const ans = attempt.answers || {}

  return (
    <div className="screen">
      {!embedded && <button className="btn-secondary" onClick={onBack}>← Назад</button>}
      {!embedded && <header className="screen-header"><h1>{exam.title}</h1></header>}
      <section className={'card status-card ' + (attempt.status === 'checked' ? 'status-ok' : '')}>
        <p className="status-title">{attempt.score} из {attempt.max_score}</p>
        <p className="muted">{attempt.status === 'submitted' ? 'Первая часть проверена, вторую проверит учитель' : 'Пробник проверен'}</p>
        <NumberChips attempt={attempt} />
        {attempt.teacher_comment && <p className="muted">💬 {attempt.teacher_comment}</p>}
      </section>
      {!slots ? <p className="muted">Загрузка…</p> : slots.map((s, i) => {
        const a = ans[s.id] || {}
        const mark = a.got == null ? '⏳' : a.got >= s.points ? '✅' : a.got > 0 ? '🟡' : '❌'
        return (
          <section key={s.id} className="card">
            <div className="row-between">
              <span className="task-num">{mark} Задание {i + 1}</span>
              <span className="muted small-text">№{s.num} · {a.got == null ? '?' : a.got}/{s.points}</span>
            </div>
            {s.task.condition && <p className="task-text">{s.task.condition}</p>}
            <AttachmentList items={s.task.condition_attachments} full />
            <p className="muted">Ответ ученика: <b style={{ color: 'var(--text)' }}>{a.answer || '—'}</b></p>
            <AttachmentList items={a.files} compact />
            {exam.show_solutions && (
              <details className="task-panel">
                <summary className="muted">📖 Правильный ответ и решение</summary>
                {s.task.answer && <p className="muted">Ответ: <b style={{ color: 'var(--green)' }}>{showAnswer(s.task.answer)}</b></p>}
                <AttachmentList items={answerImages(s.task)} full />
                {s.task.solution && <p className="task-text">{s.task.solution}</p>}
                <AttachmentList items={solutionImages(s.task)} full />
              </details>
            )}
            {footer && footer(s, a)}
          </section>
        )
      })}
    </div>
  )
}
