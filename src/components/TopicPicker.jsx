import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Загружает папки и подпапки один раз, отдаёт их наверх
export function useTopics() {
  const [topics, setTopics] = useState([])
  const [subtopics, setSubtopics] = useState([])

  async function reload() {
    const [{ data: t }, { data: st }] = await Promise.all([
      supabase.from('topics').select('*').order('position').order('name'),
      supabase.from('subtopics').select('*').order('position').order('name'),
    ])
    setTopics(t ?? []); setSubtopics(st ?? [])
  }

  useEffect(() => { reload() }, [])
  return { topics, subtopics, reload }
}

// Два выпадающих списка: номер и тема внутри него
export default function TopicPicker({ topics, subtopics, topicId, subtopicId, onChange }) {
  const subs = subtopics.filter(s => s.topic_id === topicId)
  return (
    <>
      <select className="text-input" value={topicId || ''}
        onChange={e => onChange({ topic_id: e.target.value || null, subtopic_id: null })}>
        <option value="">Без номера</option>
        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {topicId && (
        <select className="text-input" value={subtopicId || ''}
          onChange={e => onChange({ topic_id: topicId, subtopic_id: e.target.value || null })}>
          <option value="">Без темы</option>
          {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </>
  )
}
