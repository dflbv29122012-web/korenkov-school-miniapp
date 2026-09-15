import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherStudents() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('students').select('*').eq('is_teacher', false).order('first_name')
      .then(({ data }) => { if (!cancelled) { setStudents(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  async function toggleAccess(s) {
    const newVal = !s.access_open
    await supabase.from('students').update({
      access_open: newVal,
      access_closed_since: newVal ? null : new Date().toISOString().slice(0, 10),
    }).eq('id', s.id)
    setStudents(prev => prev.map(x => x.id === s.id ? { ...x, access_open: newVal } : x))
  }

  const total = students.length
  const paid = students.filter(s => s.access_open).length
  const debt = students.filter(s => !s.access_open).length

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
        <div className="stat-box"><span className="stat-num red">{debt}</span><span className="stat-label">Задолженность</span></div>
      </div>

      <p className="eyebrow">Статус оплаты</p>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {students.length === 0 && <p className="muted">Учеников пока нет</p>}
          {students.map(s => (
            <li key={s.id} className="card row-between" onClick={() => toggleAccess(s)} style={{ cursor: 'pointer' }}>
              <div className="row-center">
                <div className="avatar-circle small">{(s.first_name?.[0] || '?').toUpperCase()}{(s.last_name?.[0] || '')}</div>
                <div>
                  <p className="card-title">{s.first_name} {s.last_name}</p>
                  <p className="muted">{s.grade_level || ''}</p>
                </div>
              </div>
              <span className={'tag ' + (s.access_open ? 'tag-green' : 'tag-red')}>
                {s.access_open ? 'Оплачен ✓' : '✕ Долг'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button className="btn-primary block">📩 Напомнить должникам</button>
      <button className="btn-secondary block">+ Добавить ученика</button>
    </div>
  )
}
