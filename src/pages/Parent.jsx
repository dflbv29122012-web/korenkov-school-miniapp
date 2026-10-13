import { useEffect, useState } from 'react'
import { dueMoment, fmtDue } from '../lib/due'
import { loadBilling } from '../lib/billing'
import BillingCard from '../components/BillingCard'
import PayBlock from '../components/PayBlock'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadProgressData, ratingList, currentMonth } from '../lib/progress'
import { ProgressView, RatingView } from '../components/ProgressView'
import MockHistory from '../components/MockHistory'
import { streakInfo } from '../lib/learning'
import { forecast } from '../components/GoalView'
import NotifyToggle from '../components/NotifyToggle'

// Привязка по коду от учителя. Возвращает текст ошибки или null
export async function linkByCode(me, code) {
  const c = code.trim().toUpperCase()
  if (!c) return 'Введите код'
  const { data, error } = await supabase.rpc('link_parent', { code: c })
  if (error) return 'Ошибка: ' + error.message
  if (data?.error === 'not_found') return 'Код не найден. Проверьте его или попросите учителя прислать новый.'
  if (data?.error === 'self') return 'Это код вашего собственного профиля'
  return null
}

export function ParentCodeForm({ onLinked, title = 'Я родитель' }) {
  const { student } = useAuth()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    const e = await linkByCode(student, code)
    setBusy(false)
    if (e) return setErr(e)
    setCode(''); onLinked()
  }
  return (
    <section className="card">
      <p className="card-title">👪 {title}</p>
      <p className="muted">Введите код, который прислал учитель, — откроется кабинет родителя с успехами ребёнка.</p>
      <input className="text-input" placeholder="Код, например K7M2QX" value={code} onChange={e => setCode(e.target.value)} />
      {err && <p className="error-text">⚠️ {err}</p>}
      <button className="btn-primary block" disabled={busy} onClick={go}>{busy ? 'Проверяю…' : 'Подключить'}</button>
    </section>
  )
}

const TABS = [['sum', '🏠 Сводка'], ['nums', '📊 Номера'], ['rating', '🏆 Рейтинг'], ['mocks', '📝 Пробники']]

export default function Parent() {
  const { student, refreshStudent } = useAuth()
  const [children, setChildren] = useState(null)
  const [childId, setChildId] = useState(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data: links } = await supabase.from('parent_links').select('child_id').eq('parent_id', student.id)
    const ids = (links ?? []).map(l => l.child_id)
    const { data } = ids.length ? await supabase.from('students').select('*').in('id', ids).order('first_name') : { data: [] }
    setChildren(data ?? [])
    setChildId(prev => prev && ids.includes(prev) ? prev : data?.[0]?.id ?? null)
  }
  useEffect(() => { load() }, [])

  if (!children) return <div className="screen"><p className="muted">Загрузка…</p></div>
  const child = children.find(c => c.id === childId)

  return (
    <div className="screen">
      <div className="home-header">
        <div>
          <h1>Кабинет родителя</h1>
          <p className="muted">Korenkov School</p>
        </div>
        <div className="avatar-circle">👪</div>
      </div>

      {children.length === 0 && <ParentCodeForm title="Подключить ребёнка" onLinked={() => { refreshStudent(); load() }} />}

      {children.length > 1 && (
        <div className="chip-wrap">
          {children.map(c => (
            <button key={c.id} className={'filter-chip' + (c.id === childId ? ' active' : '')} onClick={() => setChildId(c.id)}>{c.first_name}</button>
          ))}
        </div>
      )}

      {child && <ChildCabinet child={child} />}

      {children.length > 0 && (adding
        ? <ParentCodeForm title="Добавить ещё ребёнка" onLinked={() => { setAdding(false); load() }} />
        : <button className="btn-secondary block" onClick={() => setAdding(true)}>+ Добавить ещё ребёнка</button>)}
      {children.length > 0 && <NotifyToggle student={student} onSaved={refreshStudent} text="Сообщения в Telegram: итоги недели, несданные ДЗ, напоминания об оплате" />}
    </div>
  )
}

