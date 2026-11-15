import { useEffect, useState, useSyncExternalStore } from 'react'
import { secureUrl, resolveUrl, isProtected, subscribeSecure, secureVersion } from './secureUrl'

// Ссылки из базы открываем только если это обычный http(s)-адрес.
// Защищает от ссылок вида javascript:… , которыми можно украсть вход учителя.
export function isSafeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim())
}
// Файлы из закрытого хранилища автоматически заменяются временной подписанной ссылкой
export function safeUrl(u) {
  return isSafeUrl(u) ? secureUrl(u.trim()) : '#'
}

// Перерисовывает экран, когда готовы новые подписанные ссылки (подключается один раз в App)
export function useSecureVersion() {
  return useSyncExternalStore(subscribeSecure, secureVersion)
}

// Настоящая ссылка для PDF и видео: null, пока подписывается
export function useResolvedUrl(u) {
  const direct = isSafeUrl(u) && !isProtected(u.trim()) ? u.trim() : null
  const [url, setUrl] = useState(direct)
  useEffect(() => {
    if (!isSafeUrl(u)) { setUrl(null); return }
    if (!isProtected(u.trim())) { setUrl(u.trim()); return }
    let cancelled = false
    setUrl(null)
    resolveUrl(u.trim()).then(r => { if (!cancelled) setUrl(r) })
    return () => { cancelled = true }
  }, [u])
  return url
}
