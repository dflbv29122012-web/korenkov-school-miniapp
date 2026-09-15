import { supabase } from './supabase'

// Загружает файл в указанный бакет Supabase Storage и возвращает публичную ссылку.
// bucket: 'attachments' | 'materials'
export async function uploadFile(bucket, file) {
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export function isImageFile(file) {
  return file && file.type && file.type.startsWith('image/')
}
