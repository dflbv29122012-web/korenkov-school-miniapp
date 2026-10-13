// Ссылки из базы открываем только если это обычный http(s)-адрес.
// Защищает от ссылок вида javascript:… , которыми можно украсть вход учителя.
export function isSafeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim())
}
export function safeUrl(u) {
  return isSafeUrl(u) ? u.trim() : '#'
}
