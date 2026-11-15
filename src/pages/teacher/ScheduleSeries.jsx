import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import TimeSelect from '../../components/TimeSelect'
import {
  WEEKDAYS, WEEKDAYS_FULL, ymd, fmtDate, endOfSchoolYear, endOfYear, plusMonths,
  planSlots, buildRows, isTouched, slotsSummary, insertChunks, deleteByIds,
} from '../../lib/series'

const DURATIONS = [30, 45, 60, 75, 90, 120]
const newSlot = () => ({ weekday: 2, time: '', duration: 60 })
const blank = () => ({
  kind: 'student', audienceId: '', title: 'Занятие', slots: [newSlot()],
  meeting_url: '', board_url: '', valid_from: ymd(new Date()), valid_until: endOfSchoolYear(),
})

// Постоянное расписание: «окна» по дням недели на весь период
export default function ScheduleSeries({ students, groups, series, lessons, timeSuggest, onChanged, onClose }) {
  const [editing, setEditing] = useState(null) // null | 'new' | id серии
  const [form, setForm] = useState(blank())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const up = (patch) => setForm(f => ({ ...f, ...patch }))
  const nameOf = (s) => s.for_all ? '🌐 Всем'
    : s.group_id ? '👥 ' + (groups.find(g => g.id === s.group_id)?.name || 'группа')
    : '👤 ' + ((x) => x ? `${x.first_name} ${x.last_name || ''}`.trim() : 'ученик')(students.find(p => p.id === s.student_id))

  const toRow = (f) => ({
    title: f.title.trim() || 'Занятие',
    student_id: f.kind === 'student' ? f.audienceId || null : null,
    group_id: f.kind === 'group' ? f.audienceId || null : null,
    for_all: f.kind === 'all',
    slots: f.slots.filter(s => s.time).map(s => ({ weekday: Number(s.weekday), time: s.time, duration: Number(s.duration) || 60 })),
    meeting_url: f.meeting_url.trim() || null, board_url: f.board_url.trim() || null,
    valid_from: f.valid_from, valid_until: f.valid_until,
  })

  // ссылки из прошлых занятий/серий этого ученика или группы
  function linksFor(kind, id) {
    if (!id) return null
    const match = (x) => kind === 'group' ? x.group_id === id : x.student_id === id
    const s = series.find(x => match(x) && (x.meeting_url || x.board_url))
    if (s) return { meeting_url: s.meeting_url || '', board_url: s.board_url || '' }
    const l = lessons.filter(x => match(x) && (x.meeting_url || x.board_url)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))[0]
    return l ? { meeting_url: l.meeting_url || '', board_url: l.board_url || '' } : null
  }
  function pickAudience(kind, id) {
    const patch = { kind, audienceId: id }
    const found = linksFor(kind, id)
    if (found && !form.meeting_url && !form.board_url) Object.assign(patch, found)
    up(patch)
  }

  function startNew() { setForm(blank()); setEditing('new'); setError(''); setMsg('') }
  function startEdit(s) {
    setForm({
      kind: s.for_all ? 'all' : s.group_id ? 'group' : 'student', audienceId: s.group_id || s.student_id || '',
      title: s.title || 'Занятие', slots: (s.slots?.length ? s.slots : [newSlot()]).map(x => ({ ...x })),
      meeting_url: s.meeting_url || '', board_url: s.board_url || '', valid_from: s.valid_from, valid_until: s.valid_until,
    })
    setEditing(s.id); setError(''); setMsg('')
  }

  const row = toRow(form)
  const plan = useMemo(() => planSlots(row), [form])
  const tooBig = plan === null
  const count = plan ? plan.length : 0

  function check() {
    if (form.kind !== 'all' && !form.audienceId) return 'Выберите ученика или группу'
    if (!row.slots.length) return 'Добавьте хотя бы один день с временем'
    if (!form.valid_until || form.valid_until < form.valid_from) return 'Дата «до» должна быть позже даты «с»'
    if (tooBig) return 'Период слишком большой — не больше 2 лет'
    return ''
  }

  async function createNew() {
    const e = check(); if (e) return setError(e)
    setBusy(true); setError('')
    try {
      const { data: s, error: err } = await supabase.from('lesson_series').insert(row).select().single()
      if (err) throw err
      const rows = buildRows(s, [])
      await insertChunks(supabase, rows)
      setMsg(`Готово: создано занятий — ${rows.length}`); setEditing(null); onChanged()
    } catch (er) { setError('Ошибка: ' + er.message) }
    setBusy(false)
  }

  // mode: 'template' — только шаблон; 'apply' — и обновить будущие занятия
  async function saveEdit(mode) {
    const e = check(); if (e) return setError(e)
    setBusy(true); setError('')
    try {
      const { data: s, error: err } = await supabase.from('lesson_series').update(row).eq('id', editing).select().single()
      if (err) throw err
      if (mode === 'template') { setMsg('Шаблон сохранён. Уже созданные занятия не менялись.'); setEditing(null); onChanged(); setBusy(false); return }
      const nowIso = new Date().toISOString()
      const { data: all } = await supabase.from('lessons').select('*').eq('series_id', editing)
      const future = (all ?? []).filter(l => l.starts_at >= nowIso)
      // ссылки обновляем у всех будущих занятий серии
      await supabase.from('lessons').update({ meeting_url: s.meeting_url, board_url: s.board_url }).eq('series_id', editing).gte('starts_at', nowIso)
      // пустые «окна» (без темы и конспекта) пересоздаём по новому шаблону
      const fresh = future.filter(l => !isTouched(l))
      await deleteByIds(supabase, fresh.map(l => l.id))
      const kept = (all ?? []).filter(l => !fresh.includes(l))
      const rows = buildRows(s, kept, ymd(new Date()))
      await insertChunks(supabase, rows)
      const keptFuture = future.filter(isTouched).length
      setMsg(`Обновлено: пересоздано ${rows.length} занятий.` + (keptFuture ? ` Не тронуто ${keptFuture} — у них есть тема, конспект или время менялось вручную (ссылки у них обновились).` : ''))
      setEditing(null); onChanged()
    } catch (er) { setError('Ошибка: ' + er.message) }
    setBusy(false)
  }

  async function topUp(s) {
    setBusy(true); setError('')
    try {
      const { data: all } = await supabase.from('lessons').select('*').eq('series_id', s.id)
      const rows = buildRows(s, all ?? [], ymd(new Date()))
      await insertChunks(supabase, rows)
      setMsg(rows.length ? `Добавлено занятий: ${rows.length}` : 'Всё уже создано, добавлять нечего'); onChanged()
    } catch (er) { setError('Ошибка: ' + er.message) }
    setBusy(false)
  }

  async function remove(s) {
    const mine = lessons.filter(l => l.series_id === s.id && l.starts_at >= new Date().toISOString())
    const untouched = mine.filter(l => !isTouched(l))
    if (!confirm(`Удалить постоянное расписание «${s.title}» (${nameOf(s)})?\n\nБудущих пустых занятий будет удалено: ${untouched.length}. Прошедшие занятия и занятия с темой или конспектом останутся.`)) return
    setBusy(true)
    try {
      const { data: all } = await supabase.from('lessons').select('*').eq('series_id', s.id)
      const del = (all ?? []).filter(l => l.starts_at >= new Date().toISOString() && !isTouched(l))
      await deleteByIds(supabase, del.map(l => l.id))
      await supabase.from('lesson_series').delete().eq('id', s.id)
      setMsg('Расписание удалено'); onChanged()
    } catch (er) { setError('Ошибка: ' + er.message) }
    setBusy(false)
  }

  const setSlot = (i, patch) => up({ slots: form.slots.map((s, j) => j === i ? { ...s, ...patch } : s) })
  const nowIso = new Date().toISOString()

  // ---------- форма ----------
  if (editing) {
    const isNew = editing === 'new'
    return (
      <div className="card task-form">
        <p className="eyebrow" style={{ marginTop: 0 }}>{isNew ? 'Новое постоянное расписание' : 'Изменить постоянное расписание'}</p>

        <p className="eyebrow">Кто занимается</p>
        <div className="chip-wrap">
          {[['student', '👤 Ученик'], ['group', '👥 Группа'], ['all', '🌐 Все']].map(([k, l]) => (
            <button key={k} className={'filter-chip' + (form.kind === k ? ' active' : '')} onClick={() => pickAudience(k, '')}>{l}</button>
          ))}
        </div>
        {form.kind === 'student' && (
          <select className="text-input" value={form.audienceId} onChange={e => pickAudience('student', e.target.value)}>
            <option value="">Выберите ученика</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        )}
        {form.kind === 'group' && (
          <select className="text-input" value={form.audienceId} onChange={e => pickAudience('group', e.target.value)}>
            <option value="">Выберите группу</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <input className="text-input" placeholder="Название занятия (видят ученики)" value={form.title} onChange={e => up({ title: e.target.value })} />

        <p className="eyebrow">Дни и время</p>
        {form.slots.map((s, i) => (
          <div key={i} className="slot-row">
            <div className="slot-top">
              <select className="text-input" value={s.weekday} onChange={e => setSlot(i, { weekday: Number(e.target.value) })}>
                {WEEKDAYS_FULL.map((n, k) => <option key={k} value={k + 1}>{n}</option>)}
              </select>
              <select className="text-input" value={s.duration} onChange={e => setSlot(i, { duration: Number(e.target.value) })}>
                {(DURATIONS.includes(Number(s.duration)) ? DURATIONS : [...DURATIONS, Number(s.duration)].sort((a, b) => a - b)).map(d => <option key={d} value={d}>{d} мин</option>)}
              </select>
              {form.slots.length > 1 && <button className="file-remove" onClick={() => up({ slots: form.slots.filter((_, j) => j !== i) })}>✕</button>}
            </div>
            <TimeSelect value={s.time} onChange={t => setSlot(i, { time: t })} suggest={timeSuggest} />
          </div>
        ))}
        <button className="btn-secondary block" onClick={() => up({ slots: [...form.slots, { ...newSlot(), weekday: Math.min(7, (form.slots[form.slots.length - 1]?.weekday || 1) + 2) }] })}>+ Ещё день</button>

        <p className="eyebrow">Период</p>
        <div className="btn-row">
          <div style={{ flex: 1 }}><p className="muted small-text">с</p><input type="date" className="text-input" value={form.valid_from} onChange={e => up({ valid_from: e.target.value })} /></div>
          <div style={{ flex: 1 }}><p className="muted small-text">до</p><input type="date" className="text-input" value={form.valid_until} onChange={e => up({ valid_until: e.target.value })} /></div>
        </div>
        <div className="chip-wrap">
          <button className="filter-chip" onClick={() => up({ valid_until: plusMonths(1) })}>+1 месяц</button>
          <button className="filter-chip" onClick={() => up({ valid_until: plusMonths(3) })}>+3 месяца</button>
          <button className="filter-chip" onClick={() => up({ valid_until: endOfYear() })}>До конца года</button>
          <button className="filter-chip" onClick={() => up({ valid_until: endOfSchoolYear() })}>До 31 мая</button>
        </div>

        <p className="eyebrow">Ссылки (одни на все занятия)</p>
        <input className="text-input" placeholder="🎥 Ссылка на созвон" value={form.meeting_url} onChange={e => up({ meeting_url: e.target.value })} />
        <input className="text-input" placeholder="🖊 Ссылка на доску" value={form.board_url} onChange={e => up({ board_url: e.target.value })} />

        <section className="card series-preview">
          {tooBig ? <p className="error-text">Период слишком большой</p> : (
            <>
              <p className="card-title" style={{ margin: 0 }}>Будет в расписании: {count} занятий</p>
              {count > 0 && <p className="muted small-text">с {fmtDate(plan[0].date)} по {fmtDate(plan[plan.length - 1].date)} · {slotsSummary(row.slots)}</p>}
            </>
          )}
        </section>

        {error && <p className="error-text">⚠️ {error}</p>}
        {isNew ? (
          <button className="btn-primary block" disabled={busy} onClick={createNew}>{busy ? 'Создаю…' : `✅ Создать ${count} занятий в расписании`}</button>
        ) : (
          <>
            <button className="btn-primary block" disabled={busy} onClick={() => saveEdit('apply')}>{busy ? 'Сохраняю…' : '💾 Сохранить и обновить будущие занятия'}</button>
            <button className="btn-secondary block" disabled={busy} onClick={() => saveEdit('template')}>💾 Сохранить только шаблон</button>
            <p className="muted small-text">«Обновить» пересоздаст будущие пустые занятия и заменит ссылки у всех будущих. Занятия с темой, конспектом или сдвинутым временем останутся как есть.</p>
          </>
        )}
        <button className="btn-secondary block" onClick={() => setEditing(null)}>Отмена</button>
      </div>
    )
  }

  // ---------- список ----------
  return (
    <div className="card">
      <div className="row-between">
        <p className="eyebrow" style={{ margin: 0 }}>🔁 Постоянное расписание</p>
        <button className="btn-secondary" onClick={onClose}>Закрыть</button>
      </div>
      <p className="muted small-text">Укажите, кто и когда занимается каждую неделю, — занятия сразу появятся в расписании на весь период, со ссылками. Потом остаётся добавить тему и конспект.</p>
      {msg && <p className="muted" style={{ color: 'var(--green)' }}>{msg}</p>}
      {error && <p className="error-text">⚠️ {error}</p>}

      {series.length === 0 && <p className="muted">Пока нет ни одного постоянного занятия.</p>}
      {series.map(s => {
        const mine = lessons.filter(l => l.series_id === s.id)
        const future = mine.filter(l => l.starts_at >= nowIso).length
        return (
          <div key={s.id} className="task-card">
            <p className="card-title" style={{ margin: 0 }}>{nameOf(s)}</p>
            <p className="muted">{slotsSummary(s.slots)}</p>
            <p className="muted small-text">{fmtDate(s.valid_from)} — {fmtDate(s.valid_until)} · впереди занятий: {future}</p>
            {(s.meeting_url || s.board_url) && <p className="muted small-text">{s.meeting_url ? '🎥 ссылка на созвон' : ''}{s.meeting_url && s.board_url ? ' · ' : ''}{s.board_url ? '🖊 ссылка на доску' : ''}</p>}
            <div className="btn-row" style={{ flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => startEdit(s)}>✏️ Изменить</button>
              <button className="btn-secondary" disabled={busy} onClick={() => topUp(s)}>➕ Дособрать</button>
              <button className="btn-secondary" disabled={busy} onClick={() => remove(s)}>🗑</button>
            </div>
          </div>
        )
      })}
      <button className="btn-primary block" onClick={startNew}>+ Новое постоянное расписание</button>
    </div>
  )
}
