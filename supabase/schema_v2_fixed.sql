-- ============================================================
-- Korenkov School — расширение схемы базы данных (v2, устойчивая)
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- Безопасно запускать повторно.
-- ============================================================

-- 0. Защита: если в уже существующих таблицах (groups, materials, payments,
--    subscription_plans, student_groups) есть НЕИЗВЕСТНЫЕ обязательные поля
--    (NOT NULL без значения по умолчанию) — снимаем с них обязательность,
--    чтобы наши вставки/дальнейшие ALTER не падали.
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('groups','materials','payments','subscription_plans','student_groups')
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.column_name not in ('id')
      -- исключаем колонки, входящие в первичный ключ (их NOT NULL снять нельзя)
      and not exists (
        select 1
        from information_schema.key_column_usage k
        join information_schema.table_constraints tc
          on tc.constraint_name = k.constraint_name and tc.table_schema = k.table_schema
        where tc.constraint_type = 'PRIMARY KEY'
          and k.table_schema = 'public'
          and k.table_name = c.table_name
          and k.column_name = c.column_name
      )
  loop
    execute format('alter table %I alter column %I drop not null', r.table_name, r.column_name);
  end loop;
end $$;

-- 1. Группы (ОГЭ 2026, ЕГЭ 2026, Алгебра 9, Геометрия, ТВ и т.д.)
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- гарантируем уникальность имени группы, если её ещё нет
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_name_key') then
    alter table groups add constraint groups_name_key unique (name);
  end if;
end $$;

insert into groups (name) values
  ('ОГЭ 2026'), ('ЕГЭ 2026'), ('Алгебра 9'), ('Геометрия'), ('ТВ')
on conflict (name) do nothing;

-- 2. Связь ученик <-> группа (многие-ко-многим)
create table if not exists student_groups (
  student_id uuid references students(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  primary key (student_id, group_id)
);

-- 3. Расширяем students нужными полями (роль, статус доступа)
alter table students add column if not exists is_teacher boolean not null default false;
alter table students add column if not exists access_open boolean not null default false;
alter table students add column if not exists access_closed_since date;
alter table students add column if not exists debt_amount numeric not null default 0;
alter table students add column if not exists grade_level text;

-- 4. Занятия — расширяем полями темы/предмета/группы
alter table lessons add column if not exists group_id uuid references groups(id) on delete set null;
alter table lessons add column if not exists subject text;
alter table lessons add column if not exists topic text;

-- 5. ДЗ — расширяем полями видео-разбора и кол-ва задач
alter table homework add column if not exists total_tasks int;
alter table homework add column if not exists correct_tasks int;
alter table homework add column if not exists trainer_url text;

-- 6. Материалы: видео-разборы ДЗ, записи занятий, конспекты
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete set null,
  type text not null check (type in ('video_review', 'lesson_recording', 'note')),
  title text not null,
  subject text,
  video_url text,
  duration_seconds int,
  file_url text,
  created_at timestamptz not null default now()
);

-- 7. Оплаты — история платежей и текущий тариф
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  amount numeric not null,
  paid_at timestamptz not null default now(),
  period_label text,
  method text default 'Автосписание',
  status text not null default 'success'
);

create table if not exists subscription_plans (
  student_id uuid primary key references students(id) on delete cascade,
  lessons_per_month int not null default 8,
  price numeric not null default 8000,
  next_charge_date date,
  auto_pay boolean not null default true,
  paid_until date
);

-- Индексы
create index if not exists idx_materials_group on materials(group_id);
create index if not exists idx_payments_student on payments(student_id);

-- RLS для новых таблиц
alter table groups enable row level security;
alter table student_groups enable row level security;
alter table materials enable row level security;
alter table payments enable row level security;
alter table subscription_plans enable row level security;

drop policy if exists "anon full access groups" on groups;
create policy "anon full access groups" on groups for all using (true) with check (true);

drop policy if exists "anon full access student_groups" on student_groups;
create policy "anon full access student_groups" on student_groups for all using (true) with check (true);

drop policy if exists "anon full access materials" on materials;
create policy "anon full access materials" on materials for all using (true) with check (true);

drop policy if exists "anon full access payments" on payments;
create policy "anon full access payments" on payments for all using (true) with check (true);

drop policy if exists "anon full access subscription_plans" on subscription_plans;
create policy "anon full access subscription_plans" on subscription_plans for all using (true) with check (true);
