import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getTelegramUser, getInitData } from '../lib/telegram'

const AuthContext = createContext(null)

const LOGIN_ERRORS = {
  bad_signature: 'Не удалось подтвердить вход через Telegram. Закройте приложение и откройте его снова из бота.',
  expired: 'Сессия Telegram устарела. Закройте приложение и откройте его снова из бота.',
  no_bot_token: 'Сервер входа не настроен: в Supabase не добавлен ключ бота (TELEGRAM_BOT_TOKEN).',
  no_user: 'Telegram не передал данные пользователя. Откройте приложение кнопкой в боте.',
}
// Имя функции входа в Supabase (так она называется в Edge Functions)
const AUTH_FUNCTION = 'rapid-worker'
const emailFor = (tgId) => `tg${tgId}@users.korenkov-school.app`

// Защищённый вход: сервер проверяет подпись Telegram и выдаёт учётные данные
async function signInWithTelegram(tgUser) {
  const { data: cur } = await supabase.auth.getSession()
  if (cur?.session?.user?.email === emailFor(tgUser.id)) return
  const initData = getInitData()
  if (!initData) throw new Error(LOGIN_ERRORS.no_user)
  const { data, error } = await supabase.functions.invoke(AUTH_FUNCTION, { body: { initData } })
  let payload = data
  if (error) {
    try { payload = await error.context.json() } catch { payload = null }
  }
  if (!payload?.email) {
    throw new Error(LOGIN_ERRORS[payload?.error] || 'Сервер входа недоступен. Попробуйте позже или напишите преподавателю.')
  }
  if (cur?.session) await supabase.auth.signOut({ scope: 'local' })
  const { error: e2 } = await supabase.auth.signInWithPassword({ email: payload.email, password: payload.password })
  if (e2) throw new Error('Не удалось войти: ' + e2.message)
}

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
      // Режим разработки на компьютере (не попадает в рабочую версию)
      const devUser = !tgUser && import.meta.env.DEV
        ? { id: 0, first_name: 'Тест', last_name: 'Ученик', username: 'test_student', photo_url: null }
        : null
      if (!tgUser && !devUser) {
        setError('not_in_telegram')
        setLoading(false)
        return
      }

      try {
        if (tgUser && getInitData()) await signInWithTelegram(tgUser)
        else if (!import.meta.env.DEV) throw new Error(LOGIN_ERRORS.no_user)

        const who = tgUser || devUser
        let { data: row, error: findErr } = await supabase.from('students').select('*').eq('telegram_id', who.id).maybeSingle()
        if (findErr) throw findErr
        if (!row && import.meta.env.DEV) {
          const { data: created, error: createErr } = await supabase.from('students').insert({
            telegram_id: who.id, first_name: who.first_name ?? '', last_name: who.last_name ?? '',
            username: who.username ?? null, photo_url: who.photo_url ?? null,
          }).select().single()
          if (createErr) throw createErr
          row = created
        }
        if (!row) throw new Error('Профиль не найден. Закройте приложение и откройте снова.')
        if (!cancelled) { setStudent(row); setLoading(false) }
      } catch (e) {
        if (!cancelled) { setError(e.message || String(e)); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const value = {
    student,
    loading,
    error,
    isTeacher: !!student?.is_teacher,
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
