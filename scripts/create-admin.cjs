// ============================================================
// Создание первого администратора
// Запуск:  node scripts/create-admin.cjs
// (значения ADMIN_EMAIL и ADMIN_PASSWORD берутся из .env)
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Ошибка: задайте ADMIN_EMAIL и ADMIN_PASSWORD в файле .env');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const e = email.trim().toLowerCase();
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [e]);
  if (exists.rows.length > 0) {
    await pool.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', e]);
    console.log(`Админ ${e} уже существовал — роль обновлена на admin.`);
  } else {
    const hash = bcrypt.hashSync(password, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3)',
      [e, hash, 'admin']);
    console.log(`Админ создан: ${e}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
