import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherHomework() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('homework').select('*, students(first_name,last_name)').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (!cancelled) { setItems(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  async function markChecked(hw) {
    await supabase.from('homework').update({ status: 'checked' }).eq('id', hw.id)
    setItems(prev => prev.map(x => x.id === hw.id ? { ...x, status: 'checked' } : x))
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Домашние задания</h1></header>
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