// Содержимое кабинета для одного ребёнка (используется и в предпросмотре у учителя)
export function ChildCabinet({ child }) {
  const [tab, setTab] = useState('sum')
  return (
    <>
      <p className="card-title-lg">{child.first_name} {child.last_name}</p>
      <div className="chip-wrap">
        {TABS.map(([k, l]) => <button key={k} className={'filter-chip' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'sum' && <Summary child={child} />}
      {tab === 'nums' && <ChildProgress childId={child.id} />}
      {tab === 'rating' && <ChildRating child={child} />}
      {tab === 'mocks' && <><p className="eyebrow">Пробники</p><MockHistory studentId={child.id} /></>}
    </>
  )
}

function ChildRating({ child }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    Promise.all([
      loadProgressData(),
      supabase.from('students_public').select('id, first_name, last_name, is_teacher, is_parent, hide_in_rating'),
    ]).then(([raw, { data: st }]) => setData({ raw, students: st ?? [] }))
  }, [child.id])
  if (!data) return <p className="muted">Загрузка…</p>
  return <RatingView raw={data.raw} students={data.students} meId={child.id} meLabel="ваш ребёнок" />
}

function ChildProgress({ childId }) {
  const [raw, setRaw] = useState(null)
  useEffect(() => { loadProgressData([childId]).then(setRaw) }, [childId])
  return raw ? <ProgressView raw={raw} studentId={childId} /> : <p className="muted">Загрузка…</p>
}

