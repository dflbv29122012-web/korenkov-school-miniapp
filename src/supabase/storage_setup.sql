-- ============================================================
-- Korenkov School — настройка хранилища файлов (Storage)
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Создаём два публичных бакета: для файлов ДЗ и для материалов (конспекты/видео)
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

-- 2. Политики доступа: разрешаем анонимному ключу (anon) читать и загружать файлы
--    (тот же подход, что и для остальных таблиц в этом проекте)
drop policy if exists "public read attachments" on storage.objects;
create policy "public read attachments" on storage.objects
  for select using (bucket_id = 'attachments');

drop policy if exists "anon upload attachments" on storage.objects;
create policy "anon upload attachments" on storage.objects
  for insert with check (bucket_id = 'attachments');

drop policy if exists "public read materials" on storage.objects;
create policy "public read materials" on storage.objects
  for select using (bucket_id = 'materials');

drop policy if exists "anon upload materials" on storage.objects;
create policy "anon upload materials" on storage.objects
  for insert with check (bucket_id = 'materials');

-- 3. Добавляем поле для вложения (фото/файл) в домашние задания
alter table homework add column if not exists attachment_url text;
alter table homework add column if not exists attachment_type text; -- 'image' | 'file'

-- 4. Добавляем поле для фото-обложки в материалы (на случай конспекта-картинки)
alter table materials add column if not exists cover_image_url text;
