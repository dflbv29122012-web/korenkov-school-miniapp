import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/storage'
import FileUploader, { AttachmentList } from '../../components/FileUploader'

const TYPE_LABELS = {
  video_review: '🎬 Видео-разбор',
  lesson_recording: '📌 Запись занятия',
  note: '📄 Конспект',
}

export default function TeacherMaterials() {
  const [items, setItems] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  const [type, setType] = useState('video_review')
  const [form, setForm] = useState({ title: '', subject: '', group_id: '', video_url: '' })
  const [files, setFiles] = useState([])

  async function loadAll() {
    setLoading(true)
    const [{ data: list }, { data: gr }] = await Promise.all([
      supabase.from('materials').select('*, groups(name)').order('created_at', { ascending: false }).limit(200),
      supabase.from('groups').select('*').order('name'),
    ])
    setItems(list ?? [])
    setGroups(gr ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function resetForm() {
    setForm({ title: '', subject: '', group_id: '', video_url: '' })
    setFiles([])
    setShowForm(false)
    setError('')
  }

  async function addMaterial() {
    setError('')
    if (!form.title.trim()) return setError('Укажите название')
    if (files.length === 0 && !form.video_url.trim()) {
      return setError('Прикрепите файлы или вставьте ссылку на видео')
    }

    setSaving(true)
    try {
      let attachments = []
      if (files.length > 0) {
        attachments = await uploadFiles('materials', files, (i, total) => setProgress(`Загрузка ${i} из ${total}…`))
      }
      setProgress('Сохранение…')

      const { error: err } = await supabase.from('materials').insert({
        type,
        title: form.title.trim(),
        subject: form.subject || null,
        group_id: form.group_id || null,
        video_url: form.video_url.trim() || null,
        attachments,
      })
      if (err) throw err

      resetForm()
      loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  async function deleteMaterial(m) {
    if (!confirm(`Удалить «${m.title}»?`)) return
    await supabase.from('materials').delete().eq('id', m.id)
    loadAll()
  }

  const acceptFor = type === 'note' ? 'image/*,.pdf,.doc,.docx' : 'video/*,image/*,.pdf'

  return (
    <div className="screen">
      <header className="screen-header"><h1>Материалы</h1></header>

      {!showForm ? (
        <button className="btn-primary block" onClick={() => { setShowForm(true); setError('') }}>+ Добавить материал</button>
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

          <FileUploader
            files={files}
            onChange={setFiles}
            accept={acceptFor}
            label={type === 'note' ? 'Прикрепить конспекты (фото/PDF)' : 'Прикрепить видео и файлы'}
          />

          {type !== 'note' && (
            <input className="text-input" placeholder="Или ссылка на видео (YouTube и т.д.)"
              value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} />
          )}

          {error && <p className="error-text">⚠️ {error}</p>}
          {progress && <p className="muted">{progress}</p>}

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
              <div className="row-between">
                <div>
                  <p className="card-title">{TYPE_LABELS[m.type]} · {m.title}</p>
                  <p className="muted">{m.groups ? m.groups.name : 'Для всех'} {m.subject ? `· ${m.subject}` : ''}</p>
                </div>
                <button className="file-remove" onClick={() => deleteMaterial(m)}>✕</button>
              </div>
              {m.video_url && <a href={m.video_url} target="_blank" rel="noreferrer" className="link">▶ Открыть видео по ссылке</a>}
              <AttachmentList items={m.attachments} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
