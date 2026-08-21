// ==================== SCHEDULE ====================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function Schedule({ student, isTeacher }) {
  const [lessons, setLessons] = useState([])
  const [filter, setFilter] = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', scheduled_at: '', zoom_link: '', group_id: '' })
  const [groups, setGroups] = useState([])

  useEffect(() => { loadLessons() }, [filter])

  async function loadLessons() {
    let q = supabase.from('lessons').select('*, groups(name, subject)').order('scheduled_at')
    const now = new Date().toISOString()
    if (filter === 'upcoming') q = q.gte('scheduled_at', now)
    else q = q.lt('scheduled_at', now)
    const { data } = await q.limit(20)
    setLessons(data || [])
  }

  async function loadGroups() {
    const { data } = await supabase.from('groups').select('*')
    setGroups(data || [])
  }

  async function addLesson() {
    await supabase.from('lessons').insert(form)
    setShowForm(false)
    setForm({ title: '', scheduled_at: '', zoom_link: '', group_id: '' })
    loadLessons()
  }

  const fmt = (iso) => {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return { date: 'Сегодня', time }
    return { date: d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }), time }
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Расписание</div>
        {isTeacher && (
          <button onClick={() => { setShowForm(!showForm); loadGroups() }}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '6px 14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85em' }}>
            + Занятие
          </button>
        )}
      </div>

      {/* Форма добавления (учитель) */}
      {isTeacher && showForm && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Новое занятие</div>
          <div className="form-group">
            <label className="form-label">Тема</label>
            <input className="form-input" placeholder="Производная функции" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Группа</label>
            <select className="form-input" value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Выбери группу</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Дата и время</label>
            <input className="form-input" type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Ссылка Zoom (необязательно)</label>
            <input className="form-input" placeholder="https://zoom.us/j/..." value={form.zoom_link} onChange={e => setForm({ ...form, zoom_link: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={addLesson}>Добавить</button>
        </div>
      )}

      <div className="pill-tabs">
        <div className={`pill ${filter === 'upcoming' ? 'active' : ''}`} onClick={() => setFilter('upcoming')}>Предстоящие</div>
        <div className={`pill ${filter === 'past' ? 'active' : ''}`} onClick={() => setFilter('past')}>Прошедшие</div>
      </div>

      {lessons.length === 0 ? (
        <div className="empty"><div className="empty-icon">📅</div><div className="empty-text">Занятий нет</div></div>
      ) : lessons.map(lesson => {
        const { date, time } = fmt(lesson.scheduled_at)
        const isPast = new Date(lesson.scheduled_at) < new Date()
        return (
          <div key={lesson.id} className="list-item" style={{ opacity: isPast ? 0.65 : 1 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: isPast ? 'var(--muted)' : 'var(--green)', flexShrink: 0 }} />
            <div className="list-item-info">
              <div className="list-item-title">{lesson.title}</div>
              <div className="list-item-sub">{lesson.groups?.name} · {lesson.duration_minutes} мин</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.75em', color: 'var(--muted)' }}>
              {date}<br />{time}
              {lesson.recording_url && <div style={{ color: 'var(--accent)', marginTop: 2 }}>▶ Запись</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==================== HOMEWORK ====================
export function Homework({ student, isTeacher }) {
  const [hws, setHws] = useState([])
  const [results, setResults] = useState({})
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', due_date: '', max_score: 10, group_id: '' })
  const [groups, setGroups] = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    if (isTeacher) {
      const { data } = await supabase.from('homeworks').select('*, groups(name)').order('created_at', { ascending: false })
      setHws(data || [])
      const { data: g } = await supabase.from('groups').select('*')
      setGroups(g || [])
    } else {
      // Группы ученика
      const { data: sg } = await supabase.from('student_groups').select('group_id').eq('student_id', student.id)
      const gids = sg?.map(x => x.group_id) || []
      if (!gids.length) return

      const { data } = await supabase.from('homeworks').select('*, groups(name)').in('group_id', gids).order('created_at', { ascending: false })
      setHws(data || [])

      const { data: res } = await supabase.from('homework_results').select('*').eq('student_id', student.id)
      const map = {}
      res?.forEach(r => { map[r.homework_id] = r })
      setResults(map)
    }
  }

  async function addHomework() {
    await supabase.from('homeworks').insert({ ...form, max_score: parseInt(form.max_score) })
    setShowForm(false)
    loadData()
  }

  const filtered = filter === 'all' ? hws
    : filter === 'done' ? hws.filter(h => results[h.id]?.score != null)
    : hws.filter(h => !results[h.id])

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Домашние задания</div>
        {isTeacher && (
          <button onClick={() => setShowForm(!showForm)}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '6px 14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85em' }}>
            + ДЗ
          </button>
        )}
      </div>

      {isTeacher && showForm && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Новое ДЗ</div>
          <div className="form-group">
            <label className="form-label">Название</label>
            <input className="form-input" placeholder="Производная функции" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Группа</label>
            <select className="form-input" value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Выбери группу</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <input className="form-input" placeholder="Задачи 1-10 из учебника" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Срок сдачи</label>
            <input className="form-input" type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Максимальный балл</label>
            <input className="form-input" type="number" value={form.max_score} onChange={e => setForm({ ...form, max_score: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={addHomework}>Добавить</button>
        </div>
      )}

      {!isTeacher && (
        <div className="pill-tabs">
          <div className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Все</div>
          <div className={`pill ${filter === 'done' ? 'active' : ''}`} onClick={() => setFilter('done')}>Сдано ✅</div>
          <div className={`pill ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Не сдано ⏳</div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📝</div><div className="empty-text">Заданий нет</div></div>
      ) : filtered.map(hw => {
        const result = results[hw.id]
        const isDone = result?.score != null
        const isOverdue = hw.due_date && new Date(hw.due_date) < new Date() && !isDone
        return (
          <div key={hw.id} className="list-item">
            <div style={{ width: 20, height: 20, borderRadius: 6, background: isDone ? 'rgba(67,233,123,0.2)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8em', flexShrink: 0 }}>
              {isDone ? '✓' : ''}
            </div>
            <div className="list-item-info">
              <div className="list-item-title">{hw.title}</div>
              <div className="list-item-sub">{hw.groups?.name} · до {hw.due_date ? new Date(hw.due_date).toLocaleDateString('ru') : '—'}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.82em', fontWeight: 700 }}>
              {isDone ? <span style={{ color: 'var(--green)' }}>{result.score}/{hw.max_score}</span>
                : isOverdue ? <span style={{ color: 'var(--red)' }}>Просроч.</span>
                : <span style={{ color: 'var(--yellow)' }}>⏳</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==================== MATERIALS ====================
export function Materials({ student }) {
  const [materials, setMaterials] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadMaterials() }, [])

  async function loadMaterials() {
    const { data: sg } = await supabase.from('student_groups').select('group_id').eq('student_id', student.id)
    const gids = sg?.map(x => x.group_id) || []
    if (!gids.length) return
    const { data } = await supabase.from('materials').select('*, groups(name)').in('group_id', gids).order('created_at', { ascending: false })
    setMaterials(data || [])
  }

  const filtered = filter === 'all' ? materials : materials.filter(m => m.type === filter)

  return (
    <div>
      <div className="topbar"><div className="topbar-title">Материалы</div></div>
      <div className="pill-tabs">
        <div className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Все</div>
        <div className={`pill ${filter === 'video' ? 'active' : ''}`} onClick={() => setFilter('video')}>📹 Видео</div>
        <div className={`pill ${filter === 'pdf' ? 'active' : ''}`} onClick={() => setFilter('pdf')}>📄 Конспекты</div>
        <div className={`pill ${filter === 'recording' ? 'active' : ''}`} onClick={() => setFilter('recording')}>📌 Записи</div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📚</div><div className="empty-text">Материалов пока нет</div></div>
      ) : filtered.map(m => (
        <div key={m.id}>
          {(m.type === 'video' || m.type === 'recording') ? (
            <div className="card">
              <a href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div className="video-thumb"><div className="play-btn">▶</div></div>
                <div style={{ fontSize: '0.88em', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{m.title}</div>
                <div style={{ fontSize: '0.72em', color: 'var(--muted)' }}>{m.groups?.name} · {new Date(m.created_at).toLocaleDateString('ru')}</div>
              </a>
            </div>
          ) : (
            <a href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <div className="list-item">
                <div style={{ fontSize: '1.5em' }}>📄</div>
                <div className="list-item-info">
                  <div className="list-item-title">{m.title}</div>
                  <div className="list-item-sub">{m.groups?.name}</div>
                </div>
                <div style={{ fontSize: '0.75em', color: 'var(--accent)' }}>↓ PDF</div>
              </div>
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ==================== PAYMENT ====================
export function Payment({ student }) {
  const [payment, setPayment] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    const now = new Date()
    const { data: cur } = await supabase.from('payments').select('*')
      .eq('student_id', student.id)
      .eq('period_month', now.getMonth() + 1)
      .eq('period_year', now.getFullYear())
      .limit(1)
    setPayment(cur?.[0] || null)

    const { data: hist } = await supabase.from('payments').select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(6)
    setHistory(hist || [])
  }

  const isPaid = payment?.status === 'paid'

  return (
    <div>
      <div className="topbar"><div className="topbar-title">Оплата</div></div>

      <div className={`pay-card ${isPaid ? 'paid' : 'unpaid'}`}>
        <div className="pay-icon">{isPaid ? '✅' : '🔒'}</div>
        <div className="pay-title" style={{ color: isPaid ? 'var(--green)' : 'var(--red)' }}>
          {isPaid ? 'Доступ открыт' : 'Ожидается оплата'}
        </div>
        <div className="pay-sub">
          {isPaid ? `Оплачено до ${new Date(payment.due_date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}` : 'Оплатите занятия для продолжения доступа'}
        </div>
      </div>

      {!isPaid && (
        <div style={{ padding: '0 14px 14px' }}>
          <button className="btn btn-primary" onClick={() => alert('Для оплаты напишите учителю')}>
            💳 Оплатить занятия
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.75em', color: 'var(--muted)', marginTop: 8 }}>
            После оплаты доступ откроется автоматически
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="section-head">История платежей</div>
          {history.map(p => (
            <div key={p.id} className="list-item">
              <div style={{ fontSize: '1.3em' }}>💳</div>
              <div className="list-item-info">
                <div className="list-item-title">
                  {new Date(0, p.period_month - 1).toLocaleString('ru', { month: 'long' })} {p.period_year}
                </div>
                <div className="list-item-sub">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString('ru') : '—'}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.88em', color: p.status === 'paid' ? 'var(--green)' : 'var(--red)' }}>
                {p.amount.toLocaleString()} ₽
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ==================== LOCKED ====================
export function Locked({ student }) {
  return (
    <div className="locked-screen">
      <div className="locked-icon">🔒</div>
      <div className="locked-title">Доступ закрыт</div>
      <div className="locked-sub">
        Оплата за текущий месяц не поступила.<br />
        Все материалы, ДЗ и расписание недоступны.<br /><br />
        Оплатите занятия и напишите учителю — доступ откроется сразу.
      </div>
      <button className="btn btn-primary" style={{ maxWidth: 280 }} onClick={() => alert('Напишите учителю для оплаты')}>
        💳 Оплатить и получить доступ
      </button>
      <div style={{ fontSize: '0.75em', color: 'var(--muted)', marginTop: 12 }}>
        После оплаты доступ откроется автоматически
      </div>
    </div>
  )
}

// ==================== TEACHER PANEL ====================
export function TeacherPanel() {
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [tab, setTab] = useState('students')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [availableGroups, setAvailableGroups] = useState([])
  const [studentGroups, setStudentGroups] = useState([])
  const [scoreForm, setScoreForm] = useState({ hw_id: '', score: '' })
  const [homeworks, setHomeworks] = useState([])

  useEffect(() => { loadData() }, [tab])

  async function loadData() {
    const { data: s } = await supabase.from('students').select('*').order('created_at')
    setStudents(s || [])
    const { data: g } = await supabase.from('groups').select('*')
    setGroups(g || [])
    setAvailableGroups(g || [])
  }

  async function selectStudent(s) {
    setSelectedStudent(s)
    const { data } = await supabase.from('student_groups').select('group_id').eq('student_id', s.id)
    setStudentGroups(data?.map(x => x.group_id) || [])
    const { data: hws } = await supabase.from('homeworks').select('*, groups(name)').order('created_at', { ascending: false }).limit(20)
    setHomeworks(hws || [])
  }

  async function toggleAccess(s) {
    const newAccess = !s.access_granted
    await supabase.from('students').update({ access_granted: newAccess }).eq('id', s.id)
    loadData()
  }

  async function toggleGroup(groupId) {
    if (studentGroups.includes(groupId)) {
      await supabase.from('student_groups').delete().eq('student_id', selectedStudent.id).eq('group_id', groupId)
      setStudentGroups(prev => prev.filter(g => g !== groupId))
    } else {
      await supabase.from('student_groups').insert({ student_id: selectedStudent.id, group_id: groupId })
      setStudentGroups(prev => [...prev, groupId])
    }
  }

  async function addPayment(studentId) {
    const now = new Date()
    await supabase.from('payments').upsert({
      student_id: studentId,
      amount: 8000,
      period_month: now.getMonth() + 1,
      period_year: now.getFullYear(),
      paid_at: now.toISOString(),
      due_date: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      status: 'paid'
    })
    await supabase.from('students').update({ access_granted: true }).eq('id', studentId)
    loadData()
    alert('✅ Оплата отмечена, доступ открыт!')
  }

  async function submitScore() {
    if (!scoreForm.hw_id || !scoreForm.score || !selectedStudent) return
    await supabase.from('homework_results').upsert({
      homework_id: scoreForm.hw_id,
      student_id: selectedStudent.id,
      score: parseInt(scoreForm.score),
      checked_at: new Date().toISOString()
    })
    setScoreForm({ hw_id: '', score: '' })
    alert('✅ Оценка выставлена!')
  }

  const paid = students.filter(s => s.access_granted).length
  const debt = students.length - paid

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Панель учителя</div>
          <div className="topbar-sub">KorenkovSchool</div>
        </div>
        <span className="teacher-badge">Учитель</span>
      </div>

      {/* Статистика */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--accent)' }}>{students.length}</div>
          <div className="stat-label">Учеников</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{paid}</div>
          <div className="stat-label">Оплатили</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--red)' }}>{debt}</div>
          <div className="stat-label">Должники</div>
        </div>
      </div>

      <div className="pill-tabs">
        <div className={`pill ${tab === 'students' ? 'active' : ''}`} onClick={() => { setTab('students'); setSelectedStudent(null) }}>👥 Ученики</div>
        <div className={`pill ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>📚 Группы</div>
        <div className={`pill ${tab === 'debtors' ? 'active' : ''}`} onClick={() => setTab('debtors')}>💳 Должники</div>
        {selectedStudent && <div className={`pill ${tab === 'detail' ? 'active' : ''}`} onClick={() => setTab('detail')}>✏️ {selectedStudent.name.split(' ')[0]}</div>}
      </div>

      {/* УЧЕНИКИ */}
      {tab === 'students' && students.map(s => (
        <div key={s.id} className="list-item" onClick={() => { selectStudent(s); setTab('detail') }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85em', flexShrink: 0 }}>
            {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="list-item-info">
            <div className="list-item-title">{s.name}</div>
            <div className="list-item-sub">@{s.username || '—'} · ID: {s.telegram_id}</div>
          </div>
          <span className={`tag ${s.access_granted ? 'tag-green' : 'tag-red'}`}>
            {s.access_granted ? 'Доступ ✓' : '🔒 Закрыт'}
          </span>
        </div>
      ))}

      {/* ГРУППЫ */}
      {tab === 'groups' && (
        <div style={{ padding: '0 14px' }}>
          {groups.map(g => (
            <div key={g.id} className="card" style={{ marginBottom: 10 }}>
              <div className="row">
                <div>
                  <div style={{ fontWeight: 700 }}>{g.name}</div>
                  <div style={{ fontSize: '0.78em', color: 'var(--muted)', marginTop: 2 }}>{g.subject} · {g.description}</div>
                </div>
                <span className="tag tag-purple">📚</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ДОЛЖНИКИ */}
      {tab === 'debtors' && students.filter(s => !s.access_granted).map(s => (
        <div key={s.id} className="list-item">
          <div style={{ fontSize: '1.3em' }}>🔒</div>
          <div className="list-item-info">
            <div className="list-item-title">{s.name}</div>
            <div className="list-item-sub">@{s.username || '—'}</div>
          </div>
          <button onClick={() => addPayment(s.id)}
            style={{ background: 'var(--green)', border: 'none', borderRadius: 10, padding: '6px 12px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '0.78em', flexShrink: 0 }}>
            ✓ Оплачен
          </button>
        </div>
      ))}

      {/* ДЕТАЛИ УЧЕНИКА */}
      {tab === 'detail' && selectedStudent && (
        <div style={{ padding: '0 14px' }}>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>{selectedStudent.name}</div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>Telegram</span>
              <span style={{ fontSize: '0.85em' }}>@{selectedStudent.username || '—'}</span>
            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>ID</span>
              <span style={{ fontSize: '0.85em' }}>{selectedStudent.telegram_id}</span>
            </div>
            <div className="row" style={{ marginBottom: 16 }}>
              <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>Доступ</span>
              <span style={{ fontSize: '0.85em', color: selectedStudent.access_granted ? 'var(--green)' : 'var(--red)' }}>
                {selectedStudent.access_granted ? '✅ Открыт' : '🔒 Закрыт'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => addPayment(selectedStudent.id)}>✅ Отметить оплату</button>
              <button className={`btn ${selectedStudent.access_granted ? 'btn-danger' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => toggleAccess(selectedStudent)}>
                {selectedStudent.access_granted ? '🔒 Закрыть' : '🔓 Открыть'}
              </button>
            </div>
          </div>

          {/* Группы ученика */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Группы ученика</div>
            {availableGroups.map(g => (
              <div key={g.id} className="row" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: '0.88em' }}>{g.name}</span>
                <button onClick={() => toggleGroup(g.id)}
                  style={{ background: studentGroups.includes(g.id) ? 'rgba(67,233,123,0.2)' : 'var(--border)', border: 'none', borderRadius: 8, padding: '4px 12px', color: studentGroups.includes(g.id) ? 'var(--green)' : 'var(--muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8em' }}>
                  {studentGroups.includes(g.id) ? '✓ Добавлен' : '+ Добавить'}
                </button>
              </div>
            ))}
          </div>

          {/* Выставить оценку за ДЗ */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Выставить оценку за ДЗ</div>
            <div className="form-group">
              <label className="form-label">Задание</label>
              <select className="form-input" value={scoreForm.hw_id} onChange={e => setScoreForm({ ...scoreForm, hw_id: e.target.value })}>
                <option value="">Выбери ДЗ</option>
                {homeworks.map(h => <option key={h.id} value={h.id}>{h.title} ({h.groups?.name})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Баллов</label>
              <input className="form-input" type="number" placeholder="9" value={scoreForm.score} onChange={e => setScoreForm({ ...scoreForm, score: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={submitScore}>Сохранить оценку</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default { Schedule, Homework, Materials, Payment, Locked, TeacherPanel }
