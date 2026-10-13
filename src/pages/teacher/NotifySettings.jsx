import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { saveSetting } from '../../lib/settings'

const ITEMS = [
  ['lesson', '⏰ За час до занятия — ученикам'],
  ['hw_due', '📝 За сутки до дедлайна ДЗ — ученику'],
  ['hw_overdue', '⚠️ ДЗ просрочено — ученику и родителю'],
  ['payment', '💳 Оплата (помесячно): за 2 дня и при просрочке'],
  ['weekly', '📊 Итоги недели родителям — в воскресенье вечером'],
]
const DEFAULTS = { lesson: true, hw_due: true, hw_overdue: true, payment: true, weekly: true }

// Какие сообщения бот присылает ученикам и родителям
export default function NotifySettings() {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(DEFAULTS)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'notifications').maybeSingle()
      .then(({ data }) => { if (data?.value) setV({ ...DEFAULTS, ...data.value }) })
  }, [])

  async function toggle(k) {
    const next = { ...v, [k]: !v[k] }
    setV(next)
    const err = await saveSetting('notifications', next)
    setMsg(err ? 'Ошибка: ' + err.message : 'Сохранено')
  }
  async function test() {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('swift-handler', { body: { test: true } })
    let res = data
    if (error) { try { res = await error.context.json() } catch { res = null } }
    setBusy(false)
    setMsg(res?.ok ? '✅ Сообщение отправлено — проверьте Telegram' : res?.error === 'no_bot_token' ? 'В Supabase не добавлен TELEGRAM_BOT_TOKEN' : `Не получилось: ${res?.error || error?.message || 'функция notify не найдена'}. Откройте бота и нажмите «Start», затем попробуйте снова.`)
  }

  return (
    <section className="card">
      <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <p className="card-title" style={{ margin: 0 }}>🔔 Уведомления в Telegram</p>
        <span className="muted">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <p className="muted small-text">Бот сам напоминает ученикам и родителям. Ночью (21:00–9:00) пишет только о занятиях. Каждое сообщение — один раз.</p>
          {ITEMS.map(([k, l]) => (
            <label key={k} className="checkbox-row"><input type="checkbox" checked={!!v[k]} onChange={() => toggle(k)} /> {l}</label>
          ))}
          <button className="btn-secondary block" disabled={busy} onClick={test}>{busy ? 'Отправляю…' : '✉️ Прислать мне тестовое сообщение'}</button>
          {msg && <p className="muted small-text">{msg}</p>}
          <p className="muted small-text">Ученик или родитель может отключить сообщения у себя на главном экране.</p>
        </>
      )}
    </section>
  )
}
