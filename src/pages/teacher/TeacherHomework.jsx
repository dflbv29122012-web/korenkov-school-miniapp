import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/storage'
import FileUploader, { AttachmentList, AttachmentEditor } from '../../components/FileUploader'
import { useDraft } from '../../context/DraftContext'
import TopicPicker, { useTopics } from '../../components/TopicPicker'
import AutoHomework, { newBlock } from './AutoHomework'
import DueEditor from '../../components/DueEditor'
import { dueFields, dueParts, fmtDue } from '../../lib/due'
import { loadSeen, pickTasks, taskTitle, shortName } from '../../lib/autohw'

export const HW_EMPTY = {
  mode: 'students',         // 'students' | 'groups' | 'all'
  studentIds: [],
  groupIds: [],
  title: '', description: '', due_date: '', due_time: '',
  topic_id: null, subtopic_id: null,
  files: [],
  tasks: [{ title: 'Задание 1', max_score: 1 }],
  open: false,
  blocks: [], bank: [], fresh: true, perStudent: false, lessonTopic: '',
}

export default function TeacherHomework() {
  const [draft, setDraft, clearDraft] = useDraft('teacher-homework', HW_EMPTY)
  const { topics, subtopics } = useTopics()
  const [viewFilter, setViewFilter] = useState({ kind: 'all', id: null })
  const [viewTopic, setViewTopic] = useState(null)
  const [items, setItems] = useState([])
  const [students, setStudents] = useState([])
  const [groups, setGroups] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [openId, setOpenId] = useState(null)
  const [tasksByHw, setTasksByHw] = useState({})
  const [subsByHw, setSubsByHw] = useState({})
  const [editAttach, setEditAttach] = useState(null)
  const [editNewFiles, setEditNewFiles] = useState([])
  const [editSaving, setEditSaving] = useState(false)

  const up = (patch) => setDraft({ ...draft, ...patch })

  async function loadAll() {
    setLoading(true)
    const [{ data: hw }, { data: st }, { data: gr }, { data: ln }] = await Promise.all([
      supabase.from('homework').select('*, students(first_name,last_name,grade_level), topics(name), subtopics(name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('students').select('id, first_name, last_name').eq('is_teacher', false).eq('is_parent', false).order('first_name'),
      supabase.from('groups').select('*').order('name'),
      supabase.from('student_groups').select('*'),
    ])
    setItems(hw ?? []); setStudents(st ?? []); setGroups(gr ?? []); setLinks(ln ?? [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  async function openCard(hw) {
    const next = openId === hw.id ? null : hw.id
    setOpenId(next); setEditAttach(null)
    if (next) {
      if (!tasksByHw[hw.id]) {
        const { data } = await supabase.from('homework_tasks').select('*').eq('homework_id', hw.id).order('position')
        setTasksByHw(p => ({ ...p, [hw.id]: data ?? [] }))
      }
      if (!subsByHw[hw.id]) {
        const { data } = await supabase.from('homework_submissions').select('*').eq('homework_id', hw.id).order('attempt')
        setSubsByHw(p => ({ ...p, [hw.id]: data ?? [] }))
      }
    }
  }

  function resolveTargets() {
    if (draft.mode === 'all') return students.map(s => s.id)
    if (draft.mode === 'groups') {
      const ids = new Set()
      links.filter(l => draft.groupIds.includes(l.group_id)).forEach(l => ids.add(l.student_id))
      return [...ids]
    }
    return draft.studentIds
  }

  async function addHomework() {
    setError('')
    const targets = resolveTargets()
    if (targets.length === 0) return setError('Выберите хотя бы одного ученика или группу')
    const blocks = (draft.blocks || []).filter(b => b.topic_id)
    const hasAuto = blocks.length > 0
    if (hasAuto && !draft.perStudent && (draft.bank || []).length === 0) return setError('Нажмите «Собрать задачи» или уберите блок с банком')

    setSaving(true)
    try {
      const topicName = (id) => topics.find(t => t.id === id)?.name || ''
      const subName = (id) => subtopics.find(t => t.id === id)?.name || ''

      let attachments = []
      if (draft.files.length > 0) {
        attachments = await uploadFiles('attachments', draft.files, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
      }
      setProgress(`Создание ДЗ для ${targets.length} чел…`)

      // задачи из банка для каждого ученика
      const bankFor = {}
      if (hasAuto) {
        if (draft.perStudent) {
          const seen = draft.fresh !== false ? await loadSeen(targets) : {}
          for (const sid of targets) {
            setProgress('Подбираю задачи…')
            const { picked } = await pickTasks(blocks, seen[sid] || new Set(), topicName, subName)
            bankFor[sid] = picked
          }
        } else {
          const { data: chosen } = await supabase.from('tasks').select('id, topic_id, subtopic_id, position, answer').in('id', draft.bank.map(t => t.id))
          const byId = Object.fromEntries((chosen ?? []).map(t => [t.id, t]))
          const list = draft.bank.map(t => byId[t.id]).filter(Boolean)
          targets.forEach(sid => { bankFor[sid] = list })
        }
      }

      // обычные задания; «Задание N» по умолчанию не берём, если есть банк
      const manual = draft.tasks.filter(t => t.title?.trim() && !(hasAuto && /^Задание \d+$/.test(t.title.trim())))

      const rowsHw = targets.map(sid => {
        const bank = bankFor[sid] || []
        const topicIds = new Set(bank.map(t => t.topic_id))
        const tids = [...new Set(bank.map(t => t.topic_id))]
        const auto = [...new Set(tids.map(id => shortName(topicName(id))))].join(', ')
        return {
          student_id: sid,
          title: draft.title.trim() || (draft.lessonTopic ? `ДЗ: ${draft.lessonTopic}` : auto ? `ДЗ: ${auto}` : 'Домашнее задание'),
          description: draft.description || null,
          ...dueFields(draft.due_date, draft.due_time),
          status: 'assigned',
          attachments,
          total_tasks: bank.length + manual.reduce((s, t) => s + (Number(t.max_score) || 0), 0),
          topic_id: hasAuto ? (topicIds.size === 1 ? [...topicIds][0] : null) : draft.topic_id,
          subtopic_id: hasAuto ? null : draft.subtopic_id,
        }
      })
      const { data: created, error: err } = await supabase.from('homework').insert(rowsHw).select()
      if (err) throw err

      const rows = []
      created.forEach(hw => {
        let pos = 0
        ;(bankFor[hw.student_id] || []).forEach(t => rows.push({
          homework_id: hw.id, position: ++pos, title: taskTitle(t, topicName, subName), max_score: 1, task_id: t.id, is_auto: !!t.answer,
        }))
        manual.forEach(t => rows.push({ homework_id: hw.id, position: ++pos, title: t.title.trim(), max_score: Number(t.max_score) || 1 }))
      })
      if (rows.length > 0) {
        const { error: tErr } = await supabase.from('homework_tasks').insert(rows)
        if (tErr) throw tErr
      }

      clearDraft()
      loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally { setSaving(false); setProgress('') }
  }

  async function saveGrade(hw) {
    const list = tasksByHw[hw.id] || []
    for (const t of list) {
      await supabase.from('homework_tasks').update({
        score: t.score === '' || t.score == null ? null : Number(t.score),
        comment: t.comment || null,
      }).eq('id', t.id)
    }
    const totalMax = list.reduce((s, t) => s + (Number(t.max_score) || 0), 0)
    const totalScore = list.reduce((s, t) => s + (Number(t.score) || 0), 0)
    await supabase.from('homework').update({
      status: 'checked', correct_tasks: totalScore, total_tasks: totalMax,
    }).eq('id', hw.id)
    loadAll(); setOpenId(null)
  }

  async function setDue(hw, date, time) {
    const f = dueFields(date, time)
    const { error: err } = await supabase.from('homework').update(f).eq('id', hw.id)
    if (err) return setError('Не удалось сохранить дедлайн: ' + err.message + ' (выполнили ОБНОВЛЕНИЕ_16.sql?)')
    setItems(list => list.map(x => x.id === hw.id ? { ...x, ...f } : x))
  }

  async function deleteHomework(hw) {
    if (!confirm(`Удалить ДЗ «${hw.title}» целиком?\n\nИсчезнут все задания, ответы и оценки по нему. Отменить нельзя.`)) return
    const { error: err } = await supabase.from('homework').delete().eq('id', hw.id)
    if (err) return setError('Не удалось удалить: ' + err.message)
    loadAll(); setOpenId(null)
  }

  async function reopenForRework(hw) {
    await supabase.from('homework').update({ status: 'assigned' }).eq('id', hw.id)
    loadAll(); setOpenId(null)
  }

  async function saveAttachments(hw) {
    setEditSaving(true)
    try {
      let finalAttachments = editAttach
      if (editNewFiles.length > 0) {
        const uploaded = await uploadFiles('attachments', editNewFiles, (i, t) => setProgress(`Загрузка ${i} из ${t}…`))
        finalAttachments = [...editAttach, ...uploaded]
      }
      await supabase.from('homework').update({ attachments: finalAttachments }).eq('id', hw.id)
      setEditAttach(null); setEditNewFiles([]); setProgress('')
      loadAll()
    } catch (e) {
      setError('Ошибка: ' + e.message)
    } finally {
      setEditSaving(false)
    }
  }

  function updTask(hwId, taskId, field, value) {
    setTasksByHw(p => ({ ...p, [hwId]: (p[hwId] || []).map(t => t.id === taskId ? { ...t, [field]: value } : t) }))
  }

  const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
  const groupStudentIds = viewFilter.kind === 'group'
    ? new Set(links.filter(l => l.group_id === viewFilter.id).map(l => l.student_id))
    : null
  const visibleItems = items.filter(hw => {
    if (viewFilter.kind === 'student' && hw.student_id !== viewFilter.id) return false
    if (viewFilter.kind === 'group' && !groupStudentIds.has(hw.student_id)) return false
    if (viewTopic && hw.topic_id !== viewTopic) return false
    return true
  })
  const submittedCount = items.filter(h => h.status === 'submitted').length
  const targetCount = resolveTargets().length

  return (
    <div className="screen">
      <div className="row-between">
        <h1>Домашние задания</h1>
        {submittedCount > 0 && <span className="tag tag-blue">{submittedCount} на проверке</span>}
      </div>

      {!draft.open ? (
        <button className="btn-primary block" onClick={() => up({ open: true })}>+ Задать ДЗ</button>
      ) : (
        <div className="card">
          <p className="eyebrow">Кому задать</p>
          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            <button className={'filter-chip' + (draft.mode === 'students' ? ' active' : '')} onClick={() => up({ mode: 'students' })}>👤 Выбрать учеников</button>
            <button className={'filter-chip' + (draft.mode === 'groups' ? ' active' : '')} onClick={() => up({ mode: 'groups' })}>👥 Группы</button>
            <button className={'filter-chip' + (draft.mode === 'all' ? ' active' : '')} onClick={() => up({ mode: 'all' })}>🌐 Всем</button>
          </div>

          {draft.mode === 'students' && (
            <div className="pick-list">
              {students.map(s => (
                <label key={s.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.studentIds.includes(s.id)}
                    onChange={() => up({ studentIds: toggleIn(draft.studentIds, s.id) })} />
                  {s.first_name} {s.last_name}
                </label>
              ))}
            </div>
          )}
          {draft.mode === 'groups' && (
            <div className="pick-list">
              {groups.map(g => (
                <label key={g.id} className="checkbox-row">
                  <input type="checkbox" checked={draft.groupIds.includes(g.id)}
                    onChange={() => up({ groupIds: toggleIn(draft.groupIds, g.id) })} />
                  {g.name} <span className="muted">({links.filter(l => l.group_id === g.id).length} чел.)</span>
                </label>
              ))}
            </div>
          )}
          <p className="muted small-text">Получателей: {targetCount}</p>

          <input className="text-input" placeholder={draft.lessonTopic ? `Название ДЗ (если пусто — «ДЗ: ${draft.lessonTopic}»)` : "Название ДЗ (необязательно)"} value={draft.title} onChange={e => up({ title: e.target.value })} />
          <textarea className="text-input" placeholder="Описание" value={draft.description} onChange={e => up({ description: e.target.value })} />
          <p className="eyebrow">⏰ Дедлайн (сдать до)</p>
          <DueEditor date={draft.due_date} time={draft.due_time} onChange={(d, t) => up({ due_date: d, due_time: t })} />

          <AutoHomework draft={draft} up={up} topics={topics} subtopics={subtopics} targets={resolveTargets()} />

          <p className="eyebrow">Папка (номер и тема)</p>
          <TopicPicker topics={topics} subtopics={subtopics}
            topicId={draft.topic_id} subtopicId={draft.subtopic_id} onChange={p => up(p)} />

          <FileUploader files={draft.files} onChange={f => up({ files: f })}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            label="Прикрепить фото и файлы" />

          <p className="eyebrow">Задания и баллы</p>
          {draft.tasks.map((t, i) => (
            <div key={i} className="btn-row">
              <input className="text-input" placeholder={`Задание ${i + 1}`} value={t.title}
                onChange={e => up({ tasks: draft.tasks.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
              <input type="number" min="1" className="text-input score-input" value={t.max_score}
                onChange={e => up({ tasks: draft.tasks.map((x, j) => j === i ? { ...x, max_score: e.target.value } : x) })} />
              {draft.tasks.length > 1 && <button className="file-remove" onClick={() => up({ tasks: draft.tasks.filter((_, j) => j !== i) })}>✕</button>}
            </div>
          ))}
          <button className="btn-secondary block" onClick={() => up({ tasks: [...draft.tasks, { title: `Задание ${draft.tasks.length + 1}`, max_score: 1 }] })}>
            + Добавить задание
          </button>
          <p className="muted small-text">Максимум: {draft.tasks.reduce((s, t) => s + (Number(t.max_score) || 0), 0)} баллов</p>

          {error && <p className="error-text">⚠️ {error}</p>}
          {progress && <p className="muted">{progress}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={saving} onClick={addHomework}>{saving ? 'Сохранение…' : 'Отправить'}</button>
            <button className="btn-secondary" onClick={() => up({ open: false })}>Свернуть</button>
            <button className="btn-secondary" onClick={clearDraft}>Очистить</button>
          </div>
        </div>
      )}

      <p className="eyebrow">Показать</p>
      <div className="filter-row">
        <button className={'filter-chip' + (viewFilter.kind === 'all' ? ' active' : '')}
          onClick={() => setViewFilter({ kind: 'all', id: null })}>🌐 Все</button>
        {groups.map(g => (
          <button key={g.id} className={'filter-chip' + (viewFilter.id === g.id ? ' active' : '')}
            onClick={() => setViewFilter({ kind: 'group', id: g.id })}>👥 {g.name}</button>
        ))}
        {students.map(st => (
          <button key={st.id} className={'filter-chip' + (viewFilter.id === st.id ? ' active' : '')}
            onClick={() => setViewFilter({ kind: 'student', id: st.id })}>👤 {st.first_name}</button>
        ))}
      </div>

      <div className="filter-row">
        <button className={'filter-chip' + (viewTopic === null ? ' active' : '')} onClick={() => setViewTopic(null)}>📂 Все номера</button>
        {topics.map(t => (
          <button key={t.id} className={'filter-chip' + (viewTopic === t.id ? ' active' : '')}
            onClick={() => setViewTopic(t.id)}>📁 {t.name}</button>
        ))}
      </div>

      {loading ? <p className="muted">Загрузка…</p> : (
        <ul className="card-list">
          {visibleItems.length === 0 && <p className="muted">Ничего не найдено по этому фильтру.</p>}
          {visibleItems.map(hw => {
            const list = tasksByHw[hw.id] || []
            const subs = subsByHw[hw.id] || []
            const curMax = list.reduce((s, t) => s + (Number(t.max_score) || 0), 0)
            const curScore = list.reduce((s, t) => s + (Number(t.score) || 0), 0)
            return (
              <li key={hw.id} className="card">
                <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => openCard(hw)}>
                  <div>
                    <p className="card-title">{hw.title}</p>
                    <p className="muted">{hw.students ? `${hw.students.first_name} ${hw.students.last_name || ''}` : ''}</p>
                    {hw.topics && <p className="muted small-text">📁 {hw.topics.name}{hw.subtopics ? ` → ${hw.subtopics.name}` : ''}</p>}
                    <p className="muted small-text">{hw.due_date ? `⏰ До ${fmtDue(hw)}` : '⏰ Без дедлайна'}</p>
                  </div>
                  {hw.status === 'submitted' ? <span className="tag tag-blue">📨 Проверить</span>
                    : hw.status === 'checked' ? <span className="tag tag-green">{hw.correct_tasks}/{hw.total_tasks}</span>
                    : <span className="tag tag-yellow">Не сдано</span>}
                </div>

                {openId === hw.id && (
                  <div className="card-details">
                    <p className="eyebrow">⏰ Дедлайн</p>
                    <DueEditor date={dueParts(hw).date} time={dueParts(hw).time} onChange={(d, t) => setDue(hw, d, t)} />
                    <p className="eyebrow">Файлы задания</p>
                    {editAttach ? (
                      <>
                        <AttachmentEditor items={editAttach} onChange={setEditAttach} />
                        <p className="eyebrow">Добавить ещё файлы</p>
                        <FileUploader files={editNewFiles} onChange={setEditNewFiles} accept="image/*,video/*,.pdf,.doc,.docx" label="Выбрать новые файлы" />
                        <div className="btn-row">
                          <button className="btn-primary" disabled={editSaving} onClick={() => saveAttachments(hw)}>{editSaving ? 'Сохранение…' : 'Сохранить'}</button>
                          <button className="btn-secondary" onClick={() => { setEditAttach(null); setEditNewFiles([]) }}>Отмена</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <AttachmentList items={hw.attachments} />
                        {hw.attachments?.length > 0 &&
                          <button className="btn-secondary block" onClick={() => { setEditAttach(hw.attachments); setEditNewFiles([]) }}>✏️ Изменить порядок / удалить</button>}
                      </>
                    )}

                    {subs.length > 0 && (
                      <>
                        <p className="eyebrow">Сдачи ученика ({subs.length})</p>
                        {subs.map(s => (
                          <div key={s.id} className="task-grade">
                            <p className={s.is_late ? 'late-time' : 'ontime-time'}>
                              Попытка {s.attempt} · {new Date(s.submitted_at).toLocaleString('ru-RU')} {s.is_late ? '(после дедлайна)' : '(в срок)'}
                            </p>
                            {s.comment && <p className="muted">💬 {s.comment}</p>}
                            <AttachmentList items={s.attachments} compact />
                          </div>
                        ))}
                      </>
                    )}

                    <p className="eyebrow">Оценка по заданиям</p>
                    {list.map(t => (
                      <div key={t.id} className="task-grade">
                        <div className="row-between">
                          <span className="card-title">{t.title}</span>
                          <span>
                            <input type="number" min="0" max={t.max_score} className="score-input inline-input"
                              value={t.score ?? ''} placeholder="—"
                              onChange={e => updTask(hw.id, t.id, 'score', e.target.value)} />
                            <span className="muted"> / {t.max_score}</span>
                          </span>
                        </div>
                        {t.task_id && <p className="muted small-text">Ответ ученика: <b>{t.student_answer || '—'}</b>{t.is_auto ? ' (проверено автоматически)' : ' (проверьте вручную)'}</p>}
                        <input className="text-input" placeholder="Комментарий к заданию"
                          value={t.comment ?? ''} onChange={e => updTask(hw.id, t.id, 'comment', e.target.value)} />
                      </div>
                    ))}
                    {list.length > 0 && (
                      <>
                        <p className="score-line">Итого: {curScore} / {curMax}</p>
                        <button className="btn-primary block" onClick={() => saveGrade(hw)}>✅ Отправить результат</button>
                      </>
                    )}
                    {hw.status === 'checked' && (
                      <button className="btn-secondary block" onClick={() => reopenForRework(hw)}>🔄 Вернуть на доработку</button>
                    )}
                    <button className="btn-secondary block" style={{ color: 'var(--red, #ff6b6b)' }} onClick={() => deleteHomework(hw)}>🗑 Удалить ДЗ целиком</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
