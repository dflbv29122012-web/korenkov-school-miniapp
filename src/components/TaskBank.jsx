import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadFiles } from '../lib/storage'
import FileUploader, { AttachmentList, AttachmentEditor } from './FileUploader'

// ---------- Проверка ответа ----------
function norm(s) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/[\u2212\u2013\u2014]/g, '-').replace(/\s+/g, '').replace(/,/g, '.').replace(/\.$/, '')
}
// Несколько верных вариантов через «|», напр.: 0.5|1/2
export function isCorrectAnswer(user, correct) {
  const u = norm(user)
  if (!u) return false
  return String(correct ?? '').split('|').map(norm).filter(Boolean).some(v => {
    const a = Number(v), b = Number(u)
    if (!isNaN(a) && !isNaN(b)) return Math.abs(a - b) < 1e-9
    return v === u
  })
}

// Ответ картинкой: новое поле answer_attachments, либо (для ранее загруженного банка)
// картинки «Ответ», лежащие в solution_attachments без текста решения
export function answerImages(t) {
  if (t.answer_attachments?.length) return t.answer_attachments
  const sol = t.solution_attachments || []
  if (!t.solution && !t.solution_video_url && sol.length && sol.every(a => a.name === 'Ответ')) return sol
  return []
}
export function solutionImages(t) {
  const sol = t.solution_attachments || []
  return answerImages(t) === sol ? [] : sol
}

// ---------- Пакетный импорт текста ----------
const KEYS = { 'условие': 'condition', 'ответ': 'answer', 'решение': 'solution', 'видео': 'video', 'подсказка': 'hint', 'источник': 'source' }
export function parseTasks(text) {
  return String(text || '')
    .split(/^\s*-{3,}\s*$/m).map(b => b.trim()).filter(Boolean)
    .map(block => {
      const out = { condition: '', answer: '', solution: '', video: '', hint: '', source: '' }
      let cur = 'condition'
      for (const line of block.split('\n')) {
        const m = line.match(/^\s*(Условие|Ответ|Решение|Видео|Подсказка|Источник)\s*:\s*(.*)$/i)
        if (m) { cur = KEYS[m[1].toLowerCase()]; out[cur] = m[2] }
        else out[cur] += (out[cur] ? '\n' : '') + line
      }
      Object.keys(out).forEach(k => { out[k] = out[k].trim() })
      return out
    })
    .filter(t => t.condition)
}

const IMPORT_HINT = `Источник: Мой вариант 1
Условие: Найдите площадь треугольника со сторонами 3, 4, 5.
Ответ: 6
Подсказка: Проверьте, не прямоугольный ли он.
Решение: 3² + 4² = 5², значит треугольник прямоугольный, S = 3·4/2.
---
Условие: Следующая задача…
Ответ: 12`

const EMPTY_FORM = {
  source: '', condition: '', answer: '', hint: '', solution: '', solution_video_url: '',
  conditionFiles: [], answerFiles: [], solutionFiles: [],
  condition_attachments: [], answer_attachments: [], solution_attachments: [],
}

