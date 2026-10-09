import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/storage'
import FileUploader, { AttachmentList, AttachmentEditor } from '../../components/FileUploader'
import { useDraft } from '../../context/DraftContext'
import TopicPicker, { useTopics } from '../../components/TopicPicker'

const TYPE_LABELS = { video_review: '🎬 Видео-разбор', lesson_recording: '📌 Запись занятия', note: '📄 Конспект' }

const EMPTY = {
  open: false, type: 'video_review', mode: 'all',
  groupIds: [], studentIds: [],
  title: '', subject: '', videoLinks: [], newLinkInput: '', files: [],
  topic_id: null, subtopic_id: null,
}

export default function TeacherMaterials() {
  const [draft, setDraft, clearDraft] = useDraft('teacher-materials', EMPTY)
  const { topics, subtopics } = useTopics()
  const [items, setItems] = useState([])
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [editId, setEditId] = useState(null)
  const [editAttach, setEditAttach] = useState([])
  const [editNewFiles, setEditNewFiles] = useState([])
  const [editVideoLinks, setEditVideoLinks] = useState([])
  const [editNewLinkInput, setEditNewLinkInput] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const up = (patch) => setDraft({ ...draft, ...patch })
  const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  async function loadAll() {
    setLoading(true)
    const [{ data: list }, { data: gr }, { data: st }] = await Promise.all([
      supabase.from('materials').select('*, groups(name), students(first_name,last_name), topics(name), subtopics(name)').order('created_at', { ascending: false }).limit(200),
      supabase.from('groups').select('*').order('name'),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
    ])
    setItems(list ?? []); setGroups(gr ?? []); setStudents(st ?? [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  async function addMaterial() {
    setError('')
    if (!draft.title.trim()) return setError('Укажите название')
    if (draft.files.length === 0 && draft.videoLinks.length === 0) return setError('Прикрепите файлы или добавьте хотя бы одну ссылку')
    if (draft.mode === 'groups' && draft.groupIds.length === 0) return setError('Выберите группы')
    if (draft.mode === 'students' && draft.studentIds.length === 0) return setError('Выберите учеников')

    setSaving(true)
    try {
      let attachments = []
      if (draft.files.length > 0) {
        attachments = await uploadFiles('materials', draft.files, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
      }
      setProgress('Сохранение…')

      const base = {
        type: draft.type, title: draft.title.trim(),
        subject: draft.subject || null,
        video_url: draft.videoLinks[0] || null,
        video_urls: draft.videoLinks,
        attachments,
        topic_id: draft.topic_id,
        subtopic_id: draft.subtopic_id,
      }
      let rows = []
      if (draft.mode === 'all') rows = [{ ...base, group_id: null, student_id: null }]
      else if (draft.mode === 'groups') rows = draft.groupIds.map(gid => ({ ...base, group_id: gid, student_id: null }))
      else rows = draft.studentIds.map(sid => ({ ...base, group_id: null, student_id: sid }))

      const { error: err } = await supabase.from('materials').insert(rows)
      if (err) throw err
      clearDraft(); loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally { setSaving(false); setProgress('') }
  }

  async function deleteMaterial(m) {
    if (!confirm(`Удалить «${m.title}»?`)) return
    await supabase.from('materials').delete().eq('id', m.id); loadAll()
  }

  async function saveAttach(m) {
    setEditSaving(true)
    try {
      let finalAttachments = editAttach
      if (editNewFiles.length > 0) {
        const uploaded = await uploadFiles('materials', editNewFiles, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
        finalAttachments = [...editAttach, ...uploaded]
      }
      await supabase.from('materials').update({
        attachments: finalAttachments,
        video_urls: editVideoLinks,
        video_url: editVideoLinks[0] || null,
      }).eq('id', m.id)
      setEditId(null); setEditNewFiles([]); setProgress('')
      loadAll()
    } catch (e) {
      setError('Ошибка при сохранении: ' + e.message)
    } finally {
      setEditSaving(false)
    }
  }

  const acceptFor = draft.type === 'note' ? 'image/*,.pdf,.doc,.docx' : 'video/*,image/*,.pdf'

  return (
    <div className="screen">
      <header className="screen-header"><h1>Материалы</h1></header>

      {!draft.open ? (
        <button className="btn-primary block" onClick={() => up({ open: true })}>+ Добавить материал</button>
      ) : (
        <div className="card">
          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABELS).map(([k, l]) => (
              <button key={k} className={'filter-chip' + (draft.type === k ? ' active' : '')} onClick={() => up({ type: k })}>{l}</button>
            ))}
          </div>

          <p className="eyebrow">Кому доступно</p>
          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            <button className={'filter-chip' + (draft.mode === 'all' ? ' active' : '')} onClick={() => up({ mode: 'all' })}>🌐 Всем</button>
            <button className={'filter-chip' + (draft.mode === 'groups' ? ' active' : '')} onClick={() => up({ mode: 'groups' })}>👥 Группам</button>
            <button className={'filter-chip' + (draft.mode === 'students' ? ' active' : '')} onClick={() => up({ mode: 'students' })}>👤 Ученикам</button>
          </div>

          {draft.mode === 'groups' && (
            <div className="pick-list">
              {groups.map(g => (
                <label key={g.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.groupIds.includes(g.id)} onChange={() => up({ groupIds: toggleIn(draft.groupIds, g.id) })} />
                  {g.name}
                </label>
              ))}
            </div>
          )}
          {draft.mode === 'students' && (
            <div className="pick-list">
              {students.map(s => (
                <label key={s.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.studentIds.includes(s.id)} onChange={() => up({ studentIds: toggleIn(draft.studentIds, s.id) })} />
                  {s.first_name} {s.last_name}
                </label>
              ))}
            </div>
          )}

          <p className="eyebrow">Папка (номер и тема)</p>
          <TopicPicker topics={topics} subtopics={subtopics}
            topicId={draft.topic_id} subtopicId={draft.subtopic_id} onChange={p => up(p)} />

          <input className="text-input" placeholder="Название" value={draft.title} onChange={e => up({ title: e.target.value })} />
          <input className="text-input" placeholder="Предмет (необязательно)" value={draft.subject} onChange={e => up({ subject: e.target.value })} />

          <FileUploader files={draft.files} onChange={f => up({ files: f })} accept={acceptFor}
            label={draft.type === 'note' ? 'Прикрепить конспекты' : 'Прикрепить видео и файлы'} />

          {draft.type !== 'note' && (
            <>
              <p className="eyebrow">Ссылки на видео</p>
              {draft.videoLinks.map((link, i) => (
                <div key={i} className="btn-row">
                  <input className="text-input" value={link} readOnly />
                  <button className="file-remove" onClick={() => up({ videoLinks: draft.videoLinks.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <div className="btn-row">
                <input className="text-input" placeholder="Вставьте ссылку и нажмите «Добавить»"
                  value={draft.newLinkInput} onChange={e => up({ newLinkInput: e.target.value })} />
                <button className="btn-secondary" onClick={() => {
                  const v = draft.newLinkInput.trim()
                  if (!v) return
                  up({ videoLinks: [...draft.videoLinks, v], newLinkInput: '' })
                }}>+ Добавить</button>
              </div>
            </>
          )}

          {error && <p className="error-text">⚠️ {error}</p>}
          {progress && <p className="muted">{progress}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addMaterial}>{saving ? 'Загрузка…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => up({ open: false })}>Свернуть</button>
            <button className="btn-secondary" onClick={clearDraft}>Очистить</button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {items.length === 0 && <p className="muted">Материалов пока нет</p>}
          {items.map(m => (
            <li key={m.id} className="card">
              <div className="row-between">
                <div>
                  <p className="card-title">{TYPE_LABELS[m.type] || ''} · {m.title}</p>
                  <p className="muted">
                    {m.students ? `👤 ${m.students.first_name} ${m.students.last_name || ''}` : m.groups ? `👥 ${m.groups.name}` : '🌐 Всем'}
                    {m.subject ? ` · ${m.subject}` : ''}
                  </p>
                  {m.topics && <p className="muted small-text">📁 {m.topics.name}{m.subtopics ? ` → ${m.subtopics.name}` : ''}</p>}
                </div>
                <button className="file-remove" onClick={() => deleteMaterial(m)}>✕</button>
              </div>
              {editId !== m.id && (() => {
                const links = (m.video_urls && m.video_urls.length > 0) ? m.video_urls : (m.video_url ? [m.video_url] : [])
                return links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noreferrer" className="link" style={{ display: 'block' }}>
                    ▶ Видео {links.length > 1 ? i + 1 : ''} по ссылке
                  </a>
                ))
              })()}
              {editId === m.id ? (
                <>
                  {m.type !== 'note' && (
                    <>
                      <p className="eyebrow">Ссылки на видео</p>
                      {editVideoLinks.map((link, i) => (
                        <div key={i} className="btn-row">
                          <input className="text-input" value={link} readOnly />
                          <button className="file-remove" onClick={() => setEditVideoLinks(editVideoLinks.filter((_, j) => j !== i))}>✕</button>
                        </div>
                      ))}
                      <div className="btn-row">
                        <input className="text-input" placeholder="Вставьте новую ссылку и нажмите «Добавить»"
                          value={editNewLinkInput} onChange={e => setEditNewLinkInput(e.target.value)} />
                        <button className="btn-secondary" onClick={() => {
                          const v = editNewLinkInput.trim()
                          if (!v) return
                          setEditVideoLinks([...editVideoLinks, v]); setEditNewLinkInput('')
                        }}>+ Добавить</button>
                      </div>
                    </>
                  )}
                  <p className="eyebrow">Текущие файлы (порядок / удаление)</p>
                  <AttachmentEditor items={editAttach} onChange={setEditAttach} />
                  <p className="eyebrow">Добавить ещё файлы</p>
                  <FileUploader files={editNewFiles} onChange={setEditNewFiles} accept="video/*,image/*,.pdf,.doc,.docx" label="Выбрать новые файлы" />
                  <div className="btn-row">
                    <button className="btn-primary" disabled={editSaving} onClick={() => saveAttach(m)}>{editSaving ? 'Сохранение…' : 'Сохранить'}</button>
                    <button className="btn-secondary" onClick={() => { setEditId(null); setEditNewFiles([]) }}>Отмена</button>
                  </div>
                </>
              ) : (
                <>
                  <AttachmentList items={m.attachments} />
                  {(m.attachments?.length > 0 || m.video_url || m.video_urls?.length > 0) &&
                    <button className="btn-secondary block" onClick={() => {
                      setEditId(m.id); setEditAttach(m.attachments); setEditNewFiles([])
                      const links = (m.video_urls && m.video_urls.length > 0) ? m.video_urls : (m.video_url ? [m.video_url] : [])
                      setEditVideoLinks(links); setEditNewLinkInput('')
                    }}>✏️ Изменить</button>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
