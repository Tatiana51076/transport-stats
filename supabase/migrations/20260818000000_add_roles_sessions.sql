-- ============================================================
-- Роли пользователей и сессии (токен-авторизация)
-- Выполняется ОДИН раз на сервере (см. инструкцию).
-- ============================================================

-- Таблица пользователей (если ещё не создана)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Добавить колонку role, если таблица users уже существовала
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee'));

-- Таблица сессий (токены входа)
CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
