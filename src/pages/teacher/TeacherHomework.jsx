import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/storage'
import FileUploader, { AttachmentList } from '../../components/FileUploader'

export default function TeacherHomework() {
  const [items, setItems] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [openId, setOpenId] = useState(null)
  const [tasksByHw, setTasksByHw] = useState({})

  const emptyForm = { student_id: '', title: '', description: '', due_date: '' }
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState([])
  // Задания внутри ДЗ: [{title, max_score}]
  const [tasks, setTasks] = useState([{ title: 'Задание 1', max_score: 1 }])

  async function loadAll() {
    setLoading(true)
    const [{ data: hw }, { data: st }] = await Promise.all([
      supabase.from('homework').select('*, students(first_name,last_name,grade_level)').order('created_at', { ascending: false }).limit(200),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
    ])
    setItems(hw ?? [])
    setStudents(st ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function loadTasks(hwId) {
    const { data } = await supabase.from('homework_tasks').select('*').eq('homework_id', hwId).order('position')
    setTasksByHw(prev => ({ ...prev, [hwId]: data ?? [] }))
  }

  function openCard(hw) {
    const next = openId === hw.id ? null : hw.id
    setOpenId(next)
    if (next && !tasksByHw[hw.id]) loadTasks(hw.id)
  }

  async function addHomework() {
    setError('')
    if (!form.student_id) return setError('Выберите ученика')
    if (!form.title.trim()) return setError('Укажите название ДЗ')

    setSaving(true)
    try {
      let attachments = []
      if (files.length > 0) {
        attachments = await uploadFiles('attachments', files, (i, total) => setProgress(`Загрузка файла ${i} из ${total}…`))
      }
      setProgress('Сохранение…')

      const { data: created, error: err } = await supabase.from('homework').insert({
        student_id: form.student_id,
        title: form.title.trim(),
        description: form.description || null,
        due_date: form.due_date || null,
        status: 'assigned',
        attachments,
        total_tasks: tasks.length,
      }).select().single()

      if (err) throw err

      const validTasks = tasks.filter(t => t.title?.trim())
      if (validTasks.length > 0) {
        const { error: tErr } = await supabase.from('homework_tasks').insert(
          validTasks.map((t, i) => ({
            homework_id: created.id,
            position: i + 1,
            title: t.title.trim(),
            max_score: Number(t.max_score) || 1,
          }))
        )
        if (tErr) throw tErr
      }

      setForm(emptyForm)
      setFiles([])
      setTasks([{ title: 'Задание 1', max_score: 1 }])
      setShowForm(false)
      loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  async function saveGrade(hw) {
    const list = tasksByHw[hw.id] || []
    for (const t of list) {
      await supabase.from('homework_tasks').update({
        score: t.score === '' || t.score === null || t.score === undefined ? null : Number(t.score),
        comment: t.comment || null,
      }).eq('id', t.id)
    }
    const totalMax = list.reduce((s, t) => s + (Number(t.max_score) || 0), 0)
    const totalScore = list.reduce((s, t) => s + (Number(t.score) || 0), 0)

    await supabase.from('homework').update({
      status: 'checked',
      correct_tasks: totalScore,
      total_tasks: totalMax,
    }).eq('id', hw.id)

    loadAll()
    setOpenId(null)
  }

  function updateTaskField(hwId, taskId, field, value) {
    setTasksByHw(prev => ({
      ...prev,
      [hwId]: (prev[hwId] || []).map(t => t.id === taskId ? { ...t, [field]: value } : t),
    }))
  }

  const submitted = items.filter(h => h.status === 'submitted')

  return (
    <div className="screen">
      <div className="row-between">
        <h1>Домашние задания</h1>
        {submitted.length > 0 && <span className="tag tag-yellow">{submitted.length} на проверке</span>}
      </div>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => { setShowForm(true); setError('') }}>+ Задать ДЗ</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новое ДЗ</p>
          <select className="text-input" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Выберите ученика</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <input className="text-input" placeholder="Название ДЗ" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <textarea className="text-input" placeholder="Описание (необязательно)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <input type="date" className="text-input" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />

          <FileUploader
            files={files}
            onChange={setFiles}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            label="Прикрепить фото и файлы ДЗ"
          />

          <p className="eyebrow">Задания и максимальные баллы</p>
          {tasks.map((t, i) => (
            <div key={i} className="btn-row">
              <input className="text-input" placeholder={`Задание ${i + 1}`} value={t.title}
                onChange={e => setTasks(tasks.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input type="number" min="1" className="text-input score-input" placeholder="макс" value={t.max_score}
                onChange={e => setTasks(tasks.map((x, j) => j === i ? { ...x, max_score: e.target.value } : x))} />
              {tasks.length > 1 && (
                <button className="file-remove" onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <button className="btn-secondary block" onClick={() => setTasks([...tasks, { title: `Задание ${tasks.length + 1}`, max_score: 1 }])}>
            + Добавить задание
          </button>
          <p className="muted small-text">
            Максимум всего: {tasks.reduce((s, t) => s + (Number(t.max_score) || 0), 0)} баллов
          </p>

          {error && <p className="error-text">⚠️ {error}</p>}
          {progress && <p className="muted">{progress}</p>}

          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addHomework}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setFiles([]); setError('') }}>Отмена</button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {items.length === 0 && <p className="muted">ДЗ пока не добавлено.</p>}
          {items.map(hw => {
            const list = tasksByHw[hw.id] || []
            const curMax = list.reduce((s, t) => s + (Number(t.max_score) || 0), 0)
            const curScore = list.reduce((s, t) => s + (Number(t.score) || 0), 0)
            return (
              <li key={hw.id} className="card">
                <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => openCard(hw)}>
                  <div>
                    <p className="card-title">{hw.title}</p>
                    <p className="muted">
                      {hw.students ? `${hw.students.first_name} ${hw.students.last_name}` : ''}
                      {hw.students?.grade_level ? ` · ${hw.students.grade_level}` : ''}
                    </p>
                  </div>
                  {hw.status === 'submitted' ? <span className="tag tag-blue">📨 Сдано, проверить</span>
                    : hw.status === 'checked' ? <span className="tag tag-green">{hw.correct_tasks}/{hw.total_tasks}</span>
                    : <span className="tag tag-yellow">Не сдано</span>}
                </div>

                {openId === hw.id && (
                  <div className="card-details">
                    {hw.attachments?.length > 0 && (
                      <>
                        <p className="eyebrow">Файлы задания</p>
                        <AttachmentList items={hw.attachments} />
                      </>
                    )}

                    {hw.submitted_at && (
                      <>
                        <p className="eyebrow">Работа ученика · сдано {new Date(hw.submitted_at).toLocaleString('ru-RU')}</p>
                        {hw.submission_comment && <p className="muted">💬 {hw.submission_comment}</p>}
                        <AttachmentList items={hw.submission_attachments} />
                      </>
                    )}

                    <p className="eyebrow">Оценка по заданиям</p>
                    {list.length === 0 && <p className="muted">Заданий не задано</p>}
                    {list.map(t => (
                      <div key={t.id} className="task-grade">
                        <div className="row-between">
                          <span className="card-title">{t.title}</span>
                          <span>
                            <input type="number" min="0" max={t.max_score} className="score-input inline-input"
                              value={t.score ?? ''} placeholder="—"
                              onChange={e => updateTaskField(hw.id, t.id, 'score', e.target.value)} />
                            <span className="muted"> / {t.max_score}</span>
                          </span>
                        </div>
                        <input className="text-input" placeholder="Комментарий к заданию"
                          value={t.comment ?? ''}
                          onChange={e => updateTaskField(hw.id, t.id, 'comment', e.target.value)} />
                      </div>
                    ))}

                    {list.length > 0 && (
                      <>
                        <p className="score-line">Итого: {curScore} / {curMax}</p>
                        <button className="btn-primary block" onClick={() => saveGrade(hw)}>✅ Отправить результат ученику</button>
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
