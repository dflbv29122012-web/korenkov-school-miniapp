import { useEffect, useState } from 'react'
import { safeUrl, isSafeUrl } from '../../lib/safeUrl'
import { loadFull, loadSeen, pickTasks, shortName } from '../../lib/autohw'
import { AttachmentList } from '../../components/FileUploader'
import { answerImages, solutionImages } from '../../components/TaskBank'

export const newBlock = () => ({ topic_id: '', subtopic_id: '', mode: 'random', count: 3, pickedIds: [] })

// Конструктор: номера / разделы / конкретные задачи из банка
export default function AutoHomework({ draft, up, topics, subtopics, targets }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pools, setPools] = useState({}) // индекс блока -> задачи для ручного выбора
  const [sol, setSol] = useState({})

  const blocks = draft.blocks || []
  const topicName = (id) => topics.find(t => t.id === id)?.name || ''
  const subName = (id) => subtopics.find(s => s.id === id)?.name || ''
  const setBlock = (i, patch) => up({ blocks: blocks.map((b, j) => j === i ? { ...b, ...patch } : b), bank: [] })
  const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  // для блоков «вручную» подгружаем полные задачи (и при смене номера/раздела, и после возврата на экран)
  const pickKey = blocks.map(b => b.mode === 'pick' ? `${b.topic_id}|${b.subtopic_id}` : '-').join(',')
  useEffect(() => {
    blocks.forEach((b, i) => { if (b.mode === 'pick' && b.topic_id) loadManual(i, b) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey])

  async function loadManual(i, b) {
    const list = await loadFull(b)
    setPools(p => ({ ...p, [i]: list }))
  }

  async function build() {
    setMsg('')
    const ok = blocks.filter(b => b.topic_id)
    if (!ok.length) return setMsg('Выберите номер')
    setBusy(true)
    try {
      let skip = new Set()
      if (draft.fresh !== false && targets.length) {
        const seen = await loadSeen(targets)
        Object.values(seen).forEach(s => s.forEach(id => skip.add(id)))
      }
      const { picked, short } = await pickTasks(ok, skip, topicName, subName)
      up({
        bank: picked.map(t => ({ id: t.id, topic_id: t.topic_id, subtopic_id: t.subtopic_id, position: t.position, snippet: (t.condition || '').slice(0, 80) || '(условие картинкой)', hasAnswer: !!t.answer })),
      })
      setMsg(short.length ? '⚠️ ' + short.join('; ') : picked.length ? '' : 'Задач не нашлось')
    } catch (e) { setMsg('Ошибка: ' + e.message) }
    setBusy(false)
  }

  const bank = draft.bank || []
  const label = (t) => `${shortName(topicName(t.topic_id))}${t.subtopic_id ? ' · ' + subName(t.subtopic_id) : ''} · №${t.position}`

  return (
    <div className="auto-hw">
      <p className="eyebrow">🎲 Задачи из банка (авто)</p>
      <p className="muted small-text">Укажите номер, при желании раздел и сколько задач — приложение подберёт случайные. Или выберите задачи вручную.</p>

      {blocks.map((b, i) => {
        const subs = subtopics.filter(s => s.topic_id === b.topic_id)
        return (
          <div key={i} className="slot-row">
            <div className="slot-top">
              <select className="text-input" value={b.topic_id} onChange={e => setBlock(i, { topic_id: e.target.value, subtopic_id: '', pickedIds: [] })}>
                <option value="">Выберите номер</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="file-remove" onClick={() => up({ blocks: blocks.filter((_, j) => j !== i), bank: [] })}>✕</button>
            </div>
            {b.topic_id && (
              <select className="text-input" value={b.subtopic_id} onChange={e => setBlock(i, { subtopic_id: e.target.value, pickedIds: [] })}>
                <option value="">Все разделы (вперемешку)</option>
                {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {b.topic_id && (
              <>
                <div className="chip-wrap">
                  <button className={'filter-chip' + (b.mode === 'random' ? ' active' : '')} onClick={() => setBlock(i, { mode: 'random' })}>🎲 Случайные</button>
                  <button className={'filter-chip' + (b.mode === 'pick' ? ' active' : '')} onClick={() => setBlock(i, { mode: 'pick' })}>✋ Выбрать вручную</button>
                </div>
                {b.mode === 'random' && (
                  <div className="btn-row" style={{ alignItems: 'center' }}>
                    <span className="muted">Сколько задач:</span>
                    <input type="number" min="1" max="30" className="text-input score-input" value={b.count} onChange={e => setBlock(i, { count: e.target.value })} />
                  </div>
                )}
                {b.mode === 'pick' && (
                  <div className="pick-tasks">
                    {(pools[i] || []).length === 0 && <p className="muted small-text">Загрузка или в этом разделе нет задач…</p>}
                    {(pools[i] || []).length > 0 && <p className="muted small-text">Выбрано: {b.pickedIds.length} из {pools[i].length}</p>}
                    {(pools[i] || []).map(t => {
                      const on = b.pickedIds.includes(t.id)
                      const aImgs = answerImages(t), sImgs = solutionImages(t)
                      const hasSol = t.solution || sImgs.length || aImgs.length || t.solution_video_url
                      return (
                        <div key={t.id} className={'task-card' + (on ? ' solved' : '')}>
                          <div className="row-between">
                            <span className="task-num">№{t.position}{t.subtopic_id && !b.subtopic_id ? ' · ' + subName(t.subtopic_id) : ''}</span>
                            <button className={on ? 'btn-primary' : 'btn-secondary'} onClick={() => setBlock(i, { pickedIds: toggleIn(b.pickedIds, t.id) })}>{on ? '✓ Выбрано' : 'Выбрать'}</button>
                          </div>
                          {t.source && <p className="task-source">{t.source}</p>}
                          {t.condition && <p className="task-text">{t.condition}</p>}
                          <AttachmentList items={t.condition_attachments} full />
                          <p className="muted small-text">Ответ: <b>{t.answer || (aImgs.length ? 'картинкой' : '—')}</b></p>
                          {hasSol && (
                            <div className="task-actions">
                              <button className={'chip-btn' + (sol[t.id] ? ' on' : '')} onClick={() => setSol({ ...sol, [t.id]: !sol[t.id] })}>📖 {sol[t.id] ? 'Скрыть решение' : 'Показать решение'}</button>
                            </div>
                          )}
                          {sol[t.id] && (
                            <div className="task-panel">
                              {t.solution && <p className="task-text">{t.solution}</p>}
                              <AttachmentList items={sImgs} full />
                              {aImgs.length > 0 && <AttachmentList items={aImgs} full />}
                              {t.solution_video_url && <a href={safeUrl(t.solution_video_url)} target="_blank" rel="noreferrer" className="link">▶ Видео-разбор</a>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
      <button className="btn-secondary block" onClick={() => up({ blocks: [...blocks, newBlock()], bank: [] })}>+ Добавить номер / раздел</button>

      {blocks.length > 0 && (
        <>
          <label className="checkbox-row"><input type="checkbox" checked={draft.fresh !== false} onChange={e => up({ fresh: e.target.checked, bank: [] })} />
            Только новые: не решал и не задавали раньше</label>
          {targets.length > 1 && (
            <label className="checkbox-row"><input type="checkbox" checked={!!draft.perStudent} onChange={e => up({ perStudent: e.target.checked, bank: [] })} />
              Каждому ученику — свои задачи (иначе у всех одинаковые)</label>
          )}
          {draft.perStudent ? (
            <p className="muted small-text">Задачи подберутся каждому отдельно в момент отправки.</p>
          ) : (
            <button className="btn-primary block" disabled={busy} onClick={build}>{busy ? 'Подбираю…' : bank.length ? '🎲 Пересобрать' : '🎲 Собрать задачи'}</button>
          )}
        </>
      )}
      {msg && <p className="muted">{msg}</p>}

      {!draft.perStudent && bank.length > 0 && (
        <div className="series-preview card">
          <p className="card-title" style={{ margin: 0 }}>Задач в ДЗ: {bank.length}</p>
          {bank.map((t, i) => (
            <div key={t.id} className="row-between" style={{ gap: 8, marginTop: 6 }}>
              <span className="small-text"><b>{label(t)}</b> <span className="muted">{t.snippet}</span>{!t.hasAnswer && <span className="muted"> · проверка вручную</span>}</span>
              <button className="file-remove" onClick={() => up({ bank: bank.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
