-- ============================================================
-- Korenkov School — обновление 4
-- Папки (номера ЕГЭ) и подпапки (темы) + ссылки на занятие
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. Несколько ссылок на видео (если ещё не добавляли)
alter table materials add column if not exists video_urls jsonb not null default '[]'::jsonb;

-- 2. Папки — номера ЕГЭ/ОГЭ
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 1,
  created_at timestamptz not null default now()
);
alter table topics enable row level security;
drop policy if exists "anon full access topics" on topics;
create policy "anon full access topics" on topics for all using (true) with check (true);

-- 3. Подпапки — темы внутри номера
create table if not exists subtopics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade,
  name text not null,
  position int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_subtopics_topic on subtopics(topic_id);
alter table subtopics enable row level security;
drop policy if exists "anon full access subtopics" on subtopics;
create policy "anon full access subtopics" on subtopics for all using (true) with check (true);

-- 4. Привязка контента к папкам
alter table homework  add column if not exists topic_id uuid references topics(id) on delete set null;
alter table homework  add column if not exists subtopic_id uuid references subtopics(id) on delete set null;
alter table materials add column if not exists topic_id uuid references topics(id) on delete set null;
alter table materials add column if not exists subtopic_id uuid references subtopics(id) on delete set null;
alter table lessons   add column if not exists topic_id uuid references topics(id) on delete set null;
alter table lessons   add column if not exists subtopic_id uuid references subtopics(id) on delete set null;

create index if not exists idx_homework_topic on homework(topic_id);
create index if not exists idx_materials_topic on materials(topic_id);
create index if not exists idx_lessons_topic on lessons(topic_id);

-- 5. Ссылки на занятие: созвон, доска, конспект
alter table lessons add column if not exists meeting_url text;
alter table lessons add column if not exists board_url text;
alter table lessons add column if not exists notes_url text;

-- 6. Групповая рассылка занятий: занятие может быть "для всех"
alter table lessons add column if not exists for_all boolean not null default false;
