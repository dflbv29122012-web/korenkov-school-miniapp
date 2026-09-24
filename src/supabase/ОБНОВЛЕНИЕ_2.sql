-- ============================================================
-- Korenkov School — обновление: файлы, сдача ДЗ, баллы
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- Безопасно запускать повторно.
-- ============================================================

-- 1. Несколько вложений к ДЗ (от учителя)
alter table homework add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 2. Сдача ДЗ учеником: файлы, время сдачи, комментарий
alter table homework add column if not exists submission_attachments jsonb not null default '[]'::jsonb;
alter table homework add column if not exists submitted_at timestamptz;
alter table homework add column if not exists submission_comment text;

-- 3. Задания внутри ДЗ с баллами по шкале ЕГЭ
create table if not exists homework_tasks (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid references homework(id) on delete cascade,
  position int not null default 1,
  title text,
  max_score int not null default 1,
  score int,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_homework_tasks_hw on homework_tasks(homework_id);

alter table homework_tasks enable row level security;
drop policy if exists "anon full access homework_tasks" on homework_tasks;
create policy "anon full access homework_tasks" on homework_tasks for all using (true) with check (true);

-- 4. Несколько файлов в материалах
alter table materials add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 5. Разрешаем удалять и обновлять файлы в хранилище
drop policy if exists "anon delete attachments" on storage.objects;
create policy "anon delete attachments" on storage.objects
  for delete using (bucket_id in ('attachments','materials'));

drop policy if exists "anon update attachments" on storage.objects;
create policy "anon update attachments" on storage.objects
  for update using (bucket_id in ('attachments','materials'));

-- 6. Лимит размера файла 50 МБ
update storage.buckets set file_size_limit = 52428800 where id in ('attachments', 'materials');
