import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTopics } from '../components/TopicPicker'
import { AttachmentList } from '../components/FileUploader'
import { StudentTaskList } from '../components/TaskBank'

const num = (i) => String(i + 1).padStart(2, '0')

export default function Topics() {
  const { student } = useAuth()
  const { topics, subtopics } = useTopics()
  const [openTopic, setOpenTopic] = useState(null)
  const [openSub, setOpenSub] = useState(null)   // объект подтемы
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [groupIds, setGroupIds] = useState([])
  const [progressByTopic, setProgressByTopic] = useState({})

  useEffect(() => {
    if (!student) return
    supabase.from('student_groups').select('group_id').eq('student_id', student.id)
      .then(({ data }) => setGroupIds((data ?? []).map(g => g.group_id)))

    supabase.from('homework').select('topic_id, correct_tasks, total_tasks')
      .eq('student_id', student.id).eq('status', 'checked').not('topic_id', 'is', null)
      .then(({ data }) => {
        const map = {}
        ;(data ?? []).forEach(h => {
          if (!map[h.topic_id]) map[h.topic_id] = { c: 0, t: 0 }
          map[h.topic_id].c += h.correct_tasks || 0
          map[h.topic_id].t += h.total_tasks || 0
        })
        const pct = {}
        Object.entries(map).forEach(([id, v]) => { if (v.t > 0) pct[id] = Math.round(v.c / v.t * 100) })
        setProgressByTopic(pct)
      })
  }, [student])

  async function loadContent(topicId, subId) {
    setLoading(true)
    const scope = (q) => {
      const c = ['and(group_id.is.null,student_id.is.null)', `student_id.eq.${student.id}`]
      if (groupIds.length) c.push(`group_id.in.(${groupIds.join(',')})`)
      return q.or(c.join(','))
    }
    let hw = supabase.from('homework').select('*').eq('student_id', student.id).eq('topic_id', topicId)
    let mt = scope(supabase.from('materials').select('*').eq('topic_id', topicId))
    let ls = scope(supabase.from('lessons').select('*').eq('topic_id', topicId))
    if (subId) { hw = hw.eq('subtopic_id', subId); mt = mt.eq('subtopic_id', subId); ls = ls.eq('subtopic_id', subId) }
    else { hw = hw.is('subtopic_id', null); mt = mt.is('subtopic_id', null); ls = ls.is('subtopic_id', null) }
    const [{ data: h }, { data: m }, { data: l }] = await Promise.all([hw, mt, ls])
    setContent({ homework: h ?? [], materials: m ?? [], lessons: l ?? [] })
    setLoading(false)
  }

  function toggleTopic(t) {
    if (openTopic === t.id) { setOpenTopic(null); setOpenSub(null); setContent(null); return }
    setOpenTopic(t.id); setOpenSub(null); loadContent(t.id, null)
  }

  function openSubtopic(t, s) { setOpenSub(s); loadContent(t.id, s.id) }
  function backToTopic(t) { setOpenSub(null); loadContent(t.id, null) }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Номера ЕГЭ</h1></header>

      <ul className="card-list">
        {topics.length === 0 && <p className="muted">Номера пока не добавлены</p>}
        {topics.map(t => {
          const subs = subtopics.filter(s => s.topic_id === t.id)
          return (
            <li key={t.id} className="card">
              <div style={{ cursor: 'pointer' }} onClick={() => toggleTopic(t)}>
                <div className="row-between">
                  <p className="card-title">📁 {t.name}</p>
                  <span className="muted">{subs.length} тем {openTopic === t.id ? '▾' : '▸'}</span>
                </div>
                {progressByTopic[t.id] != null && (
                  <div className="progress-row">
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${progressByTopic[t.id]}%` }} /></div>
                    <span className="progress-pct">{progressByTopic[t.id]}%</span>
                  </div>
                )}
              </div>

              {openTopic === t.id && !openSub && (
                <div className="card-details">
                  {subs.length > 0 && <p className="eyebrow">Подтемы</p>}
                  {subs.map((s, i) => (
                    <button key={s.id} type="button" className="subtopic-row" onClick={() => openSubtopic(t, s)}>
                      <span className="subtopic-num">{num(i)}.</span>
                      <span className="subtopic-name">{s.name}</span>
                      <span className="muted">›</span>
                    </button>
                  ))}
                  {loading ? <p className="muted">Загрузка…</p> : <ContentBlocks content={content} emptyHidden />}
                </div>
              )}

              {openTopic === t.id && openSub && (
                <div className="card-details">
                  <button type="button" className="back-link" onClick={() => backToTopic(t)}>‹ {t.name}</button>
                  <h2 className="subtopic-title">
                    {num(subs.findIndex(x => x.id === openSub.id))}. {openSub.name}
                  </h2>
                  <StudentTaskList subtopicId={openSub.id} studentId={student?.id} />
                  {loading ? <p className="muted">Загрузка…</p> : <ContentBlocks content={content} emptyHidden />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ContentBlocks({ content, emptyHidden }) {
  if (!content) return null
  const { homework, materials, lessons } = content
  const empty = !materials.length && !lessons.length
  if (empty) return emptyHidden ? null : <p className="muted">Здесь пока пусто</p>

  const notes = materials.filter(m => m.type === 'note')
  const videos = materials.filter(m => m.type === 'video_review')
  const records = materials.filter(m => m.type === 'lesson_recording')

  return (
    <>
      {lessons.length > 0 && (
        <>
          <p className="eyebrow">Занятия</p>
          {lessons.map(l => (
            <div key={l.id} className="task-grade">
              <p className="card-title">{l.topic || l.title}</p>
              <p className="muted">{new Date(l.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
              <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                {l.meeting_url && <a href={l.meeting_url} target="_blank" rel="noreferrer" className="btn-secondary">🎥 Созвон</a>}
                {l.board_url && <a href={l.board_url} target="_blank" rel="noreferrer" className="btn-secondary">🖊 Доска</a>}
              </div>
              <AttachmentList items={l.notes_attachments} compact />
            </div>
          ))}
        </>
      )}
      <MaterialGroup title="Конспекты" list={notes} />
      <MaterialGroup title="Видео-разборы" list={videos} />
      <MaterialGroup title="Записи занятий" list={records} />
    </>
  )
}

function MaterialGroup({ title, list }) {
  if (!list.length) return null
  return (
    <>
      <p className="eyebrow">{title}</p>
      {list.map(m => {
        const links = m.video_urls?.length ? m.video_urls : (m.video_url ? [m.video_url] : [])
        return (
          <div key={m.id} className="task-grade">
            <p className="card-title">{m.title}</p>
            {links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noreferrer" className="link" style={{ display: 'block' }}>
                ▶ Ссылка {links.length > 1 ? i + 1 : ''}
              </a>
            ))}
            <AttachmentList items={m.attachments} />
          </div>
        )
      })}
    </>
  )
}
