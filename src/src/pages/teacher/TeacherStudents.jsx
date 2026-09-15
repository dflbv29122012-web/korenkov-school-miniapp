import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherStudents() {
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [studentGroupIds, setStudentGroupIds] = useState({})

  const [newStudent, setNewStudent] = useState({ telegram_id: '', first_name: '', last_name: '', grade_level: '' })
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    setLoading(true)
    const [{ data: st }, { data: gr }, { data: links }] = await Promise.all([
      supabase.from('students').select('*').eq('is_teacher', false).order('first_name'),
      supabase.from('groups').select('*').order('name'),
      supabase.from('student_groups').select('*'),
    ])
    setStudents(st ?? [])
    setGroups(gr ?? [])
    const map = {}
    ;(links ?? []).forEach(l => {
      if (!map[l.student_id]) map[l.student_id] = new Set()
      map[l.student_id].add(l.group_id)
    })
    setStudentGroupIds(map)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function toggleAccess(s) {
    const newVal = !s.access_open
    await supabase.from('students').update({
      access_open: newVal,
      access_closed_since: newVal ? null : new Date().toISOString().slice(0, 10),
    }).eq('id', s.id)
    setStudents(prev => prev.map(x => x.id === s.id ? { ...x, access_open: newVal } : x))
  }

  async function updateDebt(s, amount) {
    await supabase.from('students').update({ debt_amount: amount }).eq('id', s.id)
    setStudents(prev => prev.map(x => x.id === s.id ? { ...x, debt_amount: amount } : x))
  }

  async function toggleGroup(studentId, groupId) {
    const current = studentGroupIds[studentId] || new Set()
    const has = current.has(groupId)
    if (has) {
      await supabase.from('student_groups').delete().eq('student_id', studentId).eq('group_id', groupId)
    } else {
      await supabase.from('student_groups').insert({ student_id: studentId, group_id: groupId })
    }
    setStudentGroupIds(prev => {
      const next = { ...prev }
      const set = new Set(next[studentId] || [])
      has ? set.delete(groupId) : set.add(groupId)
      next[studentId] = set
      return next
    })
  }

  async function addStudent() {
    if (!newStudent.telegram_id || !newStudent.first_name) return
    setSaving(true)
    const { error } = await supabase.from('students').insert({
      telegram_id: Number(newStudent.telegram_id),
      first_name: newStudent.first_name,
      last_name: newStudent.last_name || null,
      grade_level: newStudent.grade_level || null,
      access_open: false,
    })
    setSaving(false)
    if (!error) {
      setNewStudent({ telegram_id: '', first_name: '', last_name: '', grade_level: '' })
      setShowAddForm(false)
      loadAll()
    } else {
      alert('Ошибка: ' + error.message)
    }
  }

  const total = students.length
  const paid = students.filter(s => s.access_open).length
  const debtCount = students.filter(s => !s.access_open).length

  return (
    <div className="screen">
      <div className="row-between">
        <div>
          <h1>Мои ученики</h1>
          <p className="muted">{new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p>
        </div>
        <span className="badge-role">Учитель</span>
      </div>

      <div className="stat-row">
        <div className="stat-box"><span className="stat-num blue">{total}</span><span className="stat-label">Учеников всего</span></div>
        <div className="stat-box"><span className="stat-num green">{paid}</span><span className="stat-label">Оплатили</span></div>
        <div className="stat-box"><span className="stat-num red">{debtCount}</span><span className="stat-label">Задолженность</span></div>
      </div>

      <p className="eyebrow">Статус оплаты</p>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {students.length === 0 && <p className="muted">Учеников пока нет</p>}
          {students.map(s => (
            <li key={s.id} className="card">
              <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                <div className="row-center">
                  <div className="avatar-circle small">{(s.first_name?.[0] || '?').toUpperCase()}</div>
                  <div>
                    <p className="card-title">{s.first_name} {s.last_name}</p>
                    <p className="muted">{s.grade_level || ''}</p>
                  </div>
                </div>
                <span className={'tag ' + (s.access_open ? 'tag-green' : 'tag-red')}>
                  {s.access_open ? 'Оплачен ✓' : '✕ Долг'}
                </span>
              </div>

              {openId === s.id && (
                <div className="card-details">
                  <button className="btn-secondary block" onClick={() => toggleAccess(s)}>
                    {s.access_open ? '🔒 Закрыть доступ' : '✅ Открыть доступ'}
                  </button>

                  <div className="row-between info-row">
                    <span className="muted">Задолженность</span>
                    <input
                      type="number"
                      className="inline-input"
                      defaultValue={s.debt_amount ?? 0}
                      onBlur={(e) => updateDebt(s, Number(e.target.value))}
                    /> ₽
                  </div>

                  <p className="eyebrow">Группы</p>
                  <div className="chip-wrap">
                    {groups.map(g => {
                      const active = studentGroupIds[s.id]?.has(g.id)
                      return (
                        <button
                          key={g.id}
                          className={'filter-chip' + (active ? ' active' : '')}
                          onClick={() => toggleGroup(s.id, g.id)}
                        >
                          {g.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button className="btn-primary block">📩 Напомнить должникам</button>

      {!showAddForm ? (
        <button className="btn-secondary block" onClick={() => setShowAddForm(true)}>+ Добавить ученика</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новый ученик</p>
          <input className="text-input" placeholder="Telegram ID (узнать через @userinfobot)"
            value={newStudent.telegram_id} onChange={e => setNewStudent({ ...newStudent, telegram_id: e.target.value })} />
          <input className="text-input" placeholder="Имя"
            value={newStudent.first_name} onChange={e => setNewStudent({ ...newStudent, first_name: e.target.value })} />
          <input className="text-input" placeholder="Фамилия"
            value={newStudent.last_name} onChange={e => setNewStudent({ ...newStudent, last_name: e.target.value })} />
          <input className="text-input" placeholder="Класс (напр. 9 класс)"
            value={newStudent.grade_level} onChange={e => setNewStudent({ ...newStudent, grade_level: e.target.value })} />
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addStudent}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}
