import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSettings() {
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [openGroupId, setOpenGroupId] = useState(null)
  const [stats, setStats] = useState(null)

  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  async function loadAll() {
    setLoading(true)
    const [{ data: gr }, { data: st }, { data: ln }, { count: hwChecked }, { count: hwTotal }, { data: payments }] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
      supabase.from('student_groups').select('*'),
      supabase.from('homework').select('*', { count: 'exact', head: true }).eq('status', 'checked'),
      supabase.from('homework').select('*', { count: 'exact', head: true }),
      supabase.from('payments').select('amount'),
    ])
    setGroups(gr ?? [])
    setStudents(st ?? [])
    setLinks(ln ?? [])
    const revenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    setStats({ students: (st ?? []).length, hwChecked, hwTotal, revenue })
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

  async function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setSavingGroup(true)
    const { error } = await supabase.from('groups').insert({ name })
    setSavingGroup(false)
    if (error) {
      alert(error.message.includes('duplicate') ? 'Группа с таким названием уже есть' : 'Ошибка: ' + error.message)
      return
    }
    setNewGroupName('')
    setShowAddGroup(false)
    loadAll()
  }

  async function deleteGroup(group) {
    const memberCount = links.filter(l => l.group_id === group.id).length
    const msg = memberCount > 0
      ? `Удалить группу «${group.name}»? В ней ${memberCount} чел. Сами ученики останутся, но потеряют связь с этой группой.`
      : `Удалить группу «${group.name}»?`
    if (!confirm(msg)) return

    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) {
      alert('Ошибка: ' + error.message)
      return
    }
    setOpenGroupId(null)
    loadAll()
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Ещё</h1></header>

      <p className="eyebrow">Аналитика</p>
      {stats && (
        <div className="stat-row">
          <div className="stat-box"><span className="stat-num blue">{stats.students}</span><span className="stat-label">Учеников</span></div>
          <div className="stat-box"><span className="stat-num green">{stats.hwChecked}/{stats.hwTotal}</span><span className="stat-label">ДЗ проверено</span></div>
          <div className="stat-box"><span className="stat-num yellow">{stats.revenue.toLocaleString('ru-RU')} ₽</span><span className="stat-label">Всего получено</span></div>
        </div>
      )}

      <p className="eyebrow">Группы</p>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {groups.length === 0 && <p className="muted">Групп пока нет — создайте первую ниже</p>}
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
                    <button className="btn-secondary block" onClick={() => deleteGroup(g)}>🗑 Удалить группу</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!showAddGroup ? (
        <button className="btn-primary block" onClick={() => setShowAddGroup(true)}>+ Создать группу</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новая группа</p>
          <input
            className="text-input"
            placeholder="Название (напр. ЕГЭ 2027)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
          />
          <div className="btn-row">
            <button className="btn-primary" disabled={savingGroup} onClick={addGroup}>{savingGroup ? 'Сохранение…' : 'Создать'}</button>
            <button className="btn-secondary" onClick={() => { setShowAddGroup(false); setNewGroupName('') }}>Отмена</button>
          </div>
        </div>
      )}

      <section className="card">
        <p className="eyebrow">О приложении</p>
        <p className="muted">Korenkov School Mini App</p>
        <p className="muted small-text">Версия 2.3</p>
      </section>
    </div>
  )
}
