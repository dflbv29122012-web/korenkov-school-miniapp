import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadFiles } from '../lib/storage'
import FileUploader, { AttachmentList } from '../components/FileUploader'
import { useDraft } from '../context/DraftContext'
import { dueMoment, fmtDue } from '../lib/due'
import { isCorrectAnswer, answerImages, solutionImages } from '../components/TaskBank'

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'checked', label: 'Проверено ✅' },
  { key: 'assigned', label: 'Не сдано ⏳' },
  { key: 'submitted', label: 'На проверке' },
]

export default function Homework() {
  const { student } = useAuth()
  const [draft, setDraft, clearDraft] = useDraft('student-homework', { files: [], comment: '', forId: null, answers: {} })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [tasksByHw, setTasksByHw] = useState({})
  const [subsByHw, setSubsByHw] = useState({})
  const [bank, setBank] = useState({})   // id задачи банка -> задача
  const [openSol, setOpenSol] = useState({})
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!student) return
    setLoading(true)
    const { data } = await supabase.from('homework').select('*').eq('student_id', student.id).order('created_at', { ascending: false })
    setItems(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [student])

  async function openCard(hw) {
    const next = openId === hw.id ? null : hw.id
    setOpenId(next); setError('')
    if (draft.forId !== hw.id) setDraft({ files: [], comment: '', forId: hw.id, answers: {} })
    if (next) {
      if (!tasksByHw[hw.id]) {
        const { data } = await supabase.from('homework_tasks').select('*').eq('homework_id', hw.id).order('position')
        setTasksByHw(p => ({ ...p, [hw.id]: data ?? [] }))
        const ids = (data ?? []).map(t => t.task_id).filter(Boolean)
        if (ids.length) {
          const { data: bt } = await supabase.from('tasks').select('*').in('id', ids)
          setBank(p => ({ ...p, ...Object.fromEntries((bt ?? []).map(t => [t.id, t])) }))
        }
      }
      const { data: subs } = await supabase.from('homework_submissions').select('*').eq('homework_id', hw.id).order('attempt')
      setSubsByHw(p => ({ ...p, [hw.id]: subs ?? [] }))
    }
  }

  const answers = draft.answers || {}
  const setAnswer = (hw, id, v) => setDraft({ ...draft, forId: hw.id, answers: { ...(draft.forId === hw.id ? answers : {}), [id]: v } })

  async function submitHomework(hw) {
    setError('')
    const list = tasksByHw[hw.id] || []
    const bankTasks = list.filter(t => t.task_id)
    const mine = draft.forId === hw.id
    const given = bankTasks.filter(t => String(mine ? answers[t.id] ?? t.student_answer ?? '' : t.student_answer ?? '').trim())
    if (draft.files.length === 0 && !draft.comment.trim() && given.length === 0) return setError('Введите ответы, прикрепите фото решения или напишите комментарий')

    setSending(true)
    try {
      let attachments = []
      if (draft.files.length > 0) {
        attachments = await uploadFiles('attachments', draft.files, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
      }
      setProgress('Проверка…')
      const now = new Date()

      // автопроверка задач из банка
      const scored = {}
      for (const t of bankTasks) {
        const b = bank[t.task_id]
        const ans = String(mine ? answers[t.id] ?? t.student_answer ?? '' : t.student_answer ?? '').trim()
        const auto = !!(b && b.answer && t.is_auto)
        const ok = auto && isCorrectAnswer(ans, b.answer)
        const score = auto ? (ok ? t.max_score : 0) : null
        scored[t.id] = score
        await supabase.from('homework_tasks').update({ student_answer: ans || null, score }).eq('id', t.id)
        if (ans && auto) await supabase.from('task_attempts').insert({ task_id: t.task_id, student_id: student.id, answer: ans, is_correct: ok, source: 'homework' })
      }
      const needsTeacher = list.some(t => !(t.task_id && t.is_auto))

      let attempt = hw.attempts_count || 0
      if (attachments.length || draft.comment.trim()) {
        const prev = subsByHw[hw.id] || []
        attempt = prev.length + 1
        const isLate = dueMoment(hw) ? now > dueMoment(hw) : false
        const { error: e1 } = await supabase.from('homework_submissions').insert({
          homework_id: hw.id, attempt, attachments, comment: draft.comment.trim() || null,
          submitted_at: now.toISOString(), is_late: isLate,
        })
        if (e1) throw e1
      }

      const patch = {
        submitted_at: now.toISOString(),
        submission_attachments: attachments,
        submission_comment: draft.comment.trim() || null,
        attempts_count: attempt,
      }
      if (needsTeacher) patch.status = 'submitted'
      else {
        patch.status = 'checked'
        patch.correct_tasks = list.reduce((sum, t) => sum + (Number(scored[t.id]) || 0), 0)
        patch.total_tasks = list.reduce((sum, t) => sum + (Number(t.max_score) || 0), 0)
      }
      const { error: e2 } = await supabase.from('homework').update(patch).eq('id', hw.id)
      if (e2) throw e2

      clearDraft(); setTasksByHw(p => ({ ...p, [hw.id]: undefined })); setOpenId(null); load()
    } catch (e) {
      setError('Не удалось отправить: ' + e.message)
    } finally { setSending(false); setProgress('') }
  }

  const filtered = filter === 'all' ? items : items.filter(h => h.status === filter)
  const notDone = items.filter(h => h.status === 'assigned').length

  function statusTag(hw) {
    const overdue = dueMoment(hw) && dueMoment(hw) < new Date() && hw.status === 'assigned'
    if (hw.status === 'checked') return <span className="tag tag-green">Проверено · {hw.correct_tasks}/{hw.total_tasks}</span>
    if (hw.status === 'submitted') return <span className="tag tag-blue">⏳ Проверяется</span>
    if (overdue) return <span className="tag tag-red">✕ Просрочено</span>
    return <span className="tag tag-yellow">Не сдано</span>
  }

  return (
    <div className="screen">
      <div className="row-between">
        <h1>Домашние задания</h1>
        {notDone > 0 && <span className="tag tag-yellow">{notDone} не сдано</span>}
      </div>

      <div className="filter-row">
        {FILTERS.map(f => (
          <button key={f.key} className={'filter-chip' + (filter === f.key ? ' active' : '')} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {filtered.length === 0 && <p className="muted">Ничего не найдено</p>}
          {filtered.map(hw => {
            const list = tasksByHw[hw.id] || []
            const subs = subsByHw[hw.id] || []
            const isMine = draft.forId === hw.id
            return (
              <li key={hw.id} className="card">
                <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => openCard(hw)}>
                  <div>
                    <p className="card-title">{hw.title}</p>
                    <p className="muted">{hw.due_date ? `До ${fmtDue(hw)}` : ''}</p>
                  </div>
                  {statusTag(hw)}
                </div>

                {openId === hw.id && (
                  <div className="card-details">
                    {hw.description && <p className="muted">{hw.description}</p>}
                    {hw.attachments?.length > 0 && (<><p className="eyebrow">Материалы задания</p><AttachmentList items={hw.attachments} /></>)}

                    {list.some(t => t.task_id) && (
                      <>
                        <p className="eyebrow">Задачи</p>
                        {list.filter(t => t.task_id).map((t, i) => {
                          const b = bank[t.task_id]
                          if (!b) return <p key={t.id} className="muted small-text">Загрузка задачи…</p>
                          const editable = hw.status === 'assigned'
                          const done = hw.status === 'checked' || hw.status === 'submitted'
                          const value = isMine ? (answers[t.id] ?? t.student_answer ?? '') : (t.student_answer ?? '')
                          const wrong = hw.status === 'checked' && t.score != null && t.score < t.max_score
                          const imgs = answerImages(b), sImgs = solutionImages(b)
                          return (
                            <div key={t.id} className={'task-card' + (hw.status === 'checked' && t.score >= t.max_score ? ' solved' : '')}>
                              <div className="row-between">
                                <span className="task-num">{i + 1}. {t.title}</span>
                                {hw.status === 'checked' && t.score != null && <span className={'tag ' + (t.score >= t.max_score ? 'tag-green' : 'tag-red')}>{t.score >= t.max_score ? '✓ Верно' : '✕ Неверно'}</span>}
                              </div>
                              {b.condition && <p className="task-text">{b.condition}</p>}
                              <AttachmentList items={b.condition_attachments} full />
                              {editable ? (
                                b.answer ? <input className="text-input" placeholder="Ваш ответ" value={value} onChange={e => setAnswer(hw, t.id, e.target.value)} />
                                  : <p className="muted small-text">Ответ на эту задачу — фото решения ниже (проверит учитель).</p>
                              ) : (
                                <p className="muted small-text">Ваш ответ: <b>{t.student_answer || '—'}</b></p>
                              )}
                              {wrong && (
                                <>
                                  {b.answer && <p className="small-text">Правильный ответ: <b>{b.answer.split('|')[0]}</b></p>}
                                  {(b.solution || sImgs.length > 0 || imgs.length > 0) && (
                                    <div className="task-actions">
                                      <button className={'chip-btn' + (openSol[t.id] ? ' on' : '')} onClick={() => setOpenSol({ ...openSol, [t.id]: !openSol[t.id] })}>📖 Решение</button>
                                    </div>
                                  )}
                                  {openSol[t.id] && (
                                    <div className="task-panel">
                                      {b.solution && <p className="task-text">{b.solution}</p>}
                                      <AttachmentList items={sImgs} full />
                                      <AttachmentList items={imgs} full />
                                    </div>
                                  )}
                                </>
                              )}
                              {done && hw.status === 'submitted' && t.score == null && <p className="muted small-text">⏳ Ждёт проверки учителем</p>}
                            </div>
                          )
                        })}
                      </>
                    )}

                    {hw.status === 'checked' && list.filter(t => !t.task_id).length > 0 && (
                      <>
                        <p className="eyebrow">Результат</p>
                        {list.filter(t => !t.task_id).map(t => (
                          <div key={t.id} className="task-grade">
                            <div className="row-between">
                              <span className="card-title">{t.title}</span>
                              <span className={'tag ' + (t.score >= t.max_score ? 'tag-green' : t.score > 0 ? 'tag-yellow' : 'tag-red')}>
                                {t.score ?? 0} / {t.max_score}
                              </span>
                            </div>
                            {t.comment && <p className="muted small-text">💬 {t.comment}</p>}
                          </div>
                        ))}
                      </>
                    )}
                    {hw.status === 'checked' && <p className="score-line">Итого: {hw.correct_tasks} / {hw.total_tasks} баллов</p>}

                    {subs.length > 0 && (
                      <>
                        <p className="eyebrow">Мои отправки ({subs.length})</p>
                        {subs.map(s => (
                          <div key={s.id} className="task-grade">
                            <p className={s.is_late ? 'late-time' : 'ontime-time'}>
                              Попытка {s.attempt} · {new Date(s.submitted_at).toLocaleString('ru-RU')} {s.is_late ? '· после дедлайна' : '· в срок'}
                            </p>
                            {s.comment && <p className="muted small-text">💬 {s.comment}</p>}
                            <AttachmentList items={s.attachments} compact />
                          </div>
                        ))}
                      </>
                    )}

                    {hw.status !== 'checked' && (<>
                    <p className="eyebrow">{list.some(t => t.task_id) ? 'Фото решения (если нужно)' : subs.length > 0 ? 'Отправить ещё раз' : 'Сдать работу'}</p>
                    <FileUploader files={isMine ? draft.files : []} onChange={f => setDraft({ ...draft, files: f, forId: hw.id })}
                      accept="image/*,.pdf,.doc,.docx,.zip" label="Прикрепить фото решения" />
                    <textarea className="text-input" placeholder="Комментарий учителю"
                      value={isMine ? draft.comment : ''} onChange={e => setDraft({ ...draft, comment: e.target.value, forId: hw.id })} />
                    {error && <p className="error-text">⚠️ {error}</p>}
                    {progress && <p className="muted">{progress}</p>}
                    <button className="btn-primary block" disabled={sending} onClick={() => submitHomework(hw)}>
                      {sending ? 'Проверка…' : subs.length > 0 ? '📤 Отправить заново' : '📤 Сдать ДЗ'}
                    </button>
                    </>)}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
