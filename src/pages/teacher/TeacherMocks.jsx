import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAll, shortName, numberOf } from '../../lib/progress'
import { useSettings, loadSettings, saveSetting, toTest, pointsFor, isPart1, fullMax, DEFAULT_POINTS, DEFAULT_SCALE } from '../../lib/settings'
import { loadExamSlots, sumScore, showAnswer } from '../../lib/mocks'
import { useTopics } from '../../components/TopicPicker'
import { AttachmentList } from '../../components/FileUploader'
import { Review } from '../Mocks'

export default function TeacherMocks() {
  const [exams, setExams] = useState(null)
  const [counts, setCounts] = useState({})
  const [openId, setOpenId] = useState(null)
  const [inbox, setInbox] = useState([])
  const [grading, setGrading] = useState(null)
  const [showScale, setShowScale] = useState(false)
  const settings = useSettings()

  async function load() {
    const [{ data: ex }, { data: at }, { data: wait }] = await Promise.all([
      supabase.from('mock_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('mock_attempts').select('exam_id, status'),
      supabase.from('mock_attempts').select('*').eq('status', 'submitted').order('submitted_at'),
    ])
    const ids = [...new Set((wait ?? []).map(a => a.student_id))]
    const { data: st } = ids.length ? await supabase.from('students').select('id, first_name, last_name').in('id', ids) : { data: [] }
    setInbox((wait ?? []).map(a => ({ a, exam: (ex ?? []).find(e => e.id === a.exam_id), student: (st ?? []).find(x => x.id === a.student_id) })).filter(r => r.exam))
    const c = {}
    ;(at ?? []).forEach(a => {
      if (!c[a.exam_id]) c[a.exam_id] = { done: 0, wait: 0 }
      if (a.status !== 'in_progress') c[a.exam_id].done++
      if (a.status === 'submitted') c[a.exam_id].wait++
    })
    setExams((ex ?? []).filter(e => !e.is_self)); setCounts(c)
  }
  useEffect(() => { load() }, [])

  async function create() {
    const title = 'Пробник ' + new Date().toLocaleDateString('ru-RU')
    const { data, error } = await supabase.from('mock_exams').insert({ title, time_limit_minutes: 235 }).select().single()
    if (error) return alert('Ошибка: ' + error.message)
    await load(); setOpenId(data.id)
  }

  if (grading) return (
    <div className="screen">
      <p className="card-title">{grading.exam.title}</p>
      <Grade exam={grading.exam} attempt={grading.a} student={grading.student} onBack={() => { setGrading(null); load() }} />
    </div>
  )
  const exam = exams?.find(e => e.id === openId)
  if (exam) return <ExamEditor exam={exam} onBack={() => { setOpenId(null); load() }} onChanged={load} />

  return (
    <div className="screen">
      <header className="screen-header"><h1>Пробники</h1></header>
      <p className="muted">Соберите вариант из банка заданий. Ученики увидят его, когда вы его опубликуете.</p>
      {inbox.length > 0 && (
        <section className="card status-bad">
          <p className="eyebrow" style={{ marginTop: 0 }}>📥 Ждут проверки второй части: {inbox.length}</p>
          {inbox.map(r => (
            <button key={r.a.id} className="subtopic-row" onClick={() => setGrading(r)}>
              <span className="subtopic-name">{shortName(r.student)} · {r.exam.is_self ? 'свой пробник' : r.exam.title}<br /><span className="muted small-text">{new Date(r.a.submitted_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · пока {r.a.score} из {r.a.max_score}</span></span>
              <span className="muted">›</span>
            </button>
          ))}
        </section>
      )}
      <button className="btn-primary block" onClick={create}>+ Новый пробник</button>
      <button className="btn-secondary block" onClick={() => setShowScale(!showScale)}>⚙️ Баллы за номера и шкала перевода</button>
      {showScale && <ScaleEditor />}
      {!exams ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {exams.length === 0 && <p className="muted">Пробников пока нет</p>}
          {exams.map(e => (
            <li key={e.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpenId(e.id)}>
              <div className="row-between">
                <p className="card-title">{e.title}</p>
                <span className={'tag ' + (e.is_published ? 'tag-green' : 'tag-yellow')}>{e.is_published ? 'Открыт' : 'Черновик'}</span>
              </div>
              <p className="muted small-text">
                Сдали: {counts[e.id]?.done || 0}
                {counts[e.id]?.wait ? ` · ждут проверки: ${counts[e.id].wait}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ================= Редактор пробника =================
function ExamEditor({ exam, onBack, onChanged }) {
  const { topics, subtopics } = useTopics()
  const [tab, setTab] = useState('tasks')
  const [form, setForm] = useState({ ...exam, audience: exam.student_id ? 'student:' + exam.student_id : exam.group_id ? 'group:' + exam.group_id : 'all' })
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [slots, setSlots] = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [msg, setMsg] = useState('')
  const [pickTopics, setPickTopics] = useState(null)
  const [adding, setAdding] = useState(false)

  async function loadSlots() { setSlots(await loadExamSlots(exam.id)) }
  useEffect(() => {
    loadSlots()
    supabase.from('groups').select('*').order('name').then(({ data }) => setGroups(data ?? []))
    supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).eq('is_parent', false).order('first_name').then(({ data }) => setStudents(data ?? []))
    fetchAll(() => supabase.from('tasks').select('id, topic_id, answer').order('id')).then(setAllTasks)
  }, [exam.id])

  const topicsWithTasks = useMemo(() => {
    const has = new Set(allTasks.map(t => t.topic_id))
    return topics.filter(t => has.has(t.id))
  }, [topics, allTasks])
  useEffect(() => { if (pickTopics === null && topicsWithTasks.length) setPickTopics(new Set(topicsWithTasks.map(t => t.id))) }, [topicsWithTasks])

  async function saveSettings(patch = {}) {
    const f = { ...form, ...patch }
    const [kind, id] = f.audience.split(':')
    const row = {
      title: f.title.trim() || 'Пробник', description: f.description?.trim() || null,
      time_limit_minutes: f.time_limit_minutes ? Number(f.time_limit_minutes) : null,
      group_id: kind === 'group' ? id : null, student_id: kind === 'student' ? id : null,
      is_published: !!f.is_published, show_solutions: !!f.show_solutions,
    }
    const { error } = await supabase.from('mock_exams').update(row).eq('id', exam.id)
    setForm(f)
    setMsg(error ? 'Ошибка: ' + error.message : 'Сохранено ✓'); setTimeout(() => setMsg(''), 2000)
    onChanged()
  }

  const settings = useSettings()
  const numOfTask = (t) => numberOf(topics.find(x => x.id === t.topic_id)?.name)
  // Баллы — из настроек по номеру; часть 1 с ответом-числом проверяется сама, остальное — учитель
  const defaults = (t) => {
    const n = numOfTask(t)
    return { points: n ? pointsFor(n, settings) : (t.answer ? 1 : 2), check_mode: (n ? isPart1(n) : true) && t.answer ? 'auto' : 'manual' }
  }
  const used = new Set((slots ?? []).map(s => s.task_id))
  const randomFrom = (topicId, exclude) => {
    const pool = allTasks.filter(t => t.topic_id === topicId && !exclude.has(t.id))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  const topicOrder = (topicId) => topics.findIndex(t => t.id === topicId)

  async function autoBuild() {
    if (slots.length && !confirm('Заменить текущие задания новым случайным вариантом?')) return
    const chosen = topicsWithTasks.filter(t => pickTopics.has(t.id)).sort((a, b) => topicOrder(a.id) - topicOrder(b.id))
    await supabase.from('mock_exam_tasks').delete().eq('exam_id', exam.id)
    const rows = []
    const ex = new Set()
    chosen.forEach((t, i) => {
      const task = randomFrom(t.id, ex)
      if (!task) return
      ex.add(task.id)
      rows.push({ exam_id: exam.id, task_id: task.id, position: i + 1, ...defaults(task) })
    })
    if (rows.length) await supabase.from('mock_exam_tasks').insert(rows)
    loadSlots()
  }

  async function replace(s) {
    const task = randomFrom(s.task.topic_id, used)
    if (!task) return alert('В этом номере больше нет других заданий')
    await supabase.from('mock_exam_tasks').update({ task_id: task.id, ...defaults(task) }).eq('id', s.id)
    loadSlots()
  }
  async function removeSlot(s) { await supabase.from('mock_exam_tasks').delete().eq('id', s.id); loadSlots() }
  async function updateSlot(s, patch) {
    await supabase.from('mock_exam_tasks').update(patch).eq('id', s.id)
    setSlots(prev => prev.map(x => x.id === s.id ? { ...x, ...patch } : x))
  }
  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= slots.length) return
    await supabase.from('mock_exam_tasks').update({ position: j + 1 }).eq('id', slots[i].id)
    await supabase.from('mock_exam_tasks').update({ position: i + 1 }).eq('id', slots[j].id)
    loadSlots()
  }
  async function addTask(task) {
    const { error } = await supabase.from('mock_exam_tasks').insert({ exam_id: exam.id, task_id: task.id, position: slots.length + 1, ...defaults(task) })
    if (error) return alert('Ошибка: ' + error.message)
    loadSlots()
  }
  async function deleteExam() {
    if (!confirm(`Удалить «${exam.title}» вместе с результатами учеников?`)) return
    await supabase.from('mock_exams').delete().eq('id', exam.id); onBack()
  }

  const maxScore = (slots ?? []).reduce((s, x) => s + x.points, 0)

  return (
    <div className="screen">
      <button className="btn-secondary" onClick={onBack}>← Все пробники</button>
      <header className="screen-header"><h1>{form.title}</h1></header>
      <div className="chip-wrap">
        {[['tasks', '📋 Задания'], ['settings', '⚙️ Настройки'], ['results', '📊 Результаты']].map(([k, l]) => (
          <button key={k} className={'filter-chip' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="card task-form">
          <p className="eyebrow">Название</p>
          <input className="text-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <textarea className="text-input" rows={2} placeholder="Описание (необязательно)" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          <p className="eyebrow">Время, минут (пусто — без ограничения)</p>
          <input className="text-input" type="number" value={form.time_limit_minutes ?? ''} onChange={e => setForm({ ...form, time_limit_minutes: e.target.value })} />
          <p className="eyebrow">Кому доступен</p>
          <select className="text-input" value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>
            <option value="all">Всем ученикам</option>
            {groups.map(g => <option key={g.id} value={'group:' + g.id}>Группа: {g.name}</option>)}
            {students.map(s => <option key={s.id} value={'student:' + s.id}>Ученик: {s.first_name} {s.last_name}</option>)}
          </select>
          <label className="checkbox-row"><input type="checkbox" checked={!!form.show_solutions} onChange={e => setForm({ ...form, show_solutions: e.target.checked })} /> Показывать решения после сдачи</label>
          <label className="checkbox-row"><input type="checkbox" checked={!!form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} /> Опубликован (ученики видят)</label>
          {msg && <p className="muted">{msg}</p>}
          <button className="btn-primary block" onClick={() => saveSettings()}>Сохранить</button>
          <button className="btn-secondary block" onClick={deleteExam}>🗑 Удалить пробник</button>
        </div>
      )}

      {tab === 'tasks' && (
        <>
          <section className={'card ' + (form.is_published ? 'status-ok' : '')}>
            <div className="row-between">
              <span className="muted">{form.is_published ? '✅ Ученики видят пробник' : '📝 Черновик — ученики не видят'}</span>
              <button className="btn-secondary" onClick={() => saveSettings({ is_published: !form.is_published })}>{form.is_published ? 'Скрыть' : 'Опубликовать'}</button>
            </div>
            <p className="muted small-text">Заданий: {slots?.length ?? 0} · максимум баллов: {maxScore}</p>
            <p className="muted small-text">Меняйте задания до того, как ученики начнут решать: иначе их ответы не совпадут с новыми заданиями.</p>
          </section>

          <section className="card">
            <p className="eyebrow" style={{ marginTop: 0 }}>Собрать вариант автоматически</p>
            <p className="muted small-text">По одному случайному заданию из каждого отмеченного номера.</p>
            <div className="chip-wrap">
              {topicsWithTasks.map(t => {
                const on = pickTopics?.has(t.id)
                return (
                  <button key={t.id} className={'filter-chip' + (on ? ' active' : '')} onClick={() => {
                    const n = new Set(pickTopics); on ? n.delete(t.id) : n.add(t.id); setPickTopics(n)
                  }}>{t.name.match(/№\s*\d+/)?.[0] || t.name}</button>
                )
              })}
            </div>
            <button className="btn-primary block" disabled={!pickTopics?.size} onClick={autoBuild}>🎲 Собрать ({pickTopics?.size || 0} заданий)</button>
          </section>

          {!slots ? <p className="muted">Загрузка…</p> : slots.map((s, i) => (
            <div key={s.id} className="task-card">
              <div className="row-between">
                <span className="task-num">{i + 1}. №{s.num}</span>
                <div className="row-center" style={{ gap: 4 }}>
                  <button className="file-move" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="file-move" disabled={i === slots.length - 1} onClick={() => move(i, 1)}>▼</button>
                  <button className="file-move" title="Другое задание этого номера" onClick={() => replace(s)}>🔀</button>
                  <button className="file-remove" onClick={() => removeSlot(s)}>✕</button>
                </div>
              </div>
              {s.task.condition && <p className="task-text clamp">{s.task.condition}</p>}
              <AttachmentList items={s.task.condition_attachments} full />
              <div className="row-center" style={{ gap: 8, flexWrap: 'wrap' }}>
                <select className="inline-input mode-select" value={s.check_mode} onChange={e => updateSlot(s, { check_mode: e.target.value })}>
                  <option value="auto" disabled={!s.task.answer}>По ответу (сам)</option>
                  <option value="manual">Проверяю я</option>
                </select>
                <span className="muted small-text">баллов:</span>
                <input className="inline-input" type="number" min="1" max="10" value={s.points} onChange={e => updateSlot(s, { points: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 60 }} />
              </div>
              <p className="muted small-text">Ответ: {s.task.answer ? showAnswer(s.task.answer) : 'картинкой / проверяет учитель'}</p>
            </div>
          ))}

          {adding
            ? <TaskPicker topics={topics} subtopics={subtopics} used={used} onAdd={addTask} onClose={() => setAdding(false)} />
            : <button className="btn-secondary block" onClick={() => setAdding(true)}>+ Добавить задание из банка</button>}
        </>
      )}

      {tab === 'results' && <Results exam={exam} />}
    </div>
  )
}

function TaskPicker({ topics, subtopics, used, onAdd, onClose }) {
  const [topicId, setTopicId] = useState('')
  const [subId, setSubId] = useState('')
  const [tasks, setTasks] = useState([])
  useEffect(() => {
    if (!subId) return setTasks([])
    supabase.from('tasks').select('*').eq('subtopic_id', subId).order('position').then(({ data }) => setTasks(data ?? []))
  }, [subId])
  const subs = subtopics.filter(s => s.topic_id === topicId)
  return (
    <div className="card task-form">
      <p className="eyebrow">Добавить из банка</p>
      <select className="text-input" value={topicId} onChange={e => { setTopicId(e.target.value); setSubId('') }}>
        <option value="">Выберите номер</option>
        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {topicId && (
        <select className="text-input" value={subId} onChange={e => setSubId(e.target.value)}>
          <option value="">Выберите тему</option>
          {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {tasks.map((t, i) => (
        <div key={t.id} className="task-card">
          <div className="row-between">
            <span className="task-num">Задание {i + 1}</span>
            {used.has(t.id) ? <span className="tag tag-green">в пробнике</span> : <button className="btn-secondary" onClick={() => onAdd(t)}>+ Добавить</button>}
          </div>
          {t.condition && <p className="task-text clamp">{t.condition}</p>}
          <AttachmentList items={t.condition_attachments} full />
        </div>
      ))}
      {subId && tasks.length === 0 && <p className="muted">В этой теме нет заданий</p>}
      <button className="btn-secondary block" onClick={onClose}>Закрыть</button>
    </div>
  )
}

// ================= Результаты и проверка =================
function Results({ exam }) {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [grading, setGrading] = useState(null)
  const settings = useSettings()

  async function load() {
    const { data } = await supabase.from('mock_attempts').select('*').eq('exam_id', exam.id).neq('status', 'in_progress').order('submitted_at', { ascending: false })
    const ids = [...new Set((data ?? []).map(a => a.student_id))]
    if (ids.length) {
      const { data: st } = await supabase.from('students').select('id, first_name, last_name').in('id', ids)
      const m = {}; (st ?? []).forEach(s => { m[s.id] = s }); setNames(m)
    }
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [exam.id])

  if (grading) return <Grade exam={exam} attempt={grading} student={names[grading.student_id]} onBack={() => { setGrading(null); load() }} />
  if (!rows) return <p className="muted">Загрузка…</p>
  if (!rows.length) return <p className="muted">Ещё никто не сдал</p>
  return (
    <ul className="card-list">
      {rows.map(a => (
        <li key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setGrading(a)}>
          <div className="row-between">
            <div>
              <p className="card-title small">{shortName(names[a.student_id])}</p>
              <p className="muted small-text">{new Date(a.submitted_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="score-badge">{a.score}/{a.max_score} → {toTest(a.score, settings.scale)}</span>
              {a.status === 'submitted' && <p className="tag tag-yellow" style={{ margin: '4px 0 0' }}>проверить</p>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Grade({ exam, attempt, student, onBack }) {
  const settings = useSettings()
  const [answers, setAnswers] = useState(attempt.answers || {})
  const [comment, setComment] = useState(attempt.teacher_comment || '')
  const [saving, setSaving] = useState(false)

  function setGot(slotId, v, max) {
    const got = v === '' ? null : Math.min(max, Math.max(0, Number(v)))
    setAnswers(prev => ({ ...prev, [slotId]: { ...(prev[slotId] || {}), got } }))
  }
  async function save() {
    setSaving(true)
    const pending = Object.values(answers).some(a => a.got == null)
    const { error } = await supabase.from('mock_attempts').update({
      answers, score: sumScore(answers), teacher_comment: comment.trim() || null, status: pending ? 'submitted' : 'checked',
    }).eq('id', attempt.id)
    setSaving(false)
    if (error) return alert('Ошибка: ' + error.message)
    onBack()
  }

  const live = { ...attempt, answers, score: sumScore(answers) }
  return (
    <>
      <button className="btn-secondary" onClick={onBack}>← К результатам</button>
      <p className="muted">Ученик: <b style={{ color: 'var(--text)' }}>{student ? `${student.first_name} ${student.last_name || ''}` : '—'}</b></p>
      <Review exam={{ ...exam, show_solutions: true }} attempt={live} onBack={onBack} embedded footer={(s, a) => (
        <div className="row-center grade-row">
          <span className="muted small-text">Баллы:</span>
          {Array.from({ length: s.points + 1 }, (_, v) => (
            <button key={v} className={'filter-chip' + (a.got === v ? ' active' : '')} onClick={() => setGot(s.id, v, s.points)}>{v}</button>
          ))}
        </div>
      )} />
      <div className="card task-form">
        <p className="eyebrow">Комментарий ученику</p>
        <textarea className="text-input" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
        <p className="muted">Итого: <b style={{ color: 'var(--yellow)' }}>{live.score} из {attempt.max_score}</b> первичных → <b style={{ color: 'var(--accent2)' }}>{toTest(live.score, settings.scale)}</b> тестовых</p>
        <button className="btn-primary block" disabled={saving} onClick={save}>{saving ? 'Сохранение…' : '✅ Сохранить проверку'}</button>
      </div>
    </>
  )
}

// ================= Баллы и шкала =================
function ScaleEditor() {
  const [pts, setPts] = useState(null)
  const [scale, setScale] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { loadSettings(true).then(s => { setPts({ ...s.points }); setScale({ ...s.scale }) }) }, [])
  if (!pts) return <p className="muted">Загрузка…</p>

  const nums = Object.keys(pts).map(Number).sort((a, b) => a - b)
  const max = fullMax({ points: pts })
  const prim = Array.from({ length: max }, (_, i) => i + 1)

  async function save() {
    const cleanPts = {}; nums.forEach(n => { cleanPts[n] = Math.max(0, Number(pts[n]) || 0) })
    const cleanScale = {}; prim.forEach(p => { cleanScale[p] = Math.min(100, Math.max(0, Number(scale[p]) || 0)) })
    const e1 = await saveSetting('points_by_number', cleanPts)
    const e2 = await saveSetting('score_scale', cleanScale)
    setMsg(e1 || e2 ? 'Ошибка: ' + (e1 || e2).message : 'Сохранено ✓ Новые пробники будут собираться с этими баллами.')
  }
  function reset() {
    if (!confirm('Вернуть баллы и шкалу «прогноз 2027»?')) return
    setPts({ ...DEFAULT_POINTS }); setScale({ ...DEFAULT_SCALE })
  }

  return (
    <div className="card task-form">
      <p className="eyebrow" style={{ marginTop: 0 }}>Баллы за номер (первичные)</p>
      <div className="scale-grid">
        {nums.map(n => (
          <label key={n} className="scale-cell">
            <span>№{n}</span>
            <input type="number" min="0" max="10" value={pts[n]} onChange={e => setPts({ ...pts, [n]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="muted small-text">Максимум за полный вариант: <b>{max}</b> первичных. №1–13 — первая часть, проверяется автоматически.</p>

      <p className="eyebrow">Шкала: первичный → тестовый</p>
      <div className="scale-grid">
        {prim.map(p => (
          <label key={p} className={'scale-cell' + (p < 5 ? ' below' : '')}>
            <span>{p}</span>
            <input type="number" min="0" max="100" value={scale[p] ?? ''} onChange={e => setScale({ ...scale, [p]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="muted small-text">Красным — ниже минимального порога. Когда ФИПИ опубликует официальную шкалу, просто замените числа.</p>
      {msg && <p className="muted">{msg}</p>}
      <div className="btn-row">
        <button className="btn-primary" onClick={save}>Сохранить</button>
        <button className="btn-secondary" onClick={reset}>Прогноз 2027</button>
      </div>
    </div>
  )
}
