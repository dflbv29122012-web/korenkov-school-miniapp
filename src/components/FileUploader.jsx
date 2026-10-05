import { useRef, useMemo, useState } from 'react'
import { isImage, isVideo } from '../lib/storage'

export default function FileUploader({ files, onChange, accept, max = 50, label = 'Прикрепить файлы' }) {
  const inputRef = useRef(null)

  function handlePick(e) {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return
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

// Определяем, можно ли показать файл прямо во встроенном окне (PDF — да, остальное — нет)
function isPreviewableFile(name) {
  return /\.pdf$/i.test(name || '')
}

// Просмотр вложений: фото и видео открываются во встроенном плеере с перелистыванием,
// PDF — во встроенном просмотрщике, остальные файлы — с кнопкой открытия там же.
export function AttachmentList({ items, compact }) {
  const [viewerIndex, setViewerIndex] = useState(null)
  const [fileViewer, setFileViewer] = useState(null)
  if (!items || items.length === 0) return null

  // Фото и видео листаются вместе, в общем порядке
  const media = items.filter(a => a.kind === 'image' || a.kind === 'video')

  function openMedia(item) {
    const idx = media.findIndex(m => m.url === item.url)
    setViewerIndex(idx >= 0 ? idx : 0)
  }

  return (
    <>
      <div className={'attach-grid' + (compact ? ' compact' : '')}>
        {items.map((a, i) => {
          if (a.kind === 'image') {
            return (
              <button key={i} type="button" className="attach-cell" onClick={() => openMedia(a)}>
                <img src={a.url} alt={a.name} className="attach-img" />
                <span className="attach-num">{i + 1}</span>
              </button>
            )
          }
          if (a.kind === 'video') {
            return (
              <button key={i} type="button" className="attach-cell attach-video-cell" onClick={() => openMedia(a)}>
                <span className="attach-video-play">▶</span>
                <span className="attach-num">{i + 1}</span>
              </button>
            )
          }
          return (
            <button key={i} type="button" className="attach-file" onClick={() => setFileViewer(a)}>
              📄 {a.name}
            </button>
          )
        })}
      </div>

      {viewerIndex !== null && (
        <MediaViewer media={media} index={viewerIndex} onClose={() => setViewerIndex(null)} onChange={setViewerIndex} />
      )}
      {fileViewer && (
        <FileViewerOverlay file={fileViewer} onClose={() => setFileViewer(null)} />
      )}
    </>
  )
}

function MediaViewer({ media, index, onClose, onChange }) {
  const touchStartX = useRef(null)
  const videoRef = useRef(null)
  const current = media[index]

  function goFullscreen() {
    const el = videoRef.current
    if (!el) return
    if (el.requestFullscreen) el.requestFullscreen()
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen() // iOS Safari/WKWebView
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
  }

  function go(dir) {
    const next = index + dir
    if (next < 0 || next >= media.length) return
    onChange(next)
  }

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 50) go(-1)
    else if (dx < -50) go(1)
    touchStartX.current = null
  }

  return (
    <div className="lightbox-overlay" onClick={onClose} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <button type="button" className="lightbox-close" onClick={onClose}>✕</button>
      {media.length > 1 && <span className="lightbox-counter">{index + 1} / {media.length}</span>}

      {current.kind === 'video' ? (
        <div className="lightbox-video-wrap" onClick={(e) => e.stopPropagation()}>
          <video ref={videoRef} src={current.url} controls autoPlay playsInline controlsList="nodownload" className="lightbox-video" />
          <button type="button" className="lightbox-fullscreen" onClick={goFullscreen}>⛶ На весь экран</button>
        </div>
      ) : (
        <img src={current.url} alt={current.name} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
      )}

      {media.length > 1 && (
        <>
          <button type="button" className="lightbox-nav lightbox-prev" disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); go(-1) }}>‹</button>
          <button type="button" className="lightbox-nav lightbox-next" disabled={index === media.length - 1}
            onClick={(e) => { e.stopPropagation(); go(1) }}>›</button>
        </>
      )}
    </div>
  )
}

function FileViewerOverlay({ file, onClose }) {
  const previewable = isPreviewableFile(file.name)
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose}>✕</button>
      <div className="file-viewer-box" onClick={(e) => e.stopPropagation()}>
        {previewable ? (
          <iframe src={file.url} title={file.name} className="file-viewer-frame" />
        ) : (
          <div className="file-viewer-fallback">
            <p className="card-title">📄 {file.name}</p>
            <p className="muted">Предпросмотр этого типа файла недоступен внутри приложения.</p>
            <a href={file.url} target="_blank" rel="noreferrer" className="btn-primary block">Открыть файл</a>
          </div>
        )}
      </div>
    </div>
  )
}
