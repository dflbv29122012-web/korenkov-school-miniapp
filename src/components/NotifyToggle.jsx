import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Вкл/выкл напоминаний бота в Telegram для себя
export default function NotifyToggle({ student, onSaved, text = 'Напоминания в Telegram: о занятиях, дедлайнах ДЗ и оплате' }) {
  const [on, setOn] = useState(student.notify !== false)
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    const v = !on
    const { error } = await supabase.from('students').update({ notify: v }).eq('id', student.id)
    setBusy(false)
    if (!error) { setOn(v); onSaved?.() }
  }
  return (
    <label className="checkbox-row notify-toggle">
      <input type="checkbox" checked={on} disabled={busy} onChange={toggle} />
      🔔 {text}
    </label>
  )
}
