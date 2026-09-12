-- Миграция для transport-stats: поле driver_id в таблице expenses
-- Привязка расхода к водителю (для фильтрации и расчёта P&L по водителю).
-- Существующие записи: driver_id = NULL.

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN expenses.driver_id IS 'Водитель, к которому относится расход';
