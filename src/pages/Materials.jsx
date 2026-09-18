import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AttachmentList } from '../components/FileUploader'

const TABS = [
  { key: 'all', label: 'Все' },
  { key: 'video_review', label: '🎬 Видео' },
  { key: 'note', label: '📄 Конспекты' },
  { key: 'lesson_recording', label: '📌 Записи' },
]

function fmtDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Materials() {
  const { student } = useAuth()
  const [items, setItems] = useState([])
  const [myGroups, setMyGroups] = useState([]) // [{id, name}]
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all') // 'all' | groupId

  useEffect(() => {
    if (!student) return
    let cancelled = false

    async function load() {
      const { data: groupLinks } = await supabase
        .from('student_groups')
        .select('group_id, groups(id, name)')
        .eq('student_id', student.id)
      const groups = (groupLinks ?? []).map(g => g.groups).filter(Boolean)
      const groupIds = groups.map(g => g.id)

      let query = supabase.from('materials').select('*').order('created_at', { ascending: false })
      if (groupIds.length > 0) query = query.or(`group_id.in.(${groupIds.join(',')}),group_id.is.null`)

      const { data } = await query
      if (!cancelled) {
        setMyGroups(groups)
        setItems(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [student])

  const byGroup = groupFilter === 'all' ? items : items.filter(m => m.group_id === groupFilter)
  const filtered = tab === 'all' ? byGroup : byGroup.filter(m => m.type === tab)
  const videos = filtered.filter(m => m.type === 'video_review')
  const recordings = filtered.filter(m => m.type === 'lesson_recording')
  const notes = filtered.filter(m => m.type === 'note')

  return (
    <div className="screen">
      <header className="screen-header"><h1>Материалы</h1></header>

      {myGroups.length > 1 && (
        <div className="filter-row">
          <button className={'filter-chip' + (groupFilter === 'all' ? ' active' : '')} onClick={() => setGroupFilter('all')}>
            Все группы
          </button>
          {myGroups.map(g => (
            <button key={g.id} className={'filter-chip' + (groupFilter === g.id ? ' active' : '')} onClick={() => setGroupFilter(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className="filter-row">
        {TABS.map(t => (
          <button key={t.key} className={'filter-chip' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : items.length === 0 ? (
        <p className="muted">Материалов пока нет</p>
      ) : filtered.length === 0 ? (
        <p className="muted">Ничего не найдено по этому фильтру</p>
      ) : (
        <>
          {videos.length > 0 && (
            <>
              <p className="eyebrow">Видео-разборы ДЗ</p>
              {videos.map(v => <VideoCard key={v.id} m={v} />)}
            </>
          )}
          {recordings.length > 0 && (
            <>
              <p className="eyebrow">Записи занятий</p>
              {recordings.map(v => <VideoCard key={v.id} m={v} />)}
            </>
          )}
          {notes.length > 0 && (
            <>
              <p className="eyebrow">Конспекты</p>
              <ul className="card-list">
                {notes.map(n => (
                  <li key={n.id} className="card">
                    <p className="card-title">{n.title}</p>
                    <p className="muted">{new Date(n.created_at).toLocaleDateString('ru-RU')}</p>
                    {n.file_url && <a className="link" href={n.file_url} target="_blank" rel="noreferrer">📄 Открыть файл</a>}
                    <AttachmentList items={n.attachments} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

function VideoCard({ m }) {
  if (!m.video_url && m.attachments?.length > 0) {
    return (
      <div className="card">
        <p className="card-title">{m.title}</p>
        <p className="muted">{new Date(m.created_at).toLocaleDateString('ru-RU')} {m.subject ? `· ${m.subject}` : ''}</p>
        <AttachmentList items={m.attachments} />
      </div>
    )
  }
  return (
    <a href={m.video_url || '#'} target="_blank" rel="noreferrer" className="card video-card">
      <div className="video-thumb">
        <span className="video-play">▶</span>
        {m.duration_seconds ? <span className="video-duration">{fmtDuration(m.duration_seconds)}</span> : null}
      </div>
      <p className="card-title">{m.title}</p>
      <p className="muted">{new Date(m.created_at).toLocaleDateString('ru-RU')} {m.subject ? `· ${m.subject}` : ''}</p>
    </a>
  )
}
