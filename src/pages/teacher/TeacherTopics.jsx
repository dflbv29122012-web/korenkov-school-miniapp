import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTopics } from '../../components/TopicPicker'
import { AttachmentList } from '../../components/FileUploader'
import { TeacherTaskList } from '../../components/TaskBank'

export default function TeacherTopics() {
  const { topics, subtopics, reload } = useTopics()
  const [openId, setOpenId] = useState(null)          // раскрытый номер
  const [viewingSub, setViewingSub] = useState(null)   // {id, topicId} — просматриваемая тема (содержимое)
  const [content, setContent] = useState(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newSub, setNewSub] = useState({})
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  async function addTopic() {
    const name = newTopic.trim()
    if (!name) return
    await supabase.from('topics').insert({ name, position: topics.length + 1 })
    setNewTopic(''); reload()
  }

  async function addSub(topicId) {
    const name = (newSub[topicId] || '').trim()
    if (!name) return
    const count = subtopics.filter(s => s.topic_id === topicId).length
    await supabase.from('subtopics').insert({ topic_id: topicId, name, position: count + 1 })
    setNewSub({ ...newSub, [topicId]: '' }); reload()
  }

  async function del(table, id, label) {
    if (!confirm(`Удалить «${label}»? Материалы и ДЗ внутри останутся, но потеряют привязку.`)) return
    await supabase.from(table).delete().eq('id', id); reload()
  }

  async function saveRename() {
    if (!renaming || !renameValue.trim()) return setRenaming(null)
    await supabase.from(renaming.table).update({ name: renameValue.trim() }).eq('id', renaming.id)
    setRenaming(null); reload()
  }

  async function move(table, list, item, dir) {
    const idx = list.findIndex(x => x.id === item.id)
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    await supabase.from(table).update({ position: list[j].position }).eq('id', item.id)
    await supabase.from(table).update({ position: item.position }).eq('id', list[j].id)
    reload()
  }

  // Открываем тему целиком (без подтемы) — показываем всё, что привязано к номеру
  async function viewTopicContent(topicId) {
    if (viewingSub?.id === 'topic-' + topicId) { setViewingSub(null); setContent(null); return }
    setViewingSub({ id: 'topic-' + topicId, topicId })
    setLoadingContent(true)
    const [{ data: hw }, { data: mt }, { data: ls }] = await Promise.all([
      supabase.from('homework').select('*, students(first_name,last_name)').eq('topic_id', topicId).is('subtopic_id', null),
      supabase.from('materials').select('*').eq('topic_id', topicId).is('subtopic_id', null),
      supabase.from('lessons').select('*, students(first_name,last_name), groups(name)').eq('topic_id', topicId).is('subtopic_id', null),
    ])
    setContent({ homework: hw ?? [], materials: mt ?? [], lessons: ls ?? [] })
    setLoadingContent(false)
  }

  // Открываем конкретную подтему
  function viewSubContent(topicId, subId) {
    setViewingSub(viewingSub?.id === subId ? null : { id: subId, topicId })
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Номера и темы</h1></header>
      <p className="muted">Банк заданий: номер → подтемы → задания. Откройте подтему, чтобы добавить задания.</p>

      <div className="card">
        <p className="eyebrow">Новый номер</p>
        <div className="btn-row">
          <input className="text-input" placeholder="Напр. Номер 1" value={newTopic} onChange={e => setNewTopic(e.target.value)} />
          <button className="btn-primary" onClick={addTopic}>+ Создать</button>
        </div>
      </div>

      <ul className="card-list">
        {topics.length === 0 && <p className="muted">Номеров пока нет — создайте первый</p>}
        {topics.map(t => {
          const subs = subtopics.filter(s => s.topic_id === t.id)
          return (
            <li key={t.id} className="card">
              <div className="row-between">
                {renaming?.id === t.id ? (
                  <div className="btn-row" style={{ flex: 1 }}>
                    <input className="text-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} />
                    <button className="btn-primary" onClick={saveRename}>OK</button>
                  </div>
                ) : (
                  <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    <p className="card-title">📁 {t.name}</p>
                    <p className="muted">{subs.length} тем</p>
                  </div>
                )}
                <div className="row-center" style={{ gap: 4 }}>
                  <button className="file-move" onClick={() => move('topics', topics, t, -1)}>▲</button>
                  <button className="file-move" onClick={() => move('topics', topics, t, 1)}>▼</button>
                  <button className="file-move" onClick={() => { setRenaming({ table: 'topics', id: t.id }); setRenameValue(t.name) }}>✏️</button>
                  <button className="file-remove" onClick={() => del('topics', t.id, t.name)}>✕</button>
                </div>
              </div>

              {openId === t.id && (
                <div className="card-details">

                  <p className="eyebrow">Темы внутри</p>
                  {subs.length === 0 && <p className="muted">Тем пока нет</p>}
                  {subs.map((s, si) => (
                    <div key={s.id}>
                      <div className="file-row" style={{ cursor: 'pointer' }} onClick={() => viewSubContent(t.id, s.id)}>
                        {renaming?.id === s.id ? (
                          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, flex: 1 }}>
                            <input className="text-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} />
                            <button className="btn-primary" onClick={saveRename}>OK</button>
                          </div>
                        ) : (
                          <>
                            <span className="file-name">📄 {String(si + 1).padStart(2, '0')}. {s.name} {viewingSub?.id === s.id ? '▾' : '▸'}</span>
                            <button className="file-move" onClick={(e) => { e.stopPropagation(); move('subtopics', subs, s, -1) }}>▲</button>
                            <button className="file-move" onClick={(e) => { e.stopPropagation(); move('subtopics', subs, s, 1) }}>▼</button>
                            <button className="file-move" onClick={(e) => { e.stopPropagation(); setRenaming({ table: 'subtopics', id: s.id }); setRenameValue(s.name) }}>✏️</button>
                            <button className="file-remove" onClick={(e) => { e.stopPropagation(); del('subtopics', s.id, s.name) }}>✕</button>
                          </>
                        )}
                      </div>
                      {viewingSub?.id === s.id && (
                        <div className="subtopic-body">
                          <TeacherTaskList topicId={t.id} subtopicId={s.id} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="btn-row">
                    <input className="text-input" placeholder="Напр. Треугольники"
                      value={newSub[t.id] || ''} onChange={e => setNewSub({ ...newSub, [t.id]: e.target.value })} />
                    <button className="btn-secondary" onClick={() => addSub(t.id)}>+ Тема</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TopicContent({ content }) {
  if (!content) return null
  const { homework, materials, lessons } = content
  const empty = homework.length === 0 && materials.length === 0 && lessons.length === 0
  if (empty) return <p className="muted small-text">Сюда пока ничего не привязано.</p>

  return (
    <div className="task-grade">
      {lessons.length > 0 && (
        <>
          <p className="eyebrow">Занятия ({lessons.length})</p>
          {lessons.map(l => (
            <p key={l.id} className="muted small-text">
              {l.topic || l.title} — {l.students ? `${l.students.first_name} ${l.students.last_name || ''}` : l.groups ? l.groups.name : 'Всем'}
              {' · '}{new Date(l.starts_at).toLocaleDateString('ru-RU')}
            </p>
          ))}
        </>
      )}
      {homework.length > 0 && (
        <>
          <p className="eyebrow">ДЗ ({homework.length})</p>
          {homework.map(h => (
            <p key={h.id} className="muted small-text">
              {h.title} — {h.students ? `${h.students.first_name} ${h.students.last_name || ''}` : ''}
              {' · '}{h.status === 'checked' ? `${h.correct_tasks}/${h.total_tasks}` : h.status === 'submitted' ? 'на проверке' : 'не сдано'}
            </p>
          ))}
        </>
      )}
      {materials.length > 0 && (
        <>
          <p className="eyebrow">Материалы ({materials.length})</p>
          {materials.map(m => (
            <div key={m.id} style={{ marginBottom: 6 }}>
              <p className="muted small-text">{m.title}</p>
              <AttachmentList items={m.attachments} compact />
            </div>
          ))}
        </>
      )}
    </div>
  )
}
