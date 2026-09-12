-- Миграция для transport-stats: добавление поля payment_date
-- Дата оплаты счёта (для кассового учёта поступлений)
-- Все существующие записи: payment_date = NULL

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS payment_date DATE;

COMMENT ON COLUMN invoices.payment_date IS 'Дата фактической оплаты счёта';
