import { useState } from 'react'
import { safeUrl, isSafeUrl } from '../lib/safeUrl'
import FileUploader, { AttachmentList } from './FileUploader'
import { uploadFiles } from '../lib/storage'

// Список записей занятия: ссылки — кнопками, видеофайлы — плеером
export function RecordingList({ items }) {
  const list = items || []
  if (!list.length) return null
  const links = list.filter(r => r.kind === 'link')
  const files = list.filter(r => r.kind !== 'link')
  return (
    <div className="recordings">
      <p className="eyebrow">🎬 Запись занятия</p>
      {links.length > 0 && (
        <div className="btn-row" style={{ flexWrap: 'wrap' }}>
          {links.map((r, i) => (
            <a key={i} href={safeUrl(r.url)} target="_blank" rel="noreferrer" className="btn-secondary">▶ {r.name || (links.length > 1 ? `Запись ${i + 1}` : 'Смотреть запись')}</a>
          ))}
        </div>
      )}
      <AttachmentList items={files} compact />
    </div>
  )
}

// Редактор записей: вставить ссылку (YouTube, VK, Яндекс Диск…) и/или загрузить видео
export function RecordingEditor({ items, onSave, onCancel }) {
  const [list, setList] = useState(items || [])
  const [link, setLink] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  function addLink() {
    const url = link.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) return setError('Ссылка должна начинаться с http:// или https://')
    setList([...list, { url, name: '', kind: 'link' }]); setLink(''); setError('')
  }
  async function save() {
    setBusy(true); setError('')
    try {
      let all = [...list]
      const pending = link.trim()
      if (pending && /^https?:\/\//i.test(pending)) all.push({ url: pending, name: '', kind: 'link' })
      if (files.length) all = [...all, ...(await uploadFiles('materials', files, (i, n) => setProgress(`Загрузка видео ${i} из ${n}…`)))]
      await onSave(all)
    } catch (e) { setError('Ошибка: ' + e.message) }
    setBusy(false); setProgress('')
  }

  return (
    <div className="task-form">
      <p className="eyebrow">🎬 Запись занятия</p>
      {list.map((r, i) => (
        <div key={i} className="row-between" style={{ gap: 8 }}>
          <span className="small-text" style={{ wordBreak: 'break-all' }}>{r.kind === 'link' ? '🔗 ' : '🎞 '}{r.name || r.url}</span>
          <button className="file-remove" onClick={() => setList(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="btn-row">
        <input className="text-input" placeholder="Ссылка на запись (YouTube, VK, Диск…)" value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} />
        <button className="btn-secondary" onClick={addLink}>+</button>
      </div>
      <FileUploader files={files} onChange={setFiles} accept="video/*" label="Или загрузить видеофайл" />
      {progress && <p className="muted">{progress}</p>}
      {error && <p className="error-text">⚠️ {error}</p>}
      <div className="btn-row">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        <button className="btn-secondary" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}
