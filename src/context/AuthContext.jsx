import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getTelegramUser, isTeacherModeRequested } from '../lib/telegram'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const tgUser = getTelegramUser()
      const effectiveTgUser = tgUser || (import.meta.env.DEV
        ? { id: 0, first_name: 'Тест', last_name: 'Ученик', username: 'test_student', photo_url: null }
        : null)

      if (!effectiveTgUser) {
        setError('not_in_telegram')
        setLoading(false)
        return
      }

      const { data: existing, error: findErr } = await supabase
        .from('students')
        .select('*')
        .eq('telegram_id', effectiveTgUser.id)
        .maybeSingle()

      if (findErr) {
        if (!cancelled) { setError(findErr.message); setLoading(false) }
        return
      }

      let row = existing
      if (!row) {
        const { data: created, error: createErr } = await supabase
          .from('students')
          .insert({
            telegram_id: effectiveTgUser.id,
            first_name: effectiveTgUser.first_name ?? '',
            last_name: effectiveTgUser.last_name ?? '',
            username: effectiveTgUser.username ?? null,
            photo_url: effectiveTgUser.photo_url ?? null,
          })
          .select()
          .single()

        if (createErr) {
          if (!cancelled) { setError(createErr.message); setLoading(false) }
          return
        }
        row = created
      }

      if (!cancelled) {
        setStudent(row)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const value = {
    student,
    loading,
    error,
    isTeacher: !!student?.is_teacher || isTeacherModeRequested(),
    refreshStudent: async () => {
      if (!student) return
      const { data } = await supabase.from('students').select('*').eq('id', student.id).single()
      if (data) setStudent(data)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  return ctx
}
