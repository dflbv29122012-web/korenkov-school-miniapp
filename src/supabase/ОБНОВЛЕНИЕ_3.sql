-- ============================================================
-- Korenkov School — обновление 3
-- Чинит схему materials + адресаты + история сдач ДЗ
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Снимаем NOT NULL с неизвестных обязательных колонок (наследие старой схемы)
do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('materials','homework','lessons')
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.column_name <> 'id'
      and not exists (
        select 1 from information_schema.key_column_usage k
        join information_schema.table_constraints tc
          on tc.constraint_name = k.constraint_name and tc.table_schema = k.table_schema
        where tc.constraint_type = 'PRIMARY KEY'
          and k.table_schema = 'public' and k.table_name = c.table_name and k.column_name = c.column_name
      )
  loop
    execute format('alter table %I alter column %I drop not null', r.table_name, r.column_name);
  end loop;
end $$;

-- 2. Достраиваем materials до нужной схемы
alter table materials add column if not exists type text;
alter table materials add column if not exists title text;
alter table materials add column if not exists subject text;
alter table materials add column if not exists video_url text;
alter table materials add column if not exists file_url text;
alter table materials add column if not exists duration_seconds int;
alter table materials add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table materials add column if not exists group_id uuid references groups(id) on delete set null;
alter table materials add column if not exists student_id uuid references students(id) on delete cascade;
alter table materials add column if not exists created_at timestamptz not null default now();

create index if not exists idx_materials_student on materials(student_id);

-- 3. Достраиваем homework
alter table homework add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table homework add column if not exists submission_attachments jsonb not null default '[]'::jsonb;
alter table homework add column if not exists submitted_at timestamptz;
alter table homework add column if not exists submission_comment text;
alter table homework add column if not exists attempts_count int not null default 0;

-- 4. Задания внутри ДЗ с баллами
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

-- 5. История сдач ДЗ (ученик может сдавать несколько раз)
create table if not exists homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid references homework(id) on delete cascade,
  attempt int not null default 1,
  attachments jsonb not null default '[]'::jsonb,
  comment text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false
);
create index if not exists idx_hw_submissions on homework_submissions(homework_id);
alter table homework_submissions enable row level security;
drop policy if exists "anon full access homework_submissions" on homework_submissions;
create policy "anon full access homework_submissions" on homework_submissions for all using (true) with check (true);

-- 6. Файлы: разрешаем удаление и обновление
drop policy if exists "anon delete attachments" on storage.objects;
create policy "anon delete attachments" on storage.objects
  for delete using (bucket_id in ('attachments','materials'));

drop policy if exists "anon update attachments" on storage.objects;
create policy "anon update attachments" on storage.objects
  for update using (bucket_id in ('attachments','materials'));

update storage.buckets set file_size_limit = 52428800 where id in ('attachments', 'materials');
