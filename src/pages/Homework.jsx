import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadFiles } from '../lib/storage'
import FileUploader, { AttachmentList } from '../components/FileUploader'

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'checked', label: 'Проверено ✅' },
  { key: 'assigned', label: 'Не сдано ⏳' },
  { key: 'submitted', label: 'На проверке' },
]

export default function Homework() {
  const { student } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [tasksByHw, setTasksByHw] = useState({})

  const [files, setFiles] = useState([])
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!student) return
    setLoading(true)
    const { data } = await supabase.from('homework').select('*').eq('student_id', student.id).order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [student])

  async function loadTasks(hwId) {
    const { data } = await supabase.from('homework_tasks').select('*').eq('homework_id', hwId).order('position')
    setTasksByHw(prev => ({ ...prev, [hwId]: data ?? [] }))
  }

  function openCard(hw) {
    const next = openId === hw.id ? null : hw.id
    setOpenId(next)
    setFiles([]); setComment(''); setError('')
    if (next && !tasksByHw[hw.id]) loadTasks(hw.id)
  }

  async function submitHomework(hw) {
    setError('')
    if (files.length === 0 && !comment.trim()) {
      return setError('Прикрепите фото/файлы или напишите комментарий')
    }
    setSending(true)
    try {
      let attachments = []
      if (files.length > 0) {
        attachments = await uploadFiles('attachments', files, (i, total) => setProgress(`Загрузка ${i} из ${total}…`))
      }
      setProgress('Отправка…')

      const { error: err } = await supabase.from('homework').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submission_attachments: attachments,
        submission_comment: comment.trim() || null,
      }).eq('id', hw.id)

      if (err) throw err
      setFiles([]); setComment(''); setOpenId(null)
      load()
    } catch (e) {
      setError('Не удалось отправить: ' + e.message)
    } finally {
      setSending(false)
      setProgress('')
    }
  }

  const filtered = filter === 'all' ? items : items.filter(h => h.status === filter)
  const notDone = items.filter(h => h.status === 'assigned').length

  function statusTag(hw) {
    const overdue = hw.due_date && new Date(hw.due_date) < new Date() && hw.status === 'assigned'
    if (hw.status === 'checked') return <span className="tag tag-green">Проверено · {hw.correct_tasks}/{hw.total_tasks}</span>
    if (hw.status === 'submitted') return <span className="tag tag-blue">⏳ Сдано, проверяется</span>
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
          <button key={f.key} className={'filter-chip' + (filter === f.key ? ' active' : '')} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {filtered.length === 0 && <p className="muted">Ничего не найдено</p>}
          {filtered.map(hw => {
            const list = tasksByHw[hw.id] || []
            return (
              <li key={hw.id} className="card">
                <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => openCard(hw)}>
                  <div>
                    <p className="card-title">{hw.title}</p>
                    <p className="muted">
                      {hw.due_date ? `До ${new Date(hw.due_date).toLocaleDateString('ru-RU')}` : ''}
                    </p>
                  </div>
                  {statusTag(hw)}
                </div>

                {openId === hw.id && (
                  <div className="card-details">
                    {hw.description && <p className="muted">{hw.description}</p>}

                    {hw.attachments?.length > 0 && (
                      <>
                        <p className="eyebrow">Материалы задания</p>
                        <AttachmentList items={hw.attachments} />
                      </>
                    )}

                    {hw.status === 'checked' && list.length > 0 && (
                      <>
                        <p className="eyebrow">Результат по заданиям</p>
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

                    {hw.status === 'submitted' && (
                      <>
                        <p className="muted">✅ Работа отправлена {hw.submitted_at ? new Date(hw.submitted_at).toLocaleString('ru-RU') : ''}. Ждём проверку.</p>
                        <AttachmentList items={hw.submission_attachments} compact />
                      </>
                    )}

                    {hw.status === 'assigned' && (
                      <>
                        <p className="eyebrow">Сдать работу</p>
                        <FileUploader
                          files={files}
                          onChange={setFiles}
                          accept="image/*,.pdf,.doc,.docx,.zip"
                          label="Прикрепить фото решения"
                        />
                        <textarea className="text-input" placeholder="Комментарий учителю (необязательно)"
                          value={comment} onChange={e => setComment(e.target.value)} />
                        {error && <p className="error-text">⚠️ {error}</p>}
                        {progress && <p className="muted">{progress}</p>}
                        <button className="btn-primary block" disabled={sending} onClick={() => submitHomework(hw)}>
                          {sending ? 'Отправка…' : '📤 Отправить ДЗ'}
                        </button>
                      </>
                    )}
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
