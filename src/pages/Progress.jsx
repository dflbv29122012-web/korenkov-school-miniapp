import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadProgressData } from '../lib/progress'
import { ProgressView, RatingView } from '../components/ProgressView'
import MockHistory from '../components/MockHistory'
import GoalView from '../components/GoalView'
import { useSearchParams } from 'react-router-dom'

const TABS = [['nums', '📊 Номера'], ['goal', '🎯 Цель'], ['rating', '🏆 Рейтинг'], ['mocks', '📝 Пробники']]

export default function Progress() {
  const { student, refreshStudent } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'nums')
  const [raw, setRaw] = useState(null)
  const [students, setStudents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      loadProgressData(),
      supabase.from('students_public').select('id, first_name, last_name, is_teacher, is_parent, hide_in_rating'),
    ]).then(([r, { data }]) => { setRaw(r); setStudents(data ?? []) })
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="screen">
      <header className="screen-header"><h1>Мой прогресс</h1></header>
      <div className="chip-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} className={'filter-chip' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {error && <p className="error-text">⚠️ {error}</p>}
      {tab === 'mocks' ? <MockHistory studentId={student.id} />
        : !raw ? <p className="muted">Загрузка…</p>
        : tab === 'nums' ? <ProgressView raw={raw} studentId={student.id} />
        : tab === 'goal' ? <GoalView raw={raw} student={student} onSaved={refreshStudent} />
        : <RatingView raw={raw} students={students} meId={student.id} />}
    </div>
  )
}
