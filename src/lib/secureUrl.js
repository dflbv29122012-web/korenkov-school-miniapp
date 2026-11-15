// Защищённые ссылки на платные материалы.
// В базе по-прежнему хранится обычный адрес файла, но открывается он только по временной
// подписанной ссылке, которую сервер выдаёт вошедшему ученику с открытым доступом.
// Ссылка живёт несколько часов — пересылать её бесполезно.
import { supabase, SUPABASE_URL } from './supabase'

const PUBLIC_PREFIX = SUPABASE_URL + '/storage/v1/object/public/'
const PROTECTED_BUCKETS = ['materials']
const TTL_SECONDS = 6 * 3600
const RENEW_BEFORE_MS = 10 * 60 * 1000
// прозрачная точка, пока ссылка подписывается
export const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const cache = new Map()   // адрес -> { signed, exp }
const failed = new Map()  // адрес -> когда можно попробовать снова
const waiting = new Map() // адрес -> [resolve]
let queue = new Set()
let timer = null
let version = 0
const listeners = new Set()

function parse(url) {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return null
  const rest = url.slice(PUBLIC_PREFIX.length).split('?')[0]
  const i = rest.indexOf('/')
  if (i <= 0) return null
  const bucket = rest.slice(0, i)
  if (!PROTECTED_BUCKETS.includes(bucket)) return null
  let path = rest.slice(i + 1)
  try { path = decodeURIComponent(path) } catch { /* оставляем как есть */ }
  return { bucket, path }
}

export const isProtected = (url) => parse(url) !== null

function fresh(url) {
  const c = cache.get(url)
  return c && c.exp - Date.now() > RENEW_BEFORE_MS ? c.signed : null
}

function schedule(url) {
  queue.add(url)
  if (!timer) timer = setTimeout(flush, 25)
}

async function flush() {
  timer = null
  const urls = [...queue]
  queue = new Set()
  const byBucket = {}
  urls.forEach(u => { const p = parse(u); if (p) (byBucket[p.bucket] ||= []).push({ u, path: p.path }) })
  for (const [bucket, items] of Object.entries(byBucket)) {
    for (let i = 0; i < items.length; i += 100) {
      const part = items.slice(i, i + 100)
      let rows = null
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(part.map(x => x.path), TTL_SECONDS)
        if (!error) rows = data
      } catch { /* сеть */ }
      part.forEach((x, k) => {
        const signed = rows?.[k]?.signedUrl
        if (signed) cache.set(x.u, { signed, exp: Date.now() + TTL_SECONDS * 1000 })
        else failed.set(x.u, Date.now() + 30 * 1000)
        const result = signed || x.u
        ;(waiting.get(x.u) || []).forEach(r => r(result))
        waiting.delete(x.u)
      })
    }
  }
  version++
  listeners.forEach(l => l())
}

// Для разметки: сразу отдаёт подписанную ссылку, если она уже есть; иначе — заглушку,
// а после подписи экран перерисуется сам (см. useSecureVersion в App).
export function secureUrl(url) {
  if (!parse(url)) return url
  const ok = fresh(url)
  if (ok) return ok
  const retryAt = failed.get(url)
  if (retryAt && retryAt > Date.now()) return url // подписать не удалось — пробуем открыть напрямую
  schedule(url)
  return cache.get(url)?.signed || PLACEHOLDER
}

// Для кода: дождаться настоящей ссылки (PDF, видео, скачивание)
export function resolveUrl(url) {
  if (!parse(url)) return Promise.resolve(url)
  const ok = fresh(url)
  if (ok) return Promise.resolve(ok)
  return new Promise(resolve => {
    waiting.set(url, [...(waiting.get(url) || []), resolve])
    schedule(url)
  })
}

export function subscribeSecure(listener) { listeners.add(listener); return () => listeners.delete(listener) }
export const secureVersion = () => version
