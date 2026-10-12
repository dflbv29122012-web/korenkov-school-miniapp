import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadFiles } from '../lib/storage'
import FileUploader, { AttachmentList } from '../components/FileUploader'
import { useDraft } from '../context/DraftContext'

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'checked', label: 'Проверено ✅' },
  { key: 'assigned', label: 'Не сдано ⏳' },
  { key: 'submitted', label: 'На проверке' },
]

export default function Homework() {
  const { student } = useAuth()
  const [draft, setDraft, clearDraft] = useDraft('student-homework', { files: [], comment: '', forId: null })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [tasksByHw, setTasksByHw] = useState({})
  const [subsByHw, setSubsByHw] = useState({})
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
    if (draft.forId !== hw.id) setDraft({ files: [], comment: '', forId: hw.id })
    if (next) {
      if (!tasksByHw[hw.id]) {
        const { data } = await supabase.from('homework_tasks').select('*').eq('homework_id', hw.id).order('position')
        setTasksByHw(p => ({ ...p, [hw.id]: data ?? [] }))
      }
      const { data: subs } = await supabase.from('homework_submissions').select('*').eq('homework_id', hw.id).order('attempt')
      setSubsByHw(p => ({ ...p, [hw.id]: subs ?? [] }))
    }
  }

  async function submitHomework(hw) {
    setError('')
    if (draft.files.length === 0 && !draft.comment.trim()) return setError('Прикрепите файлы или напишите комментарий')

    setSending(true)
    try {
      let attachments = []
      if (draft.files.length > 0) {
        attachments = await uploadFiles('attachments', draft.files, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
      }
      setProgress('Отправка…')

      const prev = subsByHw[hw.id] || []
      const attempt = prev.length + 1
      const now = new Date()
      const isLate = hw.due_date ? now > new Date(hw.due_date + 'T23:59:59') : false

      const { error: e1 } = await supabase.from('homework_submissions').insert({
        homework_id: hw.id, attempt, attachments,
        comment: draft.comment.trim() || null,
        submitted_at: now.toISOString(), is_late: isLate,
      })
      if (e1) throw e1

      const { error: e2 } = await supabase.from('homework').update({
        status: 'submitted', submitted_at: now.toISOString(),
        submission_attachments: attachments,
        submission_comment: draft.comment.trim() || null,
        attempts_count: attempt,
      }).eq('id', hw.id)
      if (e2) throw e2

      clearDraft(); setOpenId(null); load()
    } catch (e) {
      setError('Не удалось отправить: ' + e.message)
    } finally { setSending(false); setProgress('') }
  }

  const filtered = filter === 'all' ? items : items.filter(h => h.status === filter)
  const notDone = items.filter(h => h.status === 'assigned').length

  function statusTag(hw) {
    const overdue = hw.due_date && new Date(hw.due_date) < new Date() && hw.status === 'assigned'
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
                    <p className="muted">{hw.due_date ? `До ${new Date(hw.due_date).toLocaleDateString('ru-RU')}` : ''}</p>
                  </div>
                  {statusTag(hw)}
                </div>

                {openId === hw.id && (
                  <div className="card-details">
                    {hw.description && <p className="muted">{hw.description}</p>}
                    {hw.attachments?.length > 0 && (<><p className="eyebrow">Материалы задания</p><AttachmentList items={hw.attachments} /></>)}

                    {hw.status === 'checked' && list.length > 0 && (
                      <>
                        <p className="eyebrow">Результат</p>
                        {list.map(t => (
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
                        <p className="score-line">Итого: {hw.correct_tasks} / {hw.total_tasks} баллов</p>
                      </>
                    )}

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

                    <p className="eyebrow">{subs.length > 0 ? 'Отправить ещё раз' : 'Сдать работу'}</p>
                    <FileUploader files={isMine ? draft.files : []} onChange={f => setDraft({ ...draft, files: f, forId: hw.id })}
                      accept="image/*,.pdf,.doc,.docx,.zip" label="Прикрепить фото решения" />
                    <textarea className="text-input" placeholder="Комментарий учителю"
                      value={isMine ? draft.comment : ''} onChange={e => setDraft({ ...draft, comment: e.target.value, forId: hw.id })} />
                    {error && <p className="error-text">⚠️ {error}</p>}
                    {progress && <p className="muted">{progress}</p>}
                    <button className="btn-primary block" disabled={sending} onClick={() => submitHomework(hw)}>
                      {sending ? 'Отправка…' : subs.length > 0 ? '📤 Отправить заново' : '📤 Отправить ДЗ'}
                    </button>
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
