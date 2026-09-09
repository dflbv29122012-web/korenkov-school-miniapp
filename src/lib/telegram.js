export function getTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp
  }
  return null
}

export function initTelegramApp() {
  const tg = getTelegramWebApp()
  if (!tg) return null
  tg.ready()
  tg.expand()
  return tg
}

export function getTelegramUser() {
  const tg = getTelegramWebApp()
  if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return null
  return tg.initDataUnsafe.user
}

export function isRunningInTelegram() {
  return getTelegramWebApp() !== null
}

// Определяем, открыт ли режим панели учителя через ?teacher=1 в URL
export function isTeacherModeRequested() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('teacher') === '1'
}
