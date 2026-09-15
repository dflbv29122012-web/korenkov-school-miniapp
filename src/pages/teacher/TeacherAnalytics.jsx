import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TeacherAnalytics() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ count: students }, { count: hwChecked }, { count: hwTotal }, { data: payments }] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_teacher', false),
        supabase.from('homework').select('*', { count: 'exact', head: true }).eq('status', 'checked'),
        supabase.from('homework').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('amount'),
      ])
      const revenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      if (!cancelled) setStats({ students, hwChecked, hwTotal, revenue })
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="screen">
      <header className="screen-header"><h1>Аналитика</h1></header>
      {!stats ? <p className="muted">Загрузка…</p> : (
        <div className="stat-row">
          <div className="stat-box"><span className="stat-num blue">{stats.students}</span><span className="stat-label">Учеников</span></div>
          <div className="stat-box"><span className="stat-num green">{stats.hwChecked}/{stats.hwTotal}</span><span className="stat-label">ДЗ проверено</span></div>
          <div className="stat-box"><span className="stat-num yellow">{stats.revenue.toLocaleString('ru-RU')} ₽</span><span className="stat-label">Всего получено</span></div>
        </div>
      )}
    </div>
  )
}
