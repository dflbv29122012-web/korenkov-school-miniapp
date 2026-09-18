import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTopics } from '../components/TopicPicker'
import { AttachmentList } from '../components/FileUploader'

// Экран ученика: папки по номерам ЕГЭ → темы → весь контент внутри
export default function Topics() {
  const { student } = useAuth()
  const { topics, subtopics } = useTopics()
  const [openTopic, setOpenTopic] = useState(null)
  const [openSub, setOpenSub] = useState(null)
  const [content, setContent] = useState({ homework: [], materials: [], lessons: [] })
  const [loading, setLoading] = useState(false)
  const [groupIds, setGroupIds] = useState([])

  useEffect(() => {
    if (!student) return
    supabase.from('student_groups').select('group_id').eq('student_id', student.id)
      .then(({ data }) => setGroupIds((data ?? []).map(g => g.group_id)))
  }, [student])

  async function loadContent(topicId, subId) {
    setLoading(true)
    const applyScope = (q, withStudentCol = true) => {
      const conds = ['and(group_id.is.null,student_id.is.null)']
      if (withStudentCol) conds.push(`student_id.eq.${student.id}`)
      if (groupIds.length > 0) conds.push(`group_id.in.(${groupIds.join(',')})`)
      return q.or(conds.join(','))
    }

    let hwQ = supabase.from('homework').select('*').eq('student_id', student.id).eq('topic_id', topicId)
    let mtQ = applyScope(supabase.from('materials').select('*').eq('topic_id', topicId))
    let lsQ = applyScope(supabase.from('lessons').select('*').eq('topic_id', topicId))

    if (subId) { hwQ = hwQ.eq('subtopic_id', subId); mtQ = mtQ.eq('subtopic_id', subId); lsQ = lsQ.eq('subtopic_id', subId) }

    const [{ data: hw }, { data: mt }, { data: ls }] = await Promise.all([hwQ, mtQ, lsQ])
    setContent({ homework: hw ?? [], materials: mt ?? [], lessons: ls ?? [] })
    setLoading(false)
  }

  function openTopicFolder(t) {
    const next = openTopic === t.id ? null : t.id
    setOpenTopic(next); setOpenSub(null)
    if (next) loadContent(t.id, null)
  }

  function openSubFolder(topicId, s) {
    const next = openSub === s.id ? null : s.id
    setOpenSub(next)
    loadContent(topicId, next)
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Номера ЕГЭ</h1></header>
      <p className="muted">Внутри каждого номера — темы, конспекты, записи занятий, видео-разборы и ДЗ.</p>

      <ul className="card-list">
        {topics.length === 0 && <p className="muted">Материалы по номерам пока не добавлены</p>}
        {topics.map(t => {
          const subs = subtopics.filter(s => s.topic_id === t.id)
          return (
            <li key={t.id} className="card">
              <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => openTopicFolder(t)}>
                <p className="card-title">📁 {t.name}</p>
                <span className="muted">{subs.length} тем</span>
              </div>

              {openTopic === t.id && (
                <div className="card-details">
                  <div className="filter-row">
                    <button className={'filter-chip' + (openSub === null ? ' active' : '')}
                      onClick={() => { setOpenSub(null); loadContent(t.id, null) }}>Всё по номеру</button>
                    {subs.map(s => (
                      <button key={s.id} className={'filter-chip' + (openSub === s.id ? ' active' : '')}
                        onClick={() => openSubFolder(t.id, s)}>{s.name}</button>
                    ))}
                  </div>

                  {loading ? <p className="muted">Загрузка…</p> : <ContentBlocks content={content} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ContentBlocks({ content }) {
  const { homework, materials, lessons } = content
  const notes = materials.filter(m => m.type === 'note')
  const videos = materials.filter(m => m.type === 'video_review')
  const records = materials.filter(m => m.type === 'lesson_recording')
  const empty = homework.length === 0 && materials.length === 0 && lessons.length === 0

  if (empty) return <p className="muted">Здесь пока пусто</p>

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
                {l.notes_url && <a href={l.notes_url} target="_blank" rel="noreferrer" className="btn-secondary">📄 Конспект</a>}
              </div>
            </div>
          ))}
        </>
      )}

      {homework.length > 0 && (
        <>
          <p className="eyebrow">Домашние задания</p>
          {homework.map(h => (
            <div key={h.id} className="task-grade">
              <div className="row-between">
                <span className="card-title">{h.title}</span>
                {h.status === 'checked' ? <span className="tag tag-green">{h.correct_tasks}/{h.total_tasks}</span>
                  : h.status === 'submitted' ? <span className="tag tag-blue">На проверке</span>
                  : <span className="tag tag-yellow">Не сдано</span>}
              </div>
              <AttachmentList items={h.attachments} compact />
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
  if (list.length === 0) return null
  return (
    <>
      <p className="eyebrow">{title}</p>
      {list.map(m => {
        const links = (m.video_urls && m.video_urls.length > 0) ? m.video_urls : (m.video_url ? [m.video_url] : [])
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
