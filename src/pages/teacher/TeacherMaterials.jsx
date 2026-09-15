import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFile, isImageFile } from '../../lib/storage'

const TYPE_LABELS = {
  video_review: '🎬 Видео-разбор ДЗ',
  lesson_recording: '📌 Запись занятия',
  note: '📄 Конспект',
}

export default function TeacherMaterials() {
  const [items, setItems] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [type, setType] = useState('video_review')
  const [videoMode, setVideoMode] = useState('upload') // 'upload' | 'link'
  const [form, setForm] = useState({ title: '', subject: '', group_id: '', video_url: '' })
  const [videoFile, setVideoFile] = useState(null)
  const [noteFile, setNoteFile] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: items }, { data: gr }] = await Promise.all([
      supabase.from('materials').select('*, groups(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('groups').select('*').order('name'),
    ])
    setItems(items ?? [])
    setGroups(gr ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function resetForm() {
    setForm({ title: '', subject: '', group_id: '', video_url: '' })
    setVideoFile(null)
    setNoteFile(null)
    setShowForm(false)
  }

  async function addMaterial() {
    if (!form.title) return
    setSaving(true)

    try {
      let video_url = null
      let file_url = null

      if (type === 'video_review' || type === 'lesson_recording') {
        if (videoMode === 'upload' && videoFile) {
          video_url = await uploadFile('materials', videoFile)
        } else {
          video_url = form.video_url || null
        }
      }

      if (type === 'note' && noteFile) {
        file_url = await uploadFile('materials', noteFile)
      }

      const { error } = await supabase.from('materials').insert({
        type,
        title: form.title,
        subject: form.subject || null,
        group_id: form.group_id || null,
        video_url,
        file_url,
      })

      if (error) throw error
      resetForm()
      loadAll()
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header"><h1>Материалы</h1></header>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => setShowForm(true)}>+ Добавить материал</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Новый материал</p>

          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <button key={key} className={'filter-chip' + (type === key ? ' active' : '')} onClick={() => setType(key)}>
                {label}
              </button>
            ))}
          </div>

          <input className="text-input" placeholder="Название" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="text-input" placeholder="Предмет (необязательно)" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <select className="text-input" value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
            <option value="">Для всех (без группы)</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {(type === 'video_review' || type === 'lesson_recording') && (
            <>
              <div className="btn-row">
                <button className={'filter-chip' + (videoMode === 'upload' ? ' active' : '')} onClick={() => setVideoMode('upload')}>📤 Загрузить видео</button>
                <button className={'filter-chip' + (videoMode === 'link' ? ' active' : '')} onClick={() => setVideoMode('link')}>🔗 Ссылка на видео</button>
              </div>
              {videoMode === 'upload' ? (
                <label className="file-drop">
                  🎬 {videoFile ? videoFile.name : 'Выбрать видео с телефона/компьютера'}
                  <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] ?? null)} hidden />
                </label>
              ) : (
                <input className="text-input" placeholder="Ссылка на видео (YouTube, Google Drive и т.д.)"
                  value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} />
              )}
            </>
          )}

          {type === 'note' && (
            <>
              <label className="file-drop">
                📄 {noteFile ? noteFile.name : 'Прикрепить конспект (PDF или фото)'}
                <input type="file" accept="image/*,.pdf" onChange={e => setNoteFile(e.target.files?.[0] ?? null)} hidden />
              </label>
              {noteFile && isImageFile(noteFile) && (
                <img src={URL.createObjectURL(noteFile)} alt="preview" className="file-preview-img" />
              )}
            </>
          )}

          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addMaterial}>{saving ? 'Загрузка…' : 'Сохранить'}</button>
            <button className="btn-secondary" onClick={resetForm}>Отмена</button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {items.length === 0 && <p className="muted">Материалов пока нет</p>}
          {items.map(m => (
            <li key={m.id} className="card">
              <p className="card-title">{TYPE_LABELS[m.type]} · {m.title}</p>
              <p className="muted">{m.groups ? m.groups.name : 'Для всех'} {m.subject ? `· ${m.subject}` : ''}</p>
              {m.video_url && <a href={m.video_url} target="_blank" rel="noreferrer" className="link">▶ Открыть видео</a>}
              {m.file_url && <a href={m.file_url} target="_blank" rel="noreferrer" className="link">📄 Открыть файл</a>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
