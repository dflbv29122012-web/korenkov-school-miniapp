import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { uploadFile } from '../../lib/storage'
import { KINDS } from '../Quizzes'

const EMPTY = { id: null, kind: 'formula', context: '', image_url: '', topic: '', question: '', options: ['', '', '', ''], correct_index: 0, explanation: '' }

export default function TeacherQuizzes() {
  const [questions, setQuestions] = useState([])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [stats, setStats] = useState({})
  const [error, setError] = useState('')

  async function load() {
    const [{ data: q }, { data: a }] = await Promise.all([
      supabase.from('quiz_questions').select('*').order('position'),
      supabase.from('quiz_attempts').select('question_id, is_correct'),
    ])
    setQuestions(q ?? [])
    const s = {}
    ;(a ?? []).forEach(x => {
      s[x.question_id] ||= { n: 0, ok: 0 }
      s[x.question_id].n++
      if (x.is_correct) s[x.question_id].ok++
    })
    setStats(s)
  }
  useEffect(() => { load() }, [])

  const topics = useMemo(() => [...new Set(questions.map(q => q.topic))], [questions])
  const shown = filter === 'all' ? questions : questions.filter(q => q.topic === filter)

  async function save() {
    setError('')
    const options = form.options.map(o => o.trim())
    if (!form.question.trim()) return setError('Введите вопрос')
    if (options.some(o => !o)) return setError('Заполните все 4 варианта')
    setSaving(true)
    const row = {
      topic: form.topic.trim() || 'Без темы',
      kind: form.kind || 'formula',
      context: form.context?.trim() || null,
      image_url: form.image_url || null,
      question: form.question.trim(),
      options,
      correct_index: form.correct_index,
      explanation: form.explanation.trim() || null,
    }
    const res = form.id
      ? await supabase.from('quiz_questions').update(row).eq('id', form.id)
      : await supabase.from('quiz_questions').insert({ ...row, position: questions.length + 1 })
    setSaving(false)
    if (res.error) return setError(res.error.message)
    setForm(null)
    load()
  }

  async function pickImage(e) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const up = await uploadFile('materials', f)
      setForm(prev => ({ ...prev, image_url: up.url }))
    } catch (err) { setError('Не удалось загрузить картинку: ' + err.message) }
  }

  async function del(q) {
    if (!confirm('Удалить вопрос?')) return
    await supabase.from('quiz_questions').delete().eq('id', q.id)
    load()
  }

  if (form) {
    return (
      <div className="screen">
        <header className="screen-header"><h1>{form.id ? 'Редактирование' : 'Новый вопрос'}</h1></header>
        <div className="card">
          <input className="text-input" list="quiz-topics" placeholder="Тема (напр. Тригонометрия)" value={form.topic}
            onChange={e => setForm({ ...form, topic: e.target.value })} />
          <datalist id="quiz-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
          <select className="text-input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <textarea className="text-input" rows={4} placeholder="Условие или начало решения (необязательно)" value={form.context || ''}
            onChange={e => setForm({ ...form, context: e.target.value })} />
          {form.image_url && (
            <div>
              <img className="quiz-img" src={form.image_url} alt="" />
              <button className="file-remove" onClick={() => setForm({ ...form, image_url: '' })}>✕ Убрать картинку</button>
            </div>
          )}
          <input type="file" accept="image/*" onChange={pickImage} style={{ margin: '8px 0' }} />
          <textarea className="text-input" rows={3} placeholder="Вопрос" value={form.question}
            onChange={e => setForm({ ...form, question: e.target.value })} />
          <p className="eyebrow">Варианты (отметь правильный)</p>
          {form.options.map((o, i) => (
            <label key={i} className="checkbox-row">
              <input type="radio" name="correct" checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })} />
              <input className="text-input" style={{ margin: 0 }} placeholder={`Вариант ${i + 1}`} value={o}
                onChange={e => setForm({ ...form, options: form.options.map((x, j) => j === i ? e.target.value : x) })} />
            </label>
          ))}
          <textarea className="text-input" rows={3} placeholder="Пояснение: как правильно (показывается после ответа)" value={form.explanation}
            onChange={e => setForm({ ...form, explanation: e.target.value })} />
          {error && <p className="error-text">{error}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => { setForm(null); setError('') }}>Отмена</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Мини-тесты</h1></header>
      <Link to="/teacher/settings" className="link">← Назад</Link>
      <button className="btn-primary block" onClick={() => setForm({ ...EMPTY, topic: filter === 'all' ? '' : filter })}>+ Новый вопрос</button>

      <div className="filter-row">
        <button className={'filter-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>Все ({questions.length})</button>
        {topics.map(t => (
          <button key={t} className={'filter-chip' + (filter === t ? ' active' : '')} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      <ul className="card-list">
        {shown.map(q => {
          const s = stats[q.id]
          return (
            <li key={q.id} className="card">
              <p className="eyebrow" style={{ marginTop: 0 }}>{q.topic}{s ? ` · верно ${Math.round(s.ok / s.n * 100)}% (${s.n})` : ''}</p>
              {q.context && <p className="quiz-context">{q.context}</p>}
              {q.image_url && <img className="quiz-img" src={q.image_url} alt="" />}
              <p className="card-title">{q.question}</p>
              {q.options.map((o, i) => (
                <p key={i} className="muted" style={i === q.correct_index ? { color: 'var(--green)' } : null}>
                  {i === q.correct_index ? '✓' : '•'} {o}
                </p>
              ))}
              <div className="btn-row">
                <button className="btn-secondary" onClick={() => setForm({ ...q, explanation: q.explanation || '' })}>✏️ Изменить</button>
                <button className="btn-secondary" onClick={() => del(q)}>✕ Удалить</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
