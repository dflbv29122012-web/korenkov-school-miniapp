import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home({ student, setPage }) {
  const [nextLesson, setNextLesson] = useState(null)
  const [lastHw, setLastHw] = useState(null)
  const [groups, setGroups] = useState([])
  const [stats, setStats] = useState({ lessons: 0, hw_done: 0, avg_score: 0 })

  useEffect(() => {
    if (student?.id) loadData()
  }, [student])

  async function loadData() {
    // Группы ученика
    const { data: sg } = await supabase
      .from('student_groups')
      .select('groups(*)')
      .eq('student_id', student.id)
    setGroups(sg?.map(x => x.groups) || [])

    const groupIds = sg?.map(x => x.group_id) || []

    // Следующее занятие
    if (groupIds.length) {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('*')
        .in('group_id', groupIds)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at')
        .limit(1)
      setNextLesson(lessons?.[0] || null)
    }

    // Последнее ДЗ
    const { data: hws } = await supabase
      .from('homework_results')
      .select('*, homeworks(title, max_score)')
      .eq('student_id', student.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
    setLastHw(hws?.[0] || null)

    // Статистика
    const { count: lessonCount } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .in('group_id', groupIds)
      .lte('scheduled_at', new Date().toISOString())

    const { data: allHw } = await supabase
      .from('homework_results')
      .select('score, homeworks(max_score)')
      .eq('student_id', student.id)
      .not('score', 'is', null)

    const avgScore = allHw?.length
      ? Math.round(allHw.reduce((s, h) => s + (h.score / h.homeworks.max_score * 100), 0) / allHw.length)
      : 0

    setStats({
      lessons: lessonCount || 0,
      hw_done: allHw?.length || 0,
      avg_score: avgScore
    })
  }

  const initials = student?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'У'

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `Сегодня, ${time}`
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' }) + `, ${time}`
  }

  return (
    <div>
      {/* TOPBAR */}
      <div className="topbar">
        <div>
          <div className="topbar-title">Привет, {student?.name?.split(' ')[0]} 👋</div>
          <div className="topbar-sub">
            {groups.length ? groups.map(g => g.name).join(' · ') : 'Загрузка...'}
          </div>
        </div>
        <div className="avatar">{initials}</div>
      </div>

      {/* СЛЕДУЮЩЕЕ ЗАНЯТИЕ */}
      {nextLesson ? (
        <div className="card card-hero">
          <div style={{ fontSize: '0.7em', color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Следующее занятие
          </div>
          <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 4 }}>{nextLesson.title}</div>
          <div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.6)' }}>
            📅 {formatDate(nextLesson.scheduled_at)} · {nextLesson.duration_minutes} мин
          </div>
          {nextLesson.zoom_link && (
            <a href={nextLesson.zoom_link} style={{ display: 'inline-block', marginTop: 12, background: 'rgba(108,99,255,0.35)', borderRadius: 10, padding: '8px 16px', fontSize: '0.8em', fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
              📹 Подключиться
            </a>
          )}
        </div>
      ) : (
        <div className="card card-hero" style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.5)' }}>Занятий не запланировано</div>
        </div>
      )}

      {/* СТАТИСТИКА */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{stats.lessons}</div>
          <div className="stat-label">Занятий<br />пройдено</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--yellow)' }}>{stats.hw_done}</div>
          <div className="stat-label">ДЗ<br />сдано</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--accent)' }}>{stats.avg_score}%</div>
          <div className="stat-label">Средний<br />балл</div>
        </div>
      </div>

      {/* МОИ ГРУППЫ */}
      {groups.length > 0 && (
        <>
          <div className="section-head">Мои группы</div>
          <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groups.map(g => (
              <span key={g.id} className="group-badge">📚 {g.name}</span>
            ))}
          </div>
        </>
      )}

      {/* ПОСЛЕДНЕЕ ДЗ */}
      {lastHw && (
        <>
          <div className="section-head">Последнее ДЗ</div>
          <div className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.88em', fontWeight: 600 }}>{lastHw.homeworks?.title}</div>
              <span className="tag tag-green">Проверено</span>
            </div>
            <div style={{ fontSize: '0.78em', color: 'var(--muted)', marginBottom: 12 }}>
              Сдано {new Date(lastHw.submitted_at).toLocaleDateString('ru')}
            </div>
            <div className="row">
              <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>Результат</div>
              <div style={{ fontSize: '1.6em', fontWeight: 800, color: 'var(--green)' }}>
                {lastHw.score}/{lastHw.homeworks?.max_score}
              </div>
            </div>
          </div>
        </>
      )}

      {/* БЫСТРЫЕ ССЫЛКИ */}
      <div className="section-head">Быстрый доступ</div>
      <div style={{ padding: '0 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { icon: '📝', label: 'ДЗ', page: 'homework' },
          { icon: '📅', label: 'Расписание', page: 'schedule' },
          { icon: '📚', label: 'Материалы', page: 'materials' },
          { icon: '💳', label: 'Оплата', page: 'payment' },
        ].map(item => (
          <button key={item.page} onClick={() => setPage(item.page)}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 12px', cursor: 'pointer', color: 'var(--text)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5em', marginBottom: 4 }}>{item.icon}</div>
            <div style={{ fontSize: '0.8em', fontWeight: 600 }}>{item.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
