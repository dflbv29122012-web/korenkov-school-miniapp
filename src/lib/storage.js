import { supabase } from './supabase'

export function isImage(file) {
  const t = file?.type || ''
  return t.startsWith('image/')
}

export function isVideo(file) {
  const t = file?.type || ''
  return t.startsWith('video/')
}

function kindOf(file) {
  if (isImage(file)) return 'image'
  if (isVideo(file)) return 'video'
  return 'file'
}

// Загружает один файл, возвращает {url, name, kind}
export async function uploadFile(bucket, file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, name: file.name, kind: kindOf(file), path }
}

// Загружает список файлов по очереди, вызывая onProgress(i, total)
export async function uploadFiles(bucket, files, onProgress) {
  const result = []
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length)
    result.push(await uploadFile(bucket, files[i]))
  }
  return result
}
