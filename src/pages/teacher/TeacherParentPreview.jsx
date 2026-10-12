import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ChildCabinet } from '../Parent'

// Учитель видит кабинет родителя так, как его видит родитель этого ученика
export default function TeacherParentPreview() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [child, setChild] = useState(null)
  useEffect(() => {
    supabase.from('students').select('*').eq('id', params.get('student')).maybeSingle().then(({ data }) => setChild(data))
  }, [params])

  return (
    <div className="screen">
      <section className="card preview-banner">
        <p className="card-title" style={{ margin: 0 }}>👁 Предпросмотр: так видит кабинет родитель</p>
        <p className="muted small-text">Это тот же экран, что у родителя, только вы заходите как учитель. Родитель ничего не может менять.</p>
        <button className="btn-secondary block" onClick={() => nav(-1)}>← Вернуться к ученикам</button>
      </section>
      <div className="home-header">
        <div><h1>Кабинет родителя</h1><p className="muted">Korenkov School</p></div>
        <div className="avatar-circle">👪</div>
      </div>
      {child ? <ChildCabinet child={child} /> : <p className="muted">Загрузка…</p>}
    </div>
  )
}
