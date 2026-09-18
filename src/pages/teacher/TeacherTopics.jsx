import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTopics } from '../../components/TopicPicker'

export default function TeacherTopics() {
  const { topics, subtopics, reload } = useTopics()
  const [openId, setOpenId] = useState(null)
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

  return (
    <div className="screen">
      <header className="screen-header"><h1>Номера и темы</h1></header>
      <p className="muted">Папки по номерам ЕГЭ. Внутри — темы занятий. Занятия, ДЗ и материалы можно привязывать к ним.</p>

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
                  {subs.map(s => (
                    <div key={s.id} className="file-row">
                      {renaming?.id === s.id ? (
                        <>
                          <input className="text-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} />
                          <button className="btn-primary" onClick={saveRename}>OK</button>
                        </>
                      ) : (
                        <>
                          <span className="file-name">📄 {s.name}</span>
                          <button className="file-move" onClick={() => move('subtopics', subs, s, -1)}>▲</button>
                          <button className="file-move" onClick={() => move('subtopics', subs, s, 1)}>▼</button>
                          <button className="file-move" onClick={() => { setRenaming({ table: 'subtopics', id: s.id }); setRenameValue(s.name) }}>✏️</button>
                          <button className="file-remove" onClick={() => del('subtopics', s.id, s.name)}>✕</button>
                        </>
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
