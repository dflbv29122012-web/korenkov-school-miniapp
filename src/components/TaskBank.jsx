import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadFiles } from '../lib/storage'
import FileUploader, { AttachmentList, AttachmentEditor } from './FileUploader'

// ---------- Проверка ответа ----------
function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.')
}
// Несколько правильных вариантов можно указать через «|», напр.: 0.5|1/2
export function isCorrectAnswer(user, correct) {
  const u = norm(user)
  if (!u) return false
  return String(correct ?? '').split('|').map(norm).filter(Boolean).some(v => {
    const a = Number(v), b = Number(u)
    if (!isNaN(a) && !isNaN(b)) return Math.abs(a - b) < 1e-9
    return v === u
  })
}

const EMPTY_FORM = {
  condition: '', answer: '', solution: '', solution_video_url: '',
  conditionFiles: [], solutionFiles: [],
  condition_attachments: [], solution_attachments: [],
}

// ================= УЧИТЕЛЬ: редактор заданий подтемы =================
export function TeacherTaskList({ topicId, subtopicId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [formFor, setFormFor] = useState(null) // null | 'new' | taskId
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').eq('subtopic_id', subtopicId).order('position').order('created_at')
    setTasks(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [subtopicId])

  function startNew() { setForm(EMPTY_FORM); setFormFor('new'); setError('') }
  function startEdit(t) {
    setForm({
      ...EMPTY_FORM,
      condition: t.condition || '', answer: t.answer || '',
      solution: t.solution || '', solution_video_url: t.solution_video_url || '',
      condition_attachments: t.condition_attachments || [],
      solution_attachments: t.solution_attachments || [],
    })
    setFormFor(t.id); setError('')
  }

  async function save() {
    setError('')
    if (!form.condition.trim() && form.conditionFiles.length === 0 && form.condition_attachments.length === 0) {
      return setError('Добавьте текст условия или картинку')
    }
    setSaving(true)
    try {
      let condUp = [], solUp = []
      if (form.conditionFiles.length) condUp = await uploadFiles('materials', form.conditionFiles, (i, n) => setProgress(`Условие: ${i} из ${n}…`))
      if (form.solutionFiles.length) solUp = await uploadFiles('materials', form.solutionFiles, (i, n) => setProgress(`Решение: ${i} из ${n}…`))

      const payload = {
        topic_id: topicId, subtopic_id: subtopicId,
        condition: form.condition.trim() || null,
        answer: form.answer.trim() || null,
        solution: form.solution.trim() || null,
        solution_video_url: form.solution_video_url.trim() || null,
        condition_attachments: [...form.condition_attachments, ...condUp],
        solution_attachments: [...form.solution_attachments, ...solUp],
      }
      const { error: err } = formFor === 'new'
        ? await supabase.from('tasks').insert({ ...payload, position: tasks.length + 1 })
        : await supabase.from('tasks').update(payload).eq('id', formFor)
      if (err) throw err
      setFormFor(null); load()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally { setSaving(false); setProgress('') }
  }

  async function remove(t, n) {
    if (!confirm(`Удалить задание №${n}?`)) return
    await supabase.from('tasks').delete().eq('id', t.id); load()
  }

  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= tasks.length) return
    const a = tasks[idx], b = tasks[j]
    await supabase.from('tasks').update({ position: j + 1 }).eq('id', a.id)
    await supabase.from('tasks').update({ position: idx + 1 }).eq('id', b.id)
    load()
  }

  const up = (patch) => setForm({ ...form, ...patch })

  const formUI = (
    <div className="card task-form">
      <p className="eyebrow">{formFor === 'new' ? 'Новое задание' : 'Редактирование задания'}</p>
      <textarea className="text-input" placeholder="Условие задачи" rows={4}
        value={form.condition} onChange={e => up({ condition: e.target.value })} />
      <AttachmentEditor items={form.condition_attachments} onChange={v => up({ condition_attachments: v })} />
      <FileUploader files={form.conditionFiles} onChange={f => up({ conditionFiles: f })}
        accept="image/*,.pdf" label="Картинки к условию" />

      <input className="text-input" placeholder="Правильный ответ (варианты через | , напр. 0.5|1/2)"
        value={form.answer} onChange={e => up({ answer: e.target.value })} />

      <textarea className="text-input" placeholder="Решение (текст)" rows={4}
        value={form.solution} onChange={e => up({ solution: e.target.value })} />
      <AttachmentEditor items={form.solution_attachments} onChange={v => up({ solution_attachments: v })} />
      <FileUploader files={form.solutionFiles} onChange={f => up({ solutionFiles: f })}
        accept="image/*,video/*,.pdf" label="Фото/видео решения" />
      <input className="text-input" placeholder="Ссылка на видео-разбор (необязательно)"
        value={form.solution_video_url} onChange={e => up({ solution_video_url: e.target.value })} />

      {error && <p className="error-text">⚠️ {error}</p>}
      {progress && <p className="muted">{progress}</p>}
      <div className="btn-row">
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        <button className="btn-secondary" onClick={() => setFormFor(null)}>Отмена</button>
      </div>
    </div>
  )

  return (
    <div className="task-bank">
      <div className="row-between">
        <p className="eyebrow">Задания ({tasks.length})</p>
        {formFor === null && <button className="btn-secondary" onClick={startNew}>+ Задание</button>}
      </div>
      {formFor === 'new' && formUI}
      {loading ? <p className="muted">Загрузка…</p> : tasks.map((t, i) => (
        <div key={t.id} className="task-card">
          {formFor === t.id ? formUI : (
            <>
              <div className="row-between">
                <span className="task-num">Задание {i + 1}</span>
                <div className="row-center" style={{ gap: 4 }}>
                  <button className="file-move" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="file-move" disabled={i === tasks.length - 1} onClick={() => move(i, 1)}>▼</button>
                  <button className="file-move" onClick={() => startEdit(t)}>✏️</button>
                  <button className="file-remove" onClick={() => remove(t, i + 1)}>✕</button>
                </div>
              </div>
              {t.condition && <p className="task-text">{t.condition}</p>}
              <AttachmentList items={t.condition_attachments} />
              <p className="muted small-text">Ответ: <b>{t.answer || '—'}</b></p>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ================= УЧЕНИК: решение заданий подтемы =================
export function StudentTaskList({ subtopicId, studentId }) {
  const [tasks, setTasks] = useState([])
  const [solved, setSolved] = useState({})      // taskId -> true/false (последняя попытка)
  const [inputs, setInputs] = useState({})
  const [showSolution, setShowSolution] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: ts } = await supabase.from('tasks').select('*').eq('subtopic_id', subtopicId).order('position').order('created_at')
      const ids = (ts ?? []).map(t => t.id)
      let map = {}
      if (ids.length && studentId) {
        const { data: at } = await supabase.from('task_attempts').select('task_id, is_correct, answer, created_at')
          .eq('student_id', studentId).in('task_id', ids).order('created_at')
        ;(at ?? []).forEach(a => { map[a.task_id] = map[a.task_id] || a.is_correct })
      }
      if (!cancelled) { setTasks(ts ?? []); setSolved(map); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [subtopicId, studentId])

  async function check(t) {
    const val = inputs[t.id] || ''
    if (!val.trim()) return
    const ok = isCorrectAnswer(val, t.answer)
    setSolved(prev => ({ ...prev, [t.id]: prev[t.id] || ok }))
    setInputs(prev => ({ ...prev, [`res_${t.id}`]: ok ? 'ok' : 'bad' }))
    if (studentId) {
      await supabase.from('task_attempts').insert({ task_id: t.id, student_id: studentId, answer: val, is_correct: ok })
    }
  }

  if (loading) return <p className="muted">Загрузка заданий…</p>
  if (tasks.length === 0) return null

  const solvedCount = tasks.filter(t => solved[t.id]).length

  return (
    <div className="task-bank">
      <div className="row-between">
        <p className="eyebrow">Задания</p>
        <span className="tag tag-green">Решено {solvedCount} из {tasks.length}</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(solvedCount / tasks.length * 100)}%` }} /></div>

      {tasks.map((t, i) => {
        const res = inputs[`res_${t.id}`]
        return (
          <div key={t.id} className={'task-card' + (solved[t.id] ? ' solved' : '')}>
            <div className="row-between">
              <span className="task-num">Задание {i + 1}</span>
              {solved[t.id] && <span className="tag tag-green">✓ Решено</span>}
            </div>
            {t.condition && <p className="task-text">{t.condition}</p>}
            <AttachmentList items={t.condition_attachments} />

            {t.answer && (
              <div className="btn-row">
                <input className="text-input" placeholder="Ваш ответ"
                  value={inputs[t.id] || ''}
                  onChange={e => setInputs({ ...inputs, [t.id]: e.target.value, [`res_${t.id}`]: null })}
                  onKeyDown={e => { if (e.key === 'Enter') check(t) }} />
                <button className="btn-primary" onClick={() => check(t)}>Проверить</button>
              </div>
            )}
            {res === 'ok' && <p className="ontime-time">✅ Верно!</p>}
            {res === 'bad' && <p className="late-time">❌ Неверно, попробуйте ещё</p>}

            {(t.solution || t.solution_attachments?.length > 0 || t.solution_video_url) && (
              <button className="btn-secondary block" onClick={() => setShowSolution({ ...showSolution, [t.id]: !showSolution[t.id] })}>
                {showSolution[t.id] ? 'Скрыть решение' : '💡 Показать решение'}
              </button>
            )}
            {showSolution[t.id] && (
              <div className="task-solution">
                {t.answer && <p className="muted">Ответ: <b>{t.answer.split('|')[0]}</b></p>}
                {t.solution && <p className="task-text">{t.solution}</p>}
                <AttachmentList items={t.solution_attachments} />
                {t.solution_video_url && <a href={t.solution_video_url} target="_blank" rel="noreferrer" className="link">▶ Видео-разбор</a>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