function Summary({ child }) {
  const { student: me } = useAuth()
  const [billing, setBilling] = useState(null)
  useEffect(() => { loadBilling(child).then(setBilling).catch(() => {}) }, [child.id])
  const [d, setD] = useState(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const nowIso = new Date().toISOString()
      const { data: gl } = await supabase.from('student_groups').select('group_id').eq('student_id', child.id)
      const gids = (gl ?? []).map(g => g.group_id)
      const scope = [`student_id.eq.${child.id}`, 'for_all.eq.true']
      if (gids.length) scope.push(`group_id.in.(${gids.join(',')})`)
      const weekAgoIso = new Date(Date.now() - 7 * 864e5).toISOString()
      const [{ data: next }, { count: passed }, { data: hw }, { data: plan }, raw, { data: st }] = await Promise.all([
        supabase.from('lessons').select('*').gte('starts_at', nowIso).or(scope.join(',')).order('starts_at').limit(1),
        supabase.from('lessons').select('*', { count: 'exact', head: true }).lt('starts_at', nowIso).or(scope.join(',')),
        supabase.from('homework').select('*').eq('student_id', child.id).order('created_at', { ascending: false }),
        supabase.from('subscription_plans').select('*').eq('student_id', child.id).maybeSingle(),
        loadProgressData(),
        supabase.from('students_public').select('id, first_name, last_name, is_teacher, is_parent, hide_in_rating'),
      ])
      const list = hw ?? []
      const checked = list.filter(h => h.status === 'checked')
      const c = checked.reduce((s, h) => s + (h.correct_tasks || 0), 0)
      const t = checked.reduce((s, h) => s + (h.total_tasks || 0), 0)
      const weekTasks = new Set(raw.taskAttempts.filter(a => a.student_id === child.id && a.is_correct && a.created_at >= weekAgoIso).map(a => a.task_id)).size
      const weekQuiz = raw.quizAttempts.filter(a => a.student_id === child.id && a.created_at >= weekAgoIso).length
      const rating = ratingList(raw, st ?? [])
      const place = rating.find(r => r.student.id === child.id)
      const monthRating = ratingList(raw, st ?? [], currentMonth())
      const monthPlace = monthRating.find(r => r.student.id === child.id)
      if (!cancelled) setD({
        next: next?.[0], passed: passed ?? 0, hw: list, hwDone: list.filter(h => h.status === 'checked' || h.status === 'submitted').length,
        avg: t ? Math.round(c / t * 100) : null, plan, weekTasks, weekQuiz, place: place?.place, of: rating.length, monthPlace: monthPlace?.total > 0 ? monthPlace.place : null, monthPts: monthPlace?.total || 0,
        streak: streakInfo(raw.taskAttempts.filter(a => a.student_id === child.id), child.daily_goal || 1),
        fc: (() => { try { return forecast(raw, child.id) } catch { return null } })(),
        overdue: list.filter(h => h.status !== 'checked' && h.status !== 'submitted' && dueMoment(h) && dueMoment(h) < new Date()),
      })
    }
    load()
    return () => { cancelled = true }
  }, [child.id])

  if (!d) return <p className="muted">Загрузка…</p>
  return (
    <>
      <div className="stat-row">
        <div className="stat-box"><span className="stat-num green">{d.passed}</span><span className="stat-label">Занятий пройдено</span></div>
        <div className="stat-box"><span className="stat-num yellow">{d.hwDone}/{d.hw.length}</span><span className="stat-label">ДЗ сдано</span></div>
        <div className="stat-box"><span className="stat-num blue">{d.avg != null ? d.avg + '%' : '—'}</span><span className="stat-label">Точность ДЗ</span></div>
      </div>

      <section className="card highlight-card">
        <p className="eyebrow" style={{ marginTop: 0 }}>Следующее занятие</p>
        {d.next ? (
          <p className="card-title">{d.next.topic || d.next.title} · {new Date(d.next.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        ) : <p className="muted">Не запланировано</p>}
      </section>

      <section className="card">
        <p className="eyebrow" style={{ marginTop: 0 }}>Активность за неделю</p>
        <p className="muted">📝 Верно решено задач: <b style={{ color: 'var(--text)' }}>{d.weekTasks}</b></p>
        <p className="muted">🧠 Ответов в мини-тестах: <b style={{ color: 'var(--text)' }}>{d.weekQuiz}</b></p>
        <p className="muted">🔥 Серия занятий: <b style={{ color: 'var(--text)' }}>{d.streak.streak}</b> дн. подряд{d.streak.doneToday ? ' (сегодня уже занимался)' : ''}</p>
        {(child.target_score || d.fc?.byMocks != null || d.fc?.byBank != null) && (
          <p className="muted">🎯 Цель на ЕГЭ: <b style={{ color: 'var(--text)' }}>{child.target_score ?? 'не поставлена'}</b>{(d.fc?.byMocks ?? d.fc?.byBank) != null ? <> · прогноз <b style={{ color: 'var(--text)' }}>{d.fc.byMocks ?? d.fc.byBank}</b></> : ''}</p>
        )}
        <p className="muted">🏆 Рейтинг за {currentMonth().label.toLowerCase()}: {d.monthPlace ? <><b style={{ color: 'var(--yellow)' }}>{d.monthPlace} место</b> из {d.of} ({d.monthPts} очков)</> : 'пока нет очков'}</p>
        {d.place && <p className="muted">♾ За всё время: <b style={{ color: 'var(--yellow)' }}>{d.place}</b> из {d.of}</p>}
      </section>

      {d.overdue.length > 0 && (
        <section className="card status-bad">
          <p className="eyebrow" style={{ marginTop: 0 }}>Просроченные ДЗ</p>
          {d.overdue.map(h => <p key={h.id} className="muted">• {h.title} (до {fmtDue(h)})</p>)}
        </section>
      )}

      <section className="card">
        <p className="eyebrow" style={{ marginTop: 0 }}>Последние ДЗ</p>
        {d.hw.length === 0 && <p className="muted">Пока нет</p>}
        {d.hw.slice(0, 5).map(h => (
          <div key={h.id} className="row-between info-row">
            <span className="muted">{h.title}</span>
            <span>{h.status === 'checked' ? (h.total_tasks ? `${h.correct_tasks}/${h.total_tasks}` : '✅') : h.status === 'submitted' ? '⏳ на проверке' : '—'}</span>
          </div>
        ))}
      </section>

      <p className="eyebrow">Оплата</p>
      {!child.access_open && <section className="card status-bad"><p className="card-title" style={{ margin: 0 }}>🔒 Доступ к занятиям закрыт до оплаты</p></section>}
      {billing ? (
        <>
          <BillingCard status={billing.status} plan={billing.plan} />
          <PayBlock target={child} sentBy={me?.id} status={billing.status} plan={billing.plan} />
        </>
      ) : <p className="muted">Загрузка…</p>}
    </>
  )
}
