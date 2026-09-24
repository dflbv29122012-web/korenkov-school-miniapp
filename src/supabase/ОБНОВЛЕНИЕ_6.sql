-- ============================================================
-- Korenkov School — обновление 6
-- Банк заданий + файлы конспектов к занятиям
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Файлы конспекта к занятию (вместо одной ссылки)
alter table lessons add column if not exists notes_attachments jsonb not null default '[]'::jsonb;

-- 2. Банк заданий внутри подтем
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade,
  subtopic_id uuid references subtopics(id) on delete cascade,
  position int not null default 1,
  condition text,
  condition_attachments jsonb not null default '[]'::jsonb,
  answer text,
  solution text,
  solution_attachments jsonb not null default '[]'::jsonb,
  solution_video_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_subtopic on tasks(subtopic_id);
alter table tasks enable row level security;
drop policy if exists "anon full access tasks" on tasks;
create policy "anon full access tasks" on tasks for all using (true) with check (true);

-- 3. Попытки учеников решить задание
create table if not exists task_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  answer text,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_attempts on task_attempts(student_id, task_id);
alter table task_attempts enable row level security;
drop policy if exists "anon full access task_attempts" on task_attempts;
create policy "anon full access task_attempts" on task_attempts for all using (true) with check (true);
