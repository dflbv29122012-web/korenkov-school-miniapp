import { useRef } from 'react'
import { isImage, isVideo } from '../lib/storage'

// Мульти-загрузчик: накапливает выбранные файлы, позволяет удалять по одному.
// files — массив File, onChange(newFiles) — колбэк
export default function FileUploader({ files, onChange, accept, max = 50, label = 'Прикрепить файлы' }) {
  const inputRef = useRef(null)

  function handlePick(e) {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return
    // Добавляем к уже выбранным, а не заменяем
    const merged = [...files, ...picked].slice(0, max)
    onChange(merged)
    // Сбрасываем input, чтобы можно было выбрать тот же файл ещё раз
    e.target.value = ''
  }

  function removeAt(idx) {
    onChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="uploader">
      <button type="button" className="file-drop" onClick={() => inputRef.current?.click()}>
        📎 {label} {files.length > 0 ? `(выбрано ${files.length} из ${max})` : ''}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handlePick}
        hidden
      />

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i} className="file-row">
              {isImage(f) ? (
                <img src={URL.createObjectURL(f)} alt="" className="file-thumb" />
              ) : (
                <span className="file-icon">{isVideo(f) ? '🎬' : '📄'}</span>
              )}
              <span className="file-name">{f.name}</span>
              <button type="button" className="file-remove" onClick={() => removeAt(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Просмотр уже загруженных вложений (массив {url, name, kind})
export function AttachmentList({ items, compact }) {
  if (!items || items.length === 0) return null
  return (
    <div className={'attach-grid' + (compact ? ' compact' : '')}>
      {items.map((a, i) => (
        a.kind === 'image' ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer">
            <img src={a.url} alt={a.name} className="attach-img" />
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
