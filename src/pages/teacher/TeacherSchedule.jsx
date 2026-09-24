import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDraft } from '../../context/DraftContext'
import TopicPicker, { useTopics } from '../../components/TopicPicker'
import Calendar from '../../components/Calendar'
import FileUploader, { AttachmentList, AttachmentEditor } from '../../components/FileUploader'
import { uploadFiles } from '../../lib/storage'

const EMPTY = {
  open: false, mode: 'students', studentIds: [], groupIds: [],
  subject: '', topic: '', date: '', time: '', duration_minutes: 60,
  meeting_url: '', board_url: '', notesFiles: [],
  topic_id: null, subtopic_id: null,
}

export default function TeacherSchedule() {
  const [draft, setDraft, clearDraft] = useDraft('teacher-schedule', EMPTY)
  const { topics, subtopics } = useTopics()
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [editNotesId, setEditNotesId] = useState(null)
  const [editNotes, setEditNotes] = useState([])
  const [editNewFiles, setEditNewFiles] = useState([])

  const up = (patch) => setDraft({ ...draft, ...patch })
  const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  async function loadAll() {
    setLoading(true)
    const [{ data: ls }, { data: st }, { data: gr }, { data: ln }] = await Promise.all([
      supabase.from('lessons').select('*, students(first_name,last_name), groups(name), topics(name), subtopics(name)').order('starts_at', { ascending: false }).limit(200),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).order('first_name'),
      supabase.from('groups').select('*').order('name'),
      supabase.from('student_groups').select('*'),
    ])
    setLessons(ls ?? []); setStudents(st ?? []); setGroups(gr ?? []); setLinks(ln ?? [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  async function addLesson() {
    setError('')
    if (!draft.date) return setError('Укажите дату')
    if (!draft.time) return setError('Укажите время')

    const startsAt = new Date(`${draft.date}T${draft.time}:00`)
    if (isNaN(startsAt.getTime())) return setError('Неверный формат даты или времени')

    const base = {
      subject: draft.subject || null,
      topic: draft.topic || null,
      title: draft.topic || draft.subject || 'Занятие',
      starts_at: startsAt.toISOString(),
      duration_minutes: Number(draft.duration_minutes) || 60,
      meeting_url: draft.meeting_url.trim() || null,
      board_url: draft.board_url.trim() || null,
      topic_id: draft.topic_id, subtopic_id: draft.subtopic_id,
    }

    let rows = []
    if (draft.mode === 'all') {
      rows = [{ ...base, student_id: null, group_id: null, for_all: true }]
    } else if (draft.mode === 'groups') {
      if (draft.groupIds.length === 0) return setError('Выберите хотя бы одну группу')
      rows = draft.groupIds.map(gid => ({ ...base, group_id: gid, student_id: null }))
    } else {
      if (draft.studentIds.length === 0) return setError('Выберите хотя бы одного ученика')
      rows = draft.studentIds.map(sid => ({ ...base, student_id: sid, group_id: null }))
    }

    setSaving(true)
    try {
      let notes = []
      if (draft.notesFiles.length > 0) {
        notes = await uploadFiles('materials', draft.notesFiles, (i, n) => setProgress(`Загрузка конспекта ${i} из ${n}…`))
      }
      const { error: err } = await supabase.from('lessons').insert(rows.map(r => ({ ...r, notes_attachments: notes })))
      if (err) throw err
      clearDraft(); loadAll()
    } catch (e) {
      setError('Не удалось сохранить: ' + e.message)
    } finally { setSaving(false); setProgress('') }
  }

  async function saveNotes(l) {
    setSaving(true)
    try {
      let added = []
      if (editNewFiles.length > 0) added = await uploadFiles('materials', editNewFiles, (i, n) => setProgress(`Загрузка ${i} из ${n}…`))
      await supabase.from('lessons').update({ notes_attachments: [...editNotes, ...added] }).eq('id', l.id)
      setEditNotesId(null); setEditNewFiles([]); loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally { setSaving(false); setProgress('') }
  }

  async function deleteLesson(l) {
    if (!confirm(`Удалить занятие «${l.topic || l.title}»?`)) return
    await supabase.from('lessons').delete().eq('id', l.id); loadAll()
  }

  const shownLessons = (selectedDay
    ? lessons.filter(l => new Date(l.starts_at).toDateString() === selectedDay)
    : lessons
  ).slice().sort((a, b) => selectedDay ? new Date(a.starts_at) - new Date(b.starts_at) : 0)

  const targetCount = draft.mode === 'all' ? students.length
    : draft.mode === 'groups' ? new Set(links.filter(l => draft.groupIds.includes(l.group_id)).map(l => l.student_id)).size
    : draft.studentIds.length

  return (
    <div className="screen">
      <header className="screen-header"><h1>Расписание занятий</h1></header>

      {!draft.open ? (
        <button className="btn-primary block" onClick={() => up({ open: true })}>+ Добавить занятие</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Кому занятие</p>
          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            <button className={'filter-chip' + (draft.mode === 'students' ? ' active' : '')} onClick={() => up({ mode: 'students' })}>👤 Ученики</button>
            <button className={'filter-chip' + (draft.mode === 'groups' ? ' active' : '')} onClick={() => up({ mode: 'groups' })}>👥 Группы</button>
            <button className={'filter-chip' + (draft.mode === 'all' ? ' active' : '')} onClick={() => up({ mode: 'all' })}>🌐 Всем</button>
          </div>

          {draft.mode === 'students' && (
            <div className="pick-list">
              {students.map(s => (
                <label key={s.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.studentIds.includes(s.id)}
                    onChange={() => up({ studentIds: toggleIn(draft.studentIds, s.id) })} />
                  {s.first_name} {s.last_name}
                </label>
              ))}
            </div>
          )}
          {draft.mode === 'groups' && (
            <div className="pick-list">
              {groups.map(g => (
                <label key={g.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.groupIds.includes(g.id)}
                    onChange={() => up({ groupIds: toggleIn(draft.groupIds, g.id) })} />
                  {g.name} <span className="muted">({links.filter(l => l.group_id === g.id).length} чел.)</span>
                </label>
              ))}
            </div>
          )}
          <p className="muted small-text">Получателей: {targetCount}</p>

          <p className="eyebrow">Папка (номер и тема)</p>
          <TopicPicker topics={topics} subtopics={subtopics}
            topicId={draft.topic_id} subtopicId={draft.subtopic_id}
            onChange={p => up(p)} />

          <input className="text-input" placeholder="Предмет (напр. Алгебра)" value={draft.subject} onChange={e => up({ subject: e.target.value })} />
          <input className="text-input" placeholder="Тема занятия" value={draft.topic} onChange={e => up({ topic: e.target.value })} />
          <div className="btn-row">
            <input type="date" className="text-input" value={draft.date} onChange={e => up({ date: e.target.value })} />
            <input type="time" className="text-input" value={draft.time} onChange={e => up({ time: e.target.value })} />
          </div>
          <input type="number" className="text-input" placeholder="Длительность (мин)" value={draft.duration_minutes} onChange={e => up({ duration_minutes: e.target.value })} />

          <p className="eyebrow">Ссылки</p>
          <input className="text-input" placeholder="🎥 Ссылка на созвон (Zoom, Meet…)" value={draft.meeting_url} onChange={e => up({ meeting_url: e.target.value })} />
          <input className="text-input" placeholder="🖊 Ссылка на доску (Miro, Excalidraw…)" value={draft.board_url} onChange={e => up({ board_url: e.target.value })} />
          <p className="eyebrow">Конспект</p>
          <FileUploader files={draft.notesFiles} onChange={f => up({ notesFiles: f })}
            accept="image/*,.pdf,.doc,.docx" label="Прикрепить файлы конспекта" />

          {error && <p className="error-text">⚠️ {error}</p>}
          {progress && <p className="muted">{progress}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addLesson}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={() => up({ open: false })}>Свернуть</button>
            <button className="btn-secondary" onClick={clearDraft}>Очистить</button>
          </div>
        </div>
      )}

      <Calendar dates={new Set(lessons.map(l => new Date(l.starts_at).toDateString()))}
        selected={selectedDay} onSelect={setSelectedDay} />
      {selectedDay && <p className="eyebrow">Занятия на {new Date(selectedDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {shownLessons.length === 0 && <p className="muted">{selectedDay ? 'В этот день занятий нет.' : 'Занятий пока не добавлено.'}</p>}
          {shownLessons.map(l => (
            <li key={l.id} className="card">
              <div className="row-between">
                <div>
                  <p className="card-title">{l.topic || l.title}</p>
                  <p className="muted">
                    {l.for_all ? '🌐 Всем' : l.groups ? `👥 ${l.groups.name}` : l.students ? `👤 ${l.students.first_name} ${l.students.last_name || ''}` : '—'}
                    {l.subject ? ` · ${l.subject}` : ''}
                  </p>
                  {l.topics && <p className="muted small-text">📁 {l.topics.name}{l.subtopics ? ` → ${l.subtopics.name}` : ''}</p>}
                </div>
                <div className="row-center" style={{ gap: 8 }}>
                  <p className="muted small-text" style={{ textAlign: 'right' }}>
                    {new Date(l.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    <br />{new Date(l.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <button className="file-remove" onClick={() => deleteLesson(l)}>✕</button>
                </div>
              </div>
              {(l.meeting_url || l.board_url) && (
                <div className="btn-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  {l.meeting_url && <a href={l.meeting_url} target="_blank" rel="noreferrer" className="btn-secondary">🎥 Созвон</a>}
                  {l.board_url && <a href={l.board_url} target="_blank" rel="noreferrer" className="btn-secondary">🖊 Доска</a>}
                </div>
              )}
              {editNotesId === l.id ? (
                <>
                  <p className="eyebrow">Конспект</p>
                  <AttachmentEditor items={editNotes} onChange={setEditNotes} />
                  <FileUploader files={editNewFiles} onChange={setEditNewFiles} accept="image/*,.pdf,.doc,.docx" label="Добавить файлы конспекта" />
                  {progress && <p className="muted">{progress}</p>}
                  <div className="btn-row">
                    <button className="btn-primary" disabled={saving} onClick={() => saveNotes(l)}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
                    <button className="btn-secondary" onClick={() => { setEditNotesId(null); setEditNewFiles([]) }}>Отмена</button>
                  </div>
                </>
              ) : (
                <>
                  {l.notes_attachments?.length > 0 && <p className="eyebrow">Конспект</p>}
                  <AttachmentList items={l.notes_attachments} compact />
                  <button className="btn-secondary block" onClick={() => { setEditNotesId(l.id); setEditNotes(l.notes_attachments || []); setEditNewFiles([]) }}>
                    📎 {l.notes_attachments?.length > 0 ? 'Изменить конспект' : 'Добавить конспект'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
