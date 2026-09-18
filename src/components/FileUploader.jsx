import { useRef, useMemo } from 'react'
import { isImage, isVideo } from '../lib/storage'

// Мульти-загрузчик: файлы накапливаются в порядке выбора,
// можно менять местами (▲▼) и удалять (✕).
export default function FileUploader({ files, onChange, accept, max = 50, label = 'Прикрепить файлы' }) {
  const inputRef = useRef(null)

  function handlePick(e) {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return
    // Сортируем по имени, чтобы «Снимок 08.02.44, 08.02.50…» шли по порядку,
    // а не в случайном порядке, который отдаёт система
    picked.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
    onChange([...files, ...picked].slice(0, max))
    e.target.value = ''
  }

  function move(idx, dir) {
    const next = [...files]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }

  return (
    <div className="uploader">
      <button type="button" className="file-drop" onClick={() => inputRef.current?.click()}>
        📎 {label} {files.length > 0 ? `(${files.length} из ${max})` : ''}
      </button>
      <input ref={inputRef} type="file" accept={accept} multiple onChange={handlePick} hidden />

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <FileRow key={i} file={f} index={i} total={files.length}
              onUp={() => move(i, -1)} onDown={() => move(i, 1)}
              onRemove={() => onChange(files.filter((_, j) => j !== i))} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileRow({ file, index, total, onUp, onDown, onRemove }) {
  const url = useMemo(() => isImage(file) ? URL.createObjectURL(file) : null, [file])
  return (
    <li className="file-row">
      <span className="file-order">{index + 1}</span>
      {url ? <img src={url} alt="" className="file-thumb" />
           : <span className="file-icon">{isVideo(file) ? '🎬' : '📄'}</span>}
      <span className="file-name">{file.name}</span>
      <button type="button" className="file-move" disabled={index === 0} onClick={onUp}>▲</button>
      <button type="button" className="file-move" disabled={index === total - 1} onClick={onDown}>▼</button>
      <button type="button" className="file-remove" onClick={onRemove}>✕</button>
    </li>
  )
}

// Редактор УЖЕ загруженных вложений: порядок и удаление
export function AttachmentEditor({ items, onChange }) {
  if (!items || items.length === 0) return null

  function move(idx, dir) {
    const next = [...items]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }

  return (
    <ul className="file-list">
      {items.map((a, i) => (
        <li key={i} className="file-row">
          <span className="file-order">{i + 1}</span>
          {a.kind === 'image'
            ? <img src={a.url} alt="" className="file-thumb" />
            : <span className="file-icon">{a.kind === 'video' ? '🎬' : '📄'}</span>}
          <span className="file-name">{a.name}</span>
          <button type="button" className="file-move" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
          <button type="button" className="file-move" disabled={i === items.length - 1} onClick={() => move(i, 1)}>▼</button>
          <button type="button" className="file-remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
        </li>
      ))}
    </ul>
  )
}

// Просмотр вложений
export function AttachmentList({ items, compact }) {
  if (!items || items.length === 0) return null
  return (
    <div className={'attach-grid' + (compact ? ' compact' : '')}>
      {items.map((a, i) => (
        a.kind === 'image' ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="attach-cell">
            <img src={a.url} alt={a.name} className="attach-img" />
            <span className="attach-num">{i + 1}</span>
          </a>
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="attach-file">
            {a.kind === 'video' ? '🎬' : '📄'} {a.name}
          </a>
        )
      ))}
    </div>
  )
}
