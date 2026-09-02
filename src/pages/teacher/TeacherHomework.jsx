import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherHomework() {
  const [items, setItems] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    student_id: '', title: '', description: '', due_date: '', total_tasks: '',
  })

  async function loadAll() {
    setLoading(true)
    const [{ data: hw }, { data: st }] = await Promise.all([
      supabase.from('homework').select('*, students(first_name,last_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
    ])
    setItems(hw ?? [])
    setStudents(st ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function markChecked(hw) {
    await supabase.from('homework').update({ status: 'checked' }).eq('id', hw.id)
    setItems(prev => prev.map(x => x.id === hw.id ? { ...x, status: 'checked' } : x))
  }

  async function addHomework() {
    if (!form.student_id || !form.title) return
    setSaving(true)
    const { error } = await supabase.from('homework').insert({
      student_id: form.student_id,
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      total_tasks: form.total_tasks ? Number(form.total_tasks) : null,
      status: 'assigned',
    })
    setSaving(false)
    if (!error) {
      setForm({ student_id: '', title: '', description: '', due_date: '', total_tasks: '' })
      setShowForm(false)
      loadAll()
    } else {
      alert('Ошибка: ' + error.message)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Домашние задания</h1></header>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => setShowForm(true)}>+ Задать ДЗ</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новое ДЗ</p>
          <select className="text-input" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Выберите ученика</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <input className="text-input" placeholder="Название ДЗ" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <textarea className="text-input" placeholder="Описание (необязательно)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="btn-row">
            <input type="date" className="text-input" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            <input type="number" className="text-input" placeholder="Кол-во задач" value={form.total_tasks} onChange={e => setForm({ ...form, total_tasks: e.target.value })} />
          </div>
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addHomework}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {items.length === 0 && <p className="muted">ДЗ пока не добавлено.</p>}
          {items.map(hw => (
            <li key={hw.id} className="card row-between">
              <div>
                <p className="card-title">{hw.title}</p>
                <p className="muted">{hw.students ? `${hw.students.first_name} ${hw.students.last_name}` : ''}</p>
              </div>
              {hw.status === 'submitted' ? (
                <button className="btn-secondary" onClick={() => markChecked(hw)}>Отметить проверенным</button>
              ) : (
                <span className={'tag ' + (hw.status === 'checked' ? 'tag-green' : 'tag-yellow')}>
                  {hw.status === 'checked' ? 'Проверено' : 'Не сдано'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
