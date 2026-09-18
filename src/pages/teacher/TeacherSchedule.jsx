import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSchedule() {
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [targetType, setTargetType] = useState('student')

  const emptyForm = { student_id: '', group_id: '', subject: '', topic: '', date: '', time: '', duration_minutes: 60 }
  const [form, setForm] = useState(emptyForm)

  async function loadAll() {
    setLoading(true)
    const [{ data: ls }, { data: st }, { data: gr }] = await Promise.all([
      supabase.from('lessons').select('*, students(first_name,last_name), groups(name)').order('starts_at', { ascending: false }).limit(200),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
      supabase.from('groups').select('*').order('name'),
    ])
    setLessons(ls ?? [])
    setStudents(st ?? [])
    setGroups(gr ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function addLesson() {
    setError('')

    if (targetType === 'student' && !form.student_id) return setError('Выберите ученика')
    if (targetType === 'group' && !form.group_id) return setError('Выберите группу')
    if (!form.date) return setError('Укажите дату занятия')
    if (!form.time) return setError('Укажите время занятия')

    setSaving(true)
    const startsAt = new Date(`${form.date}T${form.time}:00`)
    if (isNaN(startsAt.getTime())) {
      setSaving(false)
      return setError('Неверный формат даты или времени')
    }

    const payload = {
      subject: form.subject || null,
      topic: form.topic || null,
      title: form.topic || form.subject || 'Занятие',
      starts_at: startsAt.toISOString(),
      duration_minutes: Number(form.duration_minutes) || 60,
      student_id: targetType === 'student' ? form.student_id : null,
      group_id: targetType === 'group' ? form.group_id : null,
    }

    const { error: err } = await supabase.from('lessons').insert(payload)
    setSaving(false)

    if (err) return setError('Не удалось сохранить: ' + err.message)

    setForm(emptyForm)
    setShowForm(false)
    loadAll()
  }

  async function deleteLesson(l) {
    if (!confirm(`Удалить занятие «${l.topic || l.title}»?`)) return
    await supabase.from('lessons').delete().eq('id', l.id)
    loadAll()
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание занятий</h1></header>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => { setShowForm(true); setError('') }}>+ Добавить занятие</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новое занятие</p>

          <div className="btn-row">
            <button className={'filter-chip' + (targetType === 'student' ? ' active' : '')} onClick={() => { setTargetType('student'); setError('') }}>👤 Индивидуальное</button>
            <button className={'filter-chip' + (targetType === 'group' ? ' active' : '')} onClick={() => { setTargetType('group'); setError('') }}>👥 Групповое</button>
          </div>

          {targetType === 'student' ? (
            <select className="text-input" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Выберите ученика</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          ) : (
            <select className="text-input" value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Выберите группу</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}

          <input className="text-input" placeholder="Предмет (напр. Алгебра)" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <input className="text-input" placeholder="Тема занятия" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} />
          <div className="btn-row">
            <input type="date" className="text-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="time" className="text-input" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
          </div>
          <input type="number" className="text-input" placeholder="Длительность (мин)" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />

          {error && <p className="error-text">⚠️ {error}</p>}

          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addLesson}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setError('') }}>Отмена</button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {lessons.length === 0 && <p className="muted">Занятий пока не добавлено.</p>}
          {lessons.map(l => (
            <li key={l.id} className="card row-between">
              <div>
                <p className="card-title">{l.topic || l.title}</p>
                <p className="muted">
                  {l.groups ? `👥 ${l.groups.name}` : l.students ? `👤 ${l.students.first_name} ${l.students.last_name}` : '—'}
                  {l.subject ? ` · ${l.subject}` : ''}
                </p>
              </div>
              <div className="row-center" style={{ gap: 8 }}>
                <p className="muted small-text" style={{ textAlign: 'right' }}>
                  {new Date(l.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  <br />{new Date(l.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <button className="file-remove" onClick={() => deleteLesson(l)}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
