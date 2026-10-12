import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// №1–13 — первая часть (краткий ответ, проверяется автоматически)
export const PART1_MAX = 13

export const DEFAULT_POINTS = {"1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 1, "9": 1, "10": 1, "11": 1, "12": 1, "13": 1, "14": 2, "15": 3, "16": 2, "17": 2, "18": 3, "19": 4, "20": 4}
// Прогноз шкалы 2027: первичный балл -> тестовый
export const DEFAULT_SCALE = {"1": 6, "2": 11, "3": 17, "4": 22, "5": 27, "6": 34, "7": 40, "8": 46, "9": 52, "10": 58, "11": 64, "12": 70, "13": 72, "14": 74, "15": 76, "16": 78, "17": 80, "18": 82, "19": 84, "20": 86, "21": 88, "22": 90, "23": 92, "24": 93, "25": 94, "26": 95, "27": 96, "28": 97, "29": 98, "30": 99, "31": 100, "32": 100, "33": 100}

const defaults = () => ({ points: { ...DEFAULT_POINTS }, scale: { ...DEFAULT_SCALE } })
let cache = null

export async function loadSettings(force = false) {
  if (cache && !force) return cache
  let rows = []
  try {
    const { data, error } = await supabase.from('app_settings').select('key, value')
    if (!error) rows = data ?? []
  } catch { /* таблицы ещё нет — берём значения по умолчанию */ }
  const get = (k) => rows.find(r => r.key === k)?.value
  const s = defaults()
  const p = get('points_by_number'); if (p && Object.keys(p).length) s.points = { ...p }
  const sc = get('score_scale'); if (sc && Object.keys(sc).length) s.scale = { ...sc }
  cache = s
  return s
}

export async function saveSetting(key, value) {
  const { error } = await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  cache = null
  return error
}

export function useSettings() {
  const [s, setS] = useState(cache || defaults())
  useEffect(() => { loadSettings().then(setS) }, [])
  return s
}

export const pointsFor = (num, s) => Number(s.points[String(num)] ?? 1)
export const isPart1 = (num) => Number(num) >= 1 && Number(num) <= PART1_MAX
export const fullMax = (s) => Object.values(s.points).reduce((a, v) => a + Number(v || 0), 0)

// Первичный -> тестовый по таблице
export function toTest(primary, scale) {
  const p = Math.round(Number(primary) || 0)
  if (p <= 0) return 0
  const keys = Object.keys(scale).map(Number).filter(n => !isNaN(n))
  if (!keys.length) return 0
  const max = Math.max(...keys)
  return Number(scale[String(Math.min(p, max))] ?? 0)
}

// Минимальный порог: первичный балл, с которого начинается красная линия
export const THRESHOLD_PRIMARY = 5
