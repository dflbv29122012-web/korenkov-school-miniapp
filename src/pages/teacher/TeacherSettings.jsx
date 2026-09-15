import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSettings() {
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [links, setLinks] = useState([]) // {student_id, group_id}
  const [loading, setLoading] = useState(true)
  const [openGroupId, setOpenGroupId] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: gr }, { data: st }, { data: ln }] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
      supabase.from('student_groups').select('*'),
    ])
    setGroups(gr ?? [])
    setStudents(st ?? [])
    setLinks(ln ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function toggleMember(studentId, groupId) {
    const exists = links.some(l => l.student_id === studentId && l.group_id === groupId)
    if (exists) {
      await supabase.from('student_groups').delete().eq('student_id', studentId).eq('group_id', groupId)
      setLinks(prev => prev.filter(l => !(l.student_id === studentId && l.group_id === groupId)))
    } else {
      await supabase.from('student_groups').insert({ student_id: studentId, group_id: groupId })
      setLinks(prev => [...prev, { student_id: studentId, group_id: groupId }])
    }
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Настройки</h1></header>

      <p className="eyebrow">Группы</p>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {groups.map(g => {
            const memberIds = new Set(links.filter(l => l.group_id === g.id).map(l => l.student_id))
            return (
              <li key={g.id} className="card">
                <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setOpenGroupId(openGroupId === g.id ? null : g.id)}>
                  <p className="card-title">{g.name}</p>
                  <span className="muted">{memberIds.size} чел.</span>
                </div>
                {openGroupId === g.id && (
                  <div className="card-details">
                    {students.length === 0 && <p className="muted">Сначала добавьте учеников на вкладке «Ученики»</p>}
                    {students.map(s => (
                      <label key={s.id} className="checkbox-row">
                        <input type="checkbox" checked={memberIds.has(s.id)} onChange={() => toggleMember(s.id, g.id)} />
                        {s.first_name} {s.last_name}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <section className="card">
        <p className="eyebrow">О приложении</p>
        <p className="muted">Korenkov School Mini App</p>
        <p className="muted small-text">Версия 2.1</p>
      </section>
    </div>
  )
}
