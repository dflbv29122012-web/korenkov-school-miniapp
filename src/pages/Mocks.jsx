import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadFiles } from '../lib/storage'
import { loadExamSlots, examsForStudent, fmtTime, showAnswer, sumScore } from '../lib/mocks'
import { fetchAll, numberOf } from '../lib/progress'
import { useSettings, toTest, pointsFor, isPart1, fullMax, THRESHOLD_PRIMARY } from '../lib/settings'
import { isCorrectAnswer, answerImages, solutionImages } from '../components/TaskBank'
import { AttachmentList } from '../components/FileUploader'
import { NumberChips } from '../components/MockHistory'

const FULL_MINUTES = 235

export default function Mocks() {
  const { student } = useAuth()
  const settings = useSettings()
  const [exams, setExams] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [run, setRun] = useState(null) // { exam, attempt }
  const [view, setView] = useState(null) // { exam, attempt } — разбор
  const [showAllSelf, setShowAllSelf] = useState(false)

  async function load() {
    const list = await examsForStudent(student.id)
    const { data } = await supabase.from('mock_attempts').select('*').eq('student_id', student.id).order('started_at')
    setExams(list); setAttempts(data ?? [])
    return data ?? []
  }
  useEffect(() => { load() }, [])

  async function start(exam, fresh = attempts) {
    const open = fresh.find(a => a.exam_id === exam.id && a.status === 'in_progress')
    if (open) return setRun({ exam, attempt: open })
    const { data, error } = await supabase.from('mock_attempts').insert({ exam_id: exam.id, student_id: student.id }).select().single()
    if (error) return alert('Ошибка: ' + error.message)
    setRun({ exam, attempt: data })
  }

  if (run) return <TakeExam {...run} studentId={student.id} onDone={(attempt) => { setRun(null); setView({ exam: run.exam, attempt }); load() }} />
  if (view) return <Review {...view} onBack={() => setView(null)} />

  const teacherExams = (exams ?? []).filter(e => !e.is_self)
  const selfExams = (exams ?? []).filter(e => e.is_self)
  const selfShown = showAllSelf ? selfExams : selfExams.slice(0, 5)

  const card = (e) => {
    const mine = attempts.filter(a => a.exam_id === e.id)
    const done = mine.filter(a => a.status !== 'in_progress')
    const inProgress = mine.some(a => a.status === 'in_progress')
    const best = done.reduce((b, a) => (!b || a.score > b.score) ? a : b, null)
    return (
      <li key={e.id} className="card">
        <p className="card-title">{e.title}</p>
        {e.description && <p className="muted">{e.description}</p>}
        <p className="muted small-text">
          {e.time_limit_minutes ? `⏱ ${e.time_limit_minutes} мин` : 'Без таймера'}
          {done.length ? ` · попыток: ${done.length}` : ''}
        </p>
        {best && (
          <p className="score-line-sm">Лучший: <b className="prim">{best.score}</b> из {best.max_score} перв. → <b className="test">{toTest(best.score, settings.scale)}</b> тест.</p>
        )}
        <div className="btn-row">
          <button className="btn-primary" onClick={() => start(e)}>{inProgress ? '▶ Продолжить' : done.length ? '🔁 Ещё раз' : '▶ Начать'}</button>
          {done.length > 0 && <button className="btn-secondary" onClick={() => setView({ exam: e, attempt: done[done.length - 1] })}>Разбор</button>}
        </div>
      </li>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Пробники</h1></header>
      <p className="muted">Первая часть проверяется сразу (верно — 1 балл, неверно — 0), вторую проверит учитель. После сдачи — первичный и тестовый балл и решения.</p>

      <SelfBuilder student={student} settings={settings} onCreated={async (exam) => { const fresh = await load(); start(exam, fresh) }} />

      {!exams ? <p className="muted">Загрузка…</p> : (
        <>
          <p className="eyebrow">От учителя</p>
          {teacherExams.length === 0 ? <p className="muted">Пока нет</p> : <ul className="card-list">{teacherExams.map(card)}</ul>}
          {selfExams.length > 0 && (
            <>
              <p className="eyebrow">Мои пробники</p>
              <ul className="card-list">{selfShown.map(card)}</ul>
              {selfExams.length > 5 && (
                <button className="btn-secondary block" onClick={() => setShowAllSelf(!showAllSelf)}>{showAllSelf ? 'Свернуть' : `Показать все (${selfExams.length})`}</button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------- Свой пробник ----------
const PRESETS = [
  ['full', 'Полный вариант'],
  ['p1', 'Часть 1 (№1–13)'],
  ['p2', 'Часть 2 (№14–20)'],
]

function SelfBuilder({ student, settings, onCreated }) {
  const [open, setOpen] = useState(false)
  const [nums, setNums] = useState(null) // [{ num, topicId, name }]
  const [allTasks, setAllTasks] = useState([])
  const [sel, setSel] = useState(new Set())
  const [preset, setPreset] = useState('p1')
  const [timer, setTimer] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || nums) return
    Promise.all([
      supabase.from('topics').select('id, name, position').order('position'),
      fetchAll(() => supabase.from('tasks').select('id, topic_id, answer').order('id')),
    ]).then(([{ data: tp }, ts]) => {
      const has = new Set(ts.map(t => t.topic_id))
      const list = (tp ?? []).map(t => ({ num: Number(numberOf(t.name)), topicId: t.id, name: t.name }))
        .filter(x => x.num && has.has(x.topicId)).sort((a, b) => a.num - b.num)
      setNums(list); setAllTasks(ts); applyPreset('p1', list)
    })
  }, [open])

  function applyPreset(p, list = nums) {
    setPreset(p)
    setSel(new Set(list.filter(x => p === 'full' || (p === 'p1' ? isPart1(x.num) : !isPart1(x.num))).map(x => x.num)))
  }
  function toggle(n) {
    const s = new Set(sel); s.has(n) ? s.delete(n) : s.add(n); setSel(s); setPreset('custom')
  }

  const chosen = (nums ?? []).filter(x => sel.has(x.num))
  const max = chosen.reduce((a, x) => a + pointsFor(x.num, settings), 0)
  const minutes = Math.max(15, Math.round(FULL_MINUTES * max / (fullMax(settings) || 33)))

  async function create() {
    if (!chosen.length) return
    setBusy(true)
    try {
      const { data: ok } = await supabase.from('task_attempts').select('task_id').eq('student_id', student.id).eq('is_correct', true)
      const solved = new Set((ok ?? []).map(a => a.task_id))
      const slots = []
      chosen.forEach(x => {
        const pool = allTasks.filter(t => t.topic_id === x.topicId)
        const fresh = pool.filter(t => !solved.has(t.id))
        const from = fresh.length ? fresh : pool
        const task = from[Math.floor(Math.random() * from.length)]
        if (task) slots.push({ task, num: x.num })
      })
      const label = preset === 'custom' ? '№' + chosen.map(x => x.num).join(', ') : PRESETS.find(p => p[0] === preset)[1]
      const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const { data: exam, error } = await supabase.from('mock_exams').insert({
        title: `Мой пробник: ${label} · ${date}`, is_self: true, is_published: true, student_id: student.id,
        time_limit_minutes: timer ? minutes : null, show_solutions: true,
      }).select().single()
      if (error) throw error
      const rows = slots.map((s, i) => ({
        exam_id: exam.id, task_id: s.task.id, position: i + 1, points: pointsFor(s.num, settings),
        check_mode: isPart1(s.num) && s.task.answer ? 'auto' : 'manual',
      }))
      const { error: e2 } = await supabase.from('mock_exam_tasks').insert(rows)
      if (e2) throw e2
      setOpen(false)
      onCreated(exam)
    } catch (e) { alert('Ошибка: ' + e.message) }
    setBusy(false)
  }

  if (!open) return <button className="btn-primary block" onClick={() => setOpen(true)}>🎲 Собрать свой пробник</button>
  return (
    <section className="card">
      <p className="card-title">🎲 Свой пробник</p>
      <p className="muted small-text">Случайные задания из банка — сначала те, что ты ещё не решал.</p>
      {!nums ? <p className="muted">Загрузка…</p> : (
        <>
          <div className="chip-wrap">
            {PRESETS.map(([k, l]) => <button key={k} className={'filter-chip' + (preset === k ? ' active' : '')} onClick={() => applyPreset(k)}>{l}</button>)}
          </div>
          <p className="muted small-text" style={{ marginTop: 12 }}>Или выбери номера сам:</p>
          <div className="chip-wrap num-pick">
            {nums.map(x => (
              <button key={x.num} className={'filter-chip' + (sel.has(x.num) ? ' active' : '')} onClick={() => toggle(x.num)}>{x.num}</button>
            ))}
          </div>
          <div className="builder-sum">
            <span>Заданий: <b>{chosen.length}</b></span>
            <span>Макс.: <b className="prim">{max}</b> перв. → <b className="test">{toTest(max, settings.scale)}</b> тест.</span>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={timer} onChange={e => setTimer(e.target.checked)} /> Таймер: {minutes} мин</label>
          <div className="btn-row">
            <button className="btn-primary" disabled={busy || !chosen.length} onClick={create}>{busy ? 'Собираю…' : '▶ Начать'}</button>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </>
      )}
    </section>
  )
}

// Итог: первичный и тестовый балл
export function ScoreBox({ attempt, settings }) {
  const test = toTest(attempt.score, settings.scale)
  const partial = attempt.max_score < fullMax(settings)
  const pending = attempt.status === 'submitted'
  return (
    <div className="score-box">
      <div className="score-cols">
        <div><span className="score-big prim">{attempt.score}</span><span className="muted small-text">первичных из {attempt.max_score}</span></div>
        <span className="score-arrow">→</span>
        <div><span className="score-big test">{test}</span><span className="muted small-text">тестовых из 100</span></div>
      </div>
      {attempt.score < THRESHOLD_PRIMARY && !pending && <p className="score-warn">Ниже минимального порога ({THRESHOLD_PRIMARY} первичных = {toTest(THRESHOLD_PRIMARY, settings.scale)} тестовых)</p>}
      {pending && <p className="muted small-text">Предварительно: вторую часть ещё проверит учитель, баллы могут вырасти.</p>}
      {partial && <p className="muted small-text">Неполный вариант: перевод по шкале ЕГЭ, как будто остальные задания не решены.</p>}
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
        if (a.answer?.trim()) attemptsRows.push({ task_id: s.task_id, student_id: studentId, answer: a.answer, is_correct: ok, source: 'mock' })
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
  const settings = useSettings()
  const [slots, setSlots] = useState(null)
  useEffect(() => { loadExamSlots(exam.id).then(setSlots) }, [exam.id])
  const ans = attempt.answers || {}

  return (
    <div className="screen">
      {!embedded && <button className="btn-secondary" onClick={onBack}>← Назад</button>}
      {!embedded && <header className="screen-header"><h1>{exam.title}</h1></header>}
      <section className={'card status-card ' + (attempt.status === 'checked' ? 'status-ok' : '')}>
        <ScoreBox attempt={attempt} settings={settings} />
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
