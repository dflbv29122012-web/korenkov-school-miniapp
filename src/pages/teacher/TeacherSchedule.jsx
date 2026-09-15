import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSchedule() {
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [targetType, setTargetType] = useState('student') // 'student' | 'group'

  const [form, setForm] = useState({
    student_id: '', group_id: '', subject: '', topic: '', date: '', time: '', duration_minutes: 60,
  })

  async function loadAll() {
    setLoading(true)
    const [{ data: ls }, { data: st }, { data: gr }] = await Promise.all([
      supabase.from('lessons').select('*, students(first_name,last_name), groups(name)').order('starts_at', { ascending: false }).limit(40),
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
    if (targetType === 'student' && !form.student_id) return
    if (targetType === 'group' && !form.group_id) return
    if (!form.date || !form.time) return

    setSaving(true)
    const startsAt = new Date(`${form.date}T${form.time}:00`).toISOString()
    const base = {
      subject: form.subject || null,
      topic: form.topic || null,
      title: form.topic || form.subject || 'Занятие',
      starts_at: startsAt,
      duration_minutes: Number(form.duration_minutes) || 60,
    }

    let error
    if (targetType === 'group') {
      ;({ error } = await supabase.from('lessons').insert({ ...base, group_id: form.group_id }))
    } else {
      ;({ error } = await supabase.from('lessons').insert({ ...base, student_id: form.student_id }))
    }

    setSaving(false)
    if (!error) {
      setForm({ student_id: '', group_id: '', subject: '', topic: '', date: '', time: '', duration_minutes: 60 })
      setShowForm(false)
      loadAll()
    } else {
      alert('Ошибка: ' + error.message)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание занятий</h1></header>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => setShowForm(true)}>+ Добавить занятие</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новое занятие</p>

          <div className="btn-row">
            <button
              className={'filter-chip' + (targetType === 'student' ? ' active' : '')}
              onClick={() => setTargetType('student')}
            >👤 Индивидуальное</button>
            <button
              className={'filter-chip' + (targetType === 'group' ? ' active' : '')}
              onClick={() => setTargetType('group')}
            >👥 Групповое</button>
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
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addLesson}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
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
                  {l.groups ? `👥 ${l.groups.name}` : l.students ? `👤 ${l.students.first_name} ${l.students.last_name}` : ''}
                  {l.subject ? ` · ${l.subject}` : ''}
                </p>
              </div>
              <p className="muted small-text">{new Date(l.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
