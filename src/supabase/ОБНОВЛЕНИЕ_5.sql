-- ============================================================
-- Korenkov School — обновление 5: прогресс по темам
-- Выполнить ЦЕЛИКОМ в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- Прогресс считается на лету из существующих данных (homework.topic_id,
-- correct_tasks, total_tasks), новых таблиц не требуется.
-- Этот файл добавляет только вспомогательный индекс для скорости.

create index if not exists idx_homework_student_topic on homework(student_id, topic_id);