// ================= УЧИТЕЛЬ =================
export function TeacherTaskList({ topicId, subtopicId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [formFor, setFormFor] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [panel, setPanel] = useState(null) // null | 'text' | 'images'
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkSource, setBulkSource] = useState('')
  const [showSol, setShowSol] = useState({}) // id -> bool: раскрыто решение

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').eq('subtopic_id', subtopicId).order('position').order('created_at')
    setTasks(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [subtopicId])

  const up = (patch) => setForm({ ...form, ...patch })
  function startNew() { setForm(EMPTY_FORM); setFormFor('new'); setError(''); setPanel(null) }
  function startEdit(t) {
    setForm({
      ...EMPTY_FORM,
      source: t.source || '', condition: t.condition || '', answer: t.answer || '', hint: t.hint || '',
      solution: t.solution || '', solution_video_url: t.solution_video_url || '',
      condition_attachments: t.condition_attachments || [],
      answer_attachments: answerImages(t), solution_attachments: solutionImages(t),
    })
    setFormFor(t.id); setError('')
  }

  async function save() {
    setError('')
    if (!form.condition.trim() && !form.conditionFiles.length && !form.condition_attachments.length) return setError('Добавьте текст условия или картинку')
    setSaving(true)
    try {
      const upl = async (files, label) => files.length ? uploadFiles('materials', files, (i, n) => setProgress(`${label}: ${i} из ${n}…`)) : []
      const cond = await upl(form.conditionFiles, 'Условие')
      const ans = await upl(form.answerFiles, 'Ответ')
      const sol = await upl(form.solutionFiles, 'Решение')
      const payload = {
        topic_id: topicId, subtopic_id: subtopicId,
        source: form.source.trim() || null,
        condition: form.condition.trim() || null,
        answer: form.answer.trim() || null,
        hint: form.hint.trim() || null,
        solution: form.solution.trim() || null,
        solution_video_url: form.solution_video_url.trim() || null,
        condition_attachments: [...form.condition_attachments, ...cond],
        answer_attachments: [...form.answer_attachments, ...ans],
        solution_attachments: [...form.solution_attachments, ...sol],
      }
      const { error: err } = formFor === 'new'
        ? await supabase.from('tasks').insert({ ...payload, position: tasks.length + 1 })
        : await supabase.from('tasks').update(payload).eq('id', formFor)
      if (err) throw err
      setFormFor(null); load()
    } catch (e) { setError('Ошибка: ' + e.message) } finally { setSaving(false); setProgress('') }
  }

  async function runTextImport() {
    const parsed = parseTasks(importText)
    if (!parsed.length) return setImportMsg('Не нашёл ни одного задания. Проверьте формат.')
    const rows = parsed.map((t, i) => ({
      topic_id: topicId, subtopic_id: subtopicId, position: tasks.length + i + 1,
      source: t.source || null, condition: t.condition, answer: t.answer || null, hint: t.hint || null,
      solution: t.solution || null, solution_video_url: t.video || null,
    }))
    const { error: err } = await supabase.from('tasks').insert(rows)
    if (err) return setImportMsg('Ошибка: ' + err.message)
    setImportMsg(`Добавлено заданий: ${rows.length}`); setImportText(''); load()
  }

  async function runImageImport() {
    if (!bulkFiles.length) return setImportMsg('Выберите картинки')
    try {
      const imgs = await uploadFiles('materials', bulkFiles, (i, n) => setImportMsg(`Загрузка ${i} из ${n}…`))
      const rows = imgs.map((img, i) => ({
        topic_id: topicId, subtopic_id: subtopicId, position: tasks.length + i + 1,
        source: bulkSource.trim() || null, condition_attachments: [img],
      }))
      const { error: err } = await supabase.from('tasks').insert(rows)
      if (err) throw err
      setImportMsg(`Создано заданий: ${rows.length}. Ответы, подсказки и решения добавьте через ✏️.`)
      setBulkFiles([]); load()
    } catch (e) { setImportMsg('Ошибка: ' + e.message) }
  }

  async function remove(t, n) {
    if (!confirm(`Удалить задание №${n}?`)) return
    await supabase.from('tasks').delete().eq('id', t.id); load()
  }
  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= tasks.length) return
    await supabase.from('tasks').update({ position: j + 1 }).eq('id', tasks[idx].id)
    await supabase.from('tasks').update({ position: idx + 1 }).eq('id', tasks[j].id)
    load()
  }

  const formUI = (
    <div className="card task-form">
      <p className="eyebrow">{formFor === 'new' ? 'Новое задание' : 'Редактирование задания'}</p>
      <input className="text-input" placeholder="Источник (напр. «Вариант 3 | Вариант 13»)" value={form.source} onChange={e => up({ source: e.target.value })} />
      <textarea className="text-input" rows={4} placeholder="Условие задачи" value={form.condition} onChange={e => up({ condition: e.target.value })} />
      <AttachmentEditor items={form.condition_attachments} onChange={v => up({ condition_attachments: v })} />
      <FileUploader files={form.conditionFiles} onChange={f => up({ conditionFiles: f })} accept="image/*,.pdf" label="Картинки к условию" />

      <p className="eyebrow">Ответ</p>
      <input className="text-input" placeholder="Ответ для автопроверки (варианты через |)" value={form.answer} onChange={e => up({ answer: e.target.value })} />
      <AttachmentEditor items={form.answer_attachments} onChange={v => up({ answer_attachments: v })} />
      <FileUploader files={form.answerFiles} onChange={f => up({ answerFiles: f })} accept="image/*" label="Ответ картинкой (для второй части)" />

      <p className="eyebrow">Подсказка к заданию</p>
      <textarea className="text-input" rows={3} placeholder="Идея: …&#10;Инструмент: …&#10;Осторожно: …" value={form.hint} onChange={e => up({ hint: e.target.value })} />

      <p className="eyebrow">Решение</p>
      <textarea className="text-input" rows={4} placeholder="Решение (текст)" value={form.solution} onChange={e => up({ solution: e.target.value })} />
      <AttachmentEditor items={form.solution_attachments} onChange={v => up({ solution_attachments: v })} />
      <FileUploader files={form.solutionFiles} onChange={f => up({ solutionFiles: f })} accept="image/*,video/*,.pdf" label="Фото/видео решения" />
      <input className="text-input" placeholder="Ссылка на видео-разбор" value={form.solution_video_url} onChange={e => up({ solution_video_url: e.target.value })} />

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
        {formFor === null && (
          <div className="row-center" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => { setPanel(panel === 'images' ? null : 'images'); setImportMsg('') }}>🖼 Картинки</button>
            <button className="btn-secondary" onClick={() => { setPanel(panel === 'text' ? null : 'text'); setImportMsg('') }}>📥 Текст</button>
            <button className="btn-secondary" onClick={startNew}>+ Задание</button>
          </div>
        )}
      </div>

      {panel === 'images' && (
        <div className="card task-form">
          <p className="eyebrow">Пакет картинок: каждая картинка — отдельное задание</p>
          <input className="text-input" placeholder="Источник для всех (необязательно)" value={bulkSource} onChange={e => setBulkSource(e.target.value)} />
          <FileUploader files={bulkFiles} onChange={setBulkFiles} accept="image/*" max={200} label="Выбрать картинки заданий" />
          {importMsg && <p className="muted">{importMsg}</p>}
          <div className="btn-row">
            <button className="btn-primary" onClick={runImageImport}>Создать {bulkFiles.length || ''} заданий</button>
            <button className="btn-secondary" onClick={() => setPanel(null)}>Закрыть</button>
          </div>
        </div>
      )}
      {panel === 'text' && (
        <div className="card task-form">
          <p className="eyebrow">Пакетный импорт текста</p>
          <p className="muted small-text">Задания разделяйте строкой «---». Поля: Источник, Условие, Ответ, Подсказка, Решение, Видео.</p>
          <textarea className="text-input" rows={10} placeholder={IMPORT_HINT} value={importText} onChange={e => { setImportText(e.target.value); setImportMsg('') }} />
          <p className="muted small-text">Найдено заданий: {parseTasks(importText).length}</p>
          {importMsg && <p className="muted">{importMsg}</p>}
          <div className="btn-row">
            <button className="btn-primary" onClick={runTextImport}>Загрузить</button>
            <button className="btn-secondary" onClick={() => setPanel(null)}>Закрыть</button>
          </div>
        </div>
      )}

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
              {t.source && <p className="task-source">{t.source}</p>}
              {t.condition && <p className="task-text">{t.condition}</p>}
              <AttachmentList items={t.condition_attachments} full />
              <p className="muted small-text">
                Ответ: <b>{t.answer || (answerImages(t).length ? 'картинкой' : '—')}</b>
                {t.hint ? ' · есть подсказка' : ''}
              </p>
              {(t.solution || solutionImages(t).length || t.solution_video_url || answerImages(t).length || t.hint) && (
                <div className="task-actions">
                  <button className={'chip-btn' + (showSol[t.id] ? ' on' : '')} onClick={() => setShowSol({ ...showSol, [t.id]: !showSol[t.id] })}>
                    📖 {showSol[t.id] ? 'Скрыть решение' : 'Показать решение'}
                  </button>
                </div>
              )}
              {showSol[t.id] && (
                <div className="task-panel">
                  {t.hint && <p className="task-text"><b>💡 Подсказка:</b> {t.hint}</p>}
                  {t.solution && <p className="task-text">{t.solution}</p>}
                  <AttachmentList items={solutionImages(t)} full />
                  {answerImages(t).length > 0 && <><p className="muted small-text">Ответ:</p><AttachmentList items={answerImages(t)} full /></>}
                  {t.solution_video_url && <a href={t.solution_video_url} target="_blank" rel="noreferrer" className="link">▶ Видео-разбор</a>}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ================= УЧЕНИК =================
export function StudentTaskList({ subtopicId, studentId }) {
  const [tasks, setTasks] = useState([])
  const [solved, setSolved] = useState({})
  const [inputs, setInputs] = useState({})
  const [open, setOpen] = useState({}) // `${id}:hint|answer|solution` -> bool
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: ts } = await supabase.from('tasks').select('*').eq('subtopic_id', subtopicId).order('position').order('created_at')
      const ids = (ts ?? []).map(t => t.id)
      const map = {}
      if (ids.length && studentId) {
        const { data: at } = await supabase.from('task_attempts').select('task_id, is_correct').eq('student_id', studentId).in('task_id', ids)
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
    setSolved(p => ({ ...p, [t.id]: p[t.id] || ok }))
    setInputs(p => ({ ...p, [`res_${t.id}`]: ok ? 'ok' : 'bad' }))
    if (studentId) await supabase.from('task_attempts').insert({ task_id: t.id, student_id: studentId, answer: val, is_correct: ok })
  }
  const toggle = (id, what) => setOpen(p => ({ ...p, [`${id}:${what}`]: !p[`${id}:${what}`] }))

  if (loading) return <p className="muted">Загрузка заданий…</p>
  if (!tasks.length) return null
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
        const aImgs = answerImages(t), sImgs = solutionImages(t)
        const hasAnswer = t.answer || aImgs.length
        const hasSolution = t.solution || sImgs.length || t.solution_video_url
        const isOpen = (w) => open[`${t.id}:${w}`]
        return (
          <div key={t.id} className={'task-card' + (solved[t.id] ? ' solved' : '')}>
            <div className="row-between">
              <span className="task-num">Задание {i + 1}</span>
              {solved[t.id] && <span className="tag tag-green">✓ Решено</span>}
            </div>
            {t.source && <p className="task-source">{t.source}</p>}
            {t.condition && <p className="task-text">{t.condition}</p>}
            <AttachmentList items={t.condition_attachments} full />

            {t.answer && (
              <div className="btn-row">
                <input className="text-input" placeholder="Ваш ответ" value={inputs[t.id] || ''}
                  onChange={e => setInputs({ ...inputs, [t.id]: e.target.value, [`res_${t.id}`]: null })}
                  onKeyDown={e => { if (e.key === 'Enter') check(t) }} />
                <button className="btn-primary" onClick={() => check(t)}>Проверить</button>
              </div>
            )}
            {res === 'ok' && <p className="ontime-time">✅ Верно!</p>}
            {res === 'bad' && <p className="late-time">❌ Неверно, попробуйте ещё</p>}

            <div className="task-actions">
              {t.hint && <button className={'chip-btn' + (isOpen('hint') ? ' on' : '')} onClick={() => toggle(t.id, 'hint')}>💡 Подсказка</button>}
              {hasSolution && <button className={'chip-btn' + (isOpen('solution') ? ' on' : '')} onClick={() => toggle(t.id, 'solution')}>📖 Решение</button>}
              {hasAnswer && <button className={'chip-btn' + (isOpen('answer') ? ' on' : '')} onClick={() => toggle(t.id, 'answer')}>✔️ Ответ</button>}
            </div>

            {isOpen('hint') && <div className="task-panel hint"><p className="task-text">{t.hint}</p></div>}
            {isOpen('solution') && (
              <div className="task-panel">
                {t.solution && <p className="task-text">{t.solution}</p>}
                <AttachmentList items={sImgs} full />
                {t.solution_video_url && <a href={t.solution_video_url} target="_blank" rel="noreferrer" className="link">▶ Видео-разбор</a>}
              </div>
            )}
            {isOpen('answer') && (
              <div className="task-panel">
                {t.answer && <p>Ответ: <b>{t.answer.split('|')[0]}</b></p>}
                <AttachmentList items={aImgs} full />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
