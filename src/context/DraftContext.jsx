import { createContext, useContext, useRef, useState } from 'react'

const DraftContext = createContext(null)

// Хранит черновики форм в памяти приложения.
// Переход между вкладками не сбрасывает их — данные живут,
// пока приложение открыто (включая выбранные файлы).
export function DraftProvider({ children }) {
  const store = useRef({})
  const [, force] = useState(0)

  const api = {
    get(key, initial) {
      if (!(key in store.current)) store.current[key] = initial
      return store.current[key]
    },
    set(key, value) {
      store.current[key] = typeof value === 'function' ? value(store.current[key]) : value
      force(n => n + 1)
    },
    clear(key) {
      delete store.current[key]
      force(n => n + 1)
    },
  }

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>
}

export function useDraft(key, initial) {
  const ctx = useContext(DraftContext)
  if (!ctx) throw new Error('useDraft должен использоваться внутри <DraftProvider>')
  const value = ctx.get(key, initial)
  const setValue = (v) => ctx.set(key, v)
  const clear = () => ctx.clear(key)
  return [value, setValue, clear]
}
