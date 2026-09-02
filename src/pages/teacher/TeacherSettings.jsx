import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherSettings() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('groups').select('*').order('name')
      .then(({ data }) => { if (!cancelled) { setGroups(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="screen">
      <header className="screen-header"><h1>Настройки</h1></header>

      <p className="eyebrow">Группы</p>
      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {groups.map(g => (
            <li key={g.id} className="card">
              <p className="card-title">{g.name}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="card">
        <p className="eyebrow">О приложении</p>
        <p className="muted">Korenkov School Mini App</p>
        <p className="muted small-text">Версия 2.0</p>
      </section>
    </div>
  )
}
