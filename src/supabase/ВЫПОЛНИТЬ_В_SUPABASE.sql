-- ============================================================
-- Korenkov School — все изменения одним скриптом
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- Безопасно запускать повторно.
-- ============================================================

-- 1. Групповые занятия: разрешаем занятию не иметь конкретного ученика
alter table lessons alter column student_id drop not null;

-- 2. Хранилище файлов: два публичных бакета
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('materials', 'materials', true) on conflict (id) do nothing;

-- 3. Политики доступа к файлам
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

-- 4. Вложения (фото/файлы) в домашних заданиях
alter table homework add column if not exists attachment_url text;
alter table homework add column if not exists attachment_type text;

-- 5. Обложка для материалов
alter table materials add column if not exists cover_image_url text;

-- 6. Удаление групп: чистим связи автоматически
alter table student_groups drop constraint if exists student_groups_group_id_fkey;
alter table student_groups add constraint student_groups_group_id_fkey
  foreign key (group_id) references groups(id) on delete cascade;

-- 7. Увеличиваем лимит размера файла на всякий случай (50 МБ на файл)
update storage.buckets set file_size_limit = 52428800 where id in ('attachments', 'materials');
