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

// Подписанные Telegram данные запуска — их проверяет сервер (функция tg-auth)
export function getInitData() {
  const tg = getTelegramWebApp()
  return tg && tg.initData ? tg.initData : ''
}

export function isRunningInTelegram() {
  return getTelegramWebApp() !== null
}

// Открывает внешнюю ссылку во встроенном браузере Telegram (или в новой вкладке вне Telegram)
export function openLink(url) {
  const tg = getTelegramWebApp()
  if (tg && tg.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}
