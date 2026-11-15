import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadFiles } from '../lib/storage'
import FileUploader from './FileUploader'
import { loadPaySettings, rub } from '../lib/billing'

function Copy({ value }) {
  const [ok, setOk] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(value) } catch {
      const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setOk(true); setTimeout(() => setOk(false), 1500)
  }
  return <button type="button" className="chip-btn" onClick={copy}>{ok ? '✓ Скопировано' : '📋 Копировать'}</button>
}

// Реквизиты + «Я оплатил(а)». target — ученик, за которого платят; sentBy — кто отправляет (ученик или родитель)
export default function PayBlock({ target, sentBy, status, plan, onSent }) {
  const [details, setDetails] = useState(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(status?.type === 'package' ? 'package' : status?.type === 'monthly' ? 'month' : 'other')
  const [amount, setAmount] = useState(status?.toPay ? String(Math.round(status.toPay)) : '')
  const [files, setFiles] = useState([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState([])

  async function loadPending() {
    const { data } = await supabase.from('payments').select('*').eq('student_id', target.id).eq('status', 'pending').order('paid_at', { ascending: false })
    setPending(data ?? [])
  }
  useEffect(() => { loadPaySettings().then(s => setDetails(s.details)); loadPending() }, [target.id])
  useEffect(() => { if (status?.toPay) setAmount(String(Math.round(status.toPay))) }, [status?.toPay])

  async function send() {
    setError('')
    const sum = Number(String(amount).replace(/\s/g, '').replace(',', '.'))
    if (!sum || sum <= 0) return setError('Укажите сумму перевода')
    setBusy(true)
    try {
      const receipt = files.length ? await uploadFiles('attachments', files) : []
      const lessons = kind === 'package' ? (Number(plan?.package_size) || 8) : 0
      const { error: err } = await supabase.from('payments').insert({
        student_id: target.id, amount: sum, kind, months: 1, lessons, status: 'pending', method: 'Перевод',
        receipt, comment: comment.trim() || null, sent_by: sentBy || null, paid_at: new Date().toISOString(),
      })
      if (err) throw err
      setOpen(false); setFiles([]); setComment(''); loadPending(); onSent?.()
    } catch (e) { setError('Не удалось отправить: ' + e.message) }
    setBusy(false)
  }

  const hasDetails = details && (details.card || details.phone)

  return (
    <section className="card">
      <p className="eyebrow" style={{ marginTop: 0 }}>💳 Как оплатить</p>
      {!details ? <p className="muted">Загрузка…</p> : !hasDetails ? (
        <p className="muted">Реквизиты для перевода уточните у преподавателя.</p>
      ) : (
        <>
          {status?.toPay > 0 && <p className="card-title" style={{ margin: '0 0 8px' }}>К оплате: {rub(status.toPay)}</p>}
          {details.phone && (
            <div className="pay-row">
              <div><p className="muted small-text">СБП по номеру телефона{details.bank ? ` · ${details.bank}` : ''}</p><p className="pay-value">{details.phone}</p></div>
              <Copy value={details.phone} />
            </div>
          )}
          {details.card && (
            <div className="pay-row">
              <div><p className="muted small-text">Номер карты</p><p className="pay-value">{details.card}</p></div>
              <Copy value={details.card.replace(/\s/g, '')} />
            </div>
          )}
          {details.name && <p className="muted small-text">Получатель: <b style={{ color: 'var(--text)' }}>{details.name}</b></p>}
          {details.note && <p className="muted small-text">{details.note}</p>}
        </>
      )}

      {pending.map(p => (
        <p key={p.id} className="muted small-text">⏳ Перевод {rub(p.amount)} от {new Date(p.paid_at).toLocaleDateString('ru-RU')} ждёт подтверждения преподавателя</p>
      ))}

      {!open ? (
        <button className="btn-primary block" onClick={() => setOpen(true)}>✅ Я оплатил(а) — сообщить</button>
      ) : (
        <div className="task-form">
          <p className="eyebrow">За что оплата</p>
          <div className="chip-wrap">
            {[['month', 'Месяц'], ['package', `Пакет${plan?.package_size ? ` (${plan.package_size} зан.)` : ''}`], ['other', 'Другое / долг']].map(([k, l]) => (
              <button key={k} className={'filter-chip' + (kind === k ? ' active' : '')} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <input className="text-input" inputMode="decimal" placeholder="Сумма, ₽" value={amount} onChange={e => setAmount(e.target.value)} />
          <FileUploader files={files} onChange={setFiles} accept="image/*,.pdf" max={3} label="Скриншот или чек перевода (по желанию)" />
          <input className="text-input" placeholder="Комментарий (необязательно)" value={comment} onChange={e => setComment(e.target.value)} />
          {error && <p className="error-text">⚠️ {error}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Отправка…' : 'Отправить'}</button>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Отмена</button>
          </div>
          <p className="muted small-text">Преподаватель проверит перевод и подтвердит оплату. Доступ откроется после подтверждения.</p>
        </div>
      )}
    </section>
  )
}
