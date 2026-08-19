// ============================================================
// Бэкенд приложения «Статистика перевозок»
// Защищённая версия:
//  - токен-авторизация (сессии в БД), без хранения пароля на клиенте
//  - регистрация отключена, пользователей создаёт только админ
//  - роли: admin / employee
//  - защита API (без токена данные недоступны)
//  - ограничение попыток входа, логирование, эндпоинт /health
// ============================================================
require('dotenv').config();

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
});

const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ---- Логирование в файл logs/server.log ----
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'server.log');

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  if (process.env.NODE_ENV !== 'production') process.stdout.write(line);
}

// ---- Таблицы, доступные через API (белый список) ----
const TABLES = new Set([
  'cars', 'drivers', 'contractors', 'trips', 'records',
  'expenses', 'invoices', 'refuels', 'fines', 'users',
]);

// ---- Хелперы ----
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Prefer, Cache-Control');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ---- Авторизация по токену ----
async function authByToken(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const r = await pool.query(
      `SELECT s.token, s.expires_at, u.id, u.email, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = $1`, [token]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
      return null;
    }
    return { id: row.id, email: row.email, role: row.role };
  } catch (e) {
    log('error', 'auth: ' + e.message);
    return null;
  }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)',
    [token, userId, expiresAt]);
  return { token, expiresAt };
}

// ---- Защита от перебора пароля (10 попыток / 15 минут с IP) ----
const attempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  a.count += 1;
  return a.count > 10;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.resetAt < now) attempts.delete(ip);
}, 60 * 1000).unref();

// ---- Разбор параметров PostgREST-подобного запроса (GET) ----
function parseSelect(selVal, table) {
  const joins = [];
  let selectCols = '"' + table + '".*';
  if (!selVal || selVal === '*') return { joins, selectCols };
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of selVal) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const fk = { cars: 'car_id', drivers: 'driver_id', contractors: 'contractor_id', trips: 'trip_id' };
  for (const p of parts) {
    if (p === '*') continue;
    const m = p.match(/^(\w+)\(([^)]+)\)$/);
    if (m && fk[m[1]]) {
      const rn = m[1];
      const rc = m[2].split(',').map((c) => c.trim());
      joins.push(`LEFT JOIN "${rn}" ON "${table}"."${fk[rn]}" = "${rn}"."id"`);
      selectCols += ',' + rc.map((c) => `"${rn}"."${c}" AS "${rn}:${c}"`).join(',');
    }
  }
  return { joins, selectCols };
}

function buildWhere(req, params, conds) {
  const url = new URL(req.url, 'http://x');
  url.searchParams.forEach((v, k) => {
    if (k === 'select' || k === 'limit' || k === '_ts') return;
    if (k === 'order') return;
    const inm = v.match(/^in\.\(([^)]+)\)$/);
    if (inm) {
      params.push(inm[1].split(',').map(decodeURIComponent));
      conds.push(`"${k}" = ANY($${params.length})`);
      return;
    }
    const eq = v.match(/^eq\.(.+)/);
    if (eq) { params.push(decodeURIComponent(eq[1])); conds.push(`"${k}" = $${params.length}`); return; }
    const gte = v.match(/^gte\.(.+)/);
    if (gte) { params.push(decodeURIComponent(gte[1])); conds.push(`"${k}" >= $${params.length}`); return; }
    const lte = v.match(/^lte\.(.+)/);
    if (lte) { params.push(decodeURIComponent(lte[1])); conds.push(`"${k}" <= $${params.length}`); return; }
  });
}

// ---- Обработчик ----
const server = http.createServer(async (req, res) => {
  if (setCors(req, res)) return;

  const url = new URL(req.url, 'http://x');
  const table = url.pathname.replace(/^\//, '');

  try {
    // Эндпоинт проверки здоровья
    if (table === 'health') {
      try { await pool.query('SELECT 1'); return json(res, 200, { ok: true, db: 'up' }); }
      catch (e) { return json(res, 503, { ok: false, db: 'down' }); }
    }

    // ---- Авторизация ----
    if (table === 'auth') {
      const bodyText = await readBody(req);
      const d = JSON.parse(bodyText || '{}');

      if (d.method === 'login') {
        const ip = req.socket.remoteAddress || 'unknown';
        if (isRateLimited(ip)) {
          log('warn', `login rate-limit: ${ip}`);
          return json(res, 429, { error: 'too_many_attempts' });
        }
        const email = String(d.email || '').trim().toLowerCase();
        const password = String(d.password || '');
        if (!email || !password) return json(res, 400, { error: 'invalid' });
        const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
        if (r.rows.length === 0 || !bcrypt.compareSync(password, r.rows[0].password_hash)) {
          log('warn', `login failed: ${email}`);
          return json(res, 401, { error: 'invalid' });
        }
        const session = await createSession(r.rows[0].id);
        const u = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [r.rows[0].id]);
        log('info', `login ok: ${email} (${u.rows[0].role})`);
        return json(res, 200, { id: u.rows[0].id, email: u.rows[0].email, role: u.rows[0].role, token: session.token });
      }

      if (d.method === 'verify') {
        const token = String(d.token || '');
        const user = await authByToken({ headers: { authorization: 'Bearer ' + token } });
        if (!user) return json(res, 401, { error: 'invalid' });
        return json(res, 200, { id: user.id, email: user.email, role: user.role });
      }

      // Регистрация отключена
      if (d.method === 'register') return json(res, 403, { error: 'registration_disabled' });
      return json(res, 400, { error: 'unknown' });
    }

    // ---- Таблица users: только админ ----
    if (table === 'users') {
      const user = await authByToken(req);
      if (!user) return json(res, 401, { error: 'unauthorized' });
      if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });

      if (req.method === 'GET') {
        const r = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC');
        return json(res, 200, r.rows);
      }

      if (req.method === 'POST') {
        const d = JSON.parse(await readBody(req));
        const email = String(d.email || '').trim().toLowerCase();
        const password = String(d.password || '');
        const role = d.role === 'admin' ? 'admin' : 'employee';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'invalid_email' });
        if (password.length < 6) return json(res, 400, { error: 'password_too_short' });
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (exists.rows.length > 0) return json(res, 409, { error: 'exists' });
        const hash = bcrypt.hashSync(password, 10);
        const ins = await pool.query(
          'INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id, email, role, created_at',
          [email, hash, role]);
        log('info', `user created: ${email} (${role}) by ${user.email}`);
        return json(res, 200, ins.rows[0]);
      }

      if (req.method === 'DELETE') {
        const raw = url.searchParams.get('id');
        const m = raw ? raw.match(/^eq\.(.+)/) : null;
        const userId = m ? decodeURIComponent(m[1]) : null;
        if (!userId) return json(res, 400, { error: 'invalid_id' });
        if (userId === user.id) return json(res, 400, { error: 'cannot_delete_self' });
        const target = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
        if (target.rows.length === 0) return json(res, 404, { error: 'not_found' });
        if (target.rows[0].role === 'admin') {
          const admins = await pool.query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
          if (admins.rows[0].c <= 1) return json(res, 400, { error: 'cannot_delete_last_admin' });
        }
        await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        log('info', `user deleted: ${userId} by ${user.email}`);
        return json(res, 200, { ok: true });
      }

      return json(res, 405, { error: 'method_not_allowed' });
    }

    // ---- Остальные таблицы: обязательна авторизация ----
    if (!TABLES.has(table)) return json(res, 404, { error: 'not_found' });
    const user = await authByToken(req);
    if (!user) return json(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET') {
      const params = [];
      const conds = [];
      let orderCol = '';
      let orderDir = 'ASC';
      const url2 = new URL(req.url, 'http://x');
      const order = url2.searchParams.get('order');
      if (order) {
        const dot = order.lastIndexOf('.');
        orderCol = dot > 0 ? order.substring(0, dot) : order;
        orderDir = order.endsWith('.desc') ? 'DESC' : 'ASC';
      }
      const { joins, selectCols } = parseSelect(url2.searchParams.get('select'), table);
      buildWhere(req, params, conds);
      let q = `SELECT ${selectCols} FROM "${table}"`;
      if (joins.length) q += ' ' + joins.join(' ');
      if (conds.length) q += ' WHERE ' + conds.join(' AND ');
      if (orderCol) q += ` ORDER BY "${orderCol}" ${orderDir}`;
      if (url2.searchParams.has('limit')) q += ' LIMIT ' + url2.searchParams.get('limit');
      const result = await pool.query(q, params);
      const rows = result.rows.map((r) => {
        const obj = {};
        const refs = {};
        Object.keys(r).forEach((key) => {
          const col = key.split(':');
          if (col.length === 2) {
            if (!refs[col[0]]) refs[col[0]] = {};
            refs[col[0]][col[1]] = r[key];
          } else obj[key] = r[key];
        });
        Object.keys(refs).forEach((n) => {
          obj[n] = Object.values(refs[n]).every((v) => v === null) ? null : { ...refs[n] };
        });
        return obj;
      });
      return json(res, 200, rows);
    }

    if (req.method === 'POST') {
      const d = JSON.parse(await readBody(req));
      if (d.id) delete d.id;
      const cols = Object.keys(d).map((c) => `"${c}"`).join(',');
      const vals = Object.values(d).filter((v) => v !== undefined && v !== '');
      const ph = vals.map((_, i) => '$' + (i + 1)).join(',');
      const r = await pool.query(
        `INSERT INTO "${table}" (${cols}) VALUES (${ph}) RETURNING *`, vals);
      return json(res, 200, r.rows[0] || {});
    }

    if (req.method === 'DELETE') {
      const p = [];
      const url3 = new URL(req.url, 'http://x');
      url3.searchParams.forEach((v) => {
        const m = v.match(/^eq\.(.+)/);
        if (m) p.push(decodeURIComponent(m[1]));
      });
      if (p.length) await pool.query(`DELETE FROM "${table}" WHERE id = $1`, [p[0]]);
      return json(res, 200, []);
    }

    if (req.method === 'PATCH') {
      const d = JSON.parse(await readBody(req));
      const pv = Object.values(d);
      const sets = Object.keys(d).map((k, i) => `"${k}" = $${i + 1}`).join(',');
      const url4 = new URL(req.url, 'http://x');
      const m = [...url4.searchParams.entries()].find(([, v]) => v.startsWith('eq.'));
      if (m) pv.push(decodeURIComponent(m[1].slice(3)));
      if (!sets) return json(res, 400, { error: 'no_fields' });
      await pool.query(`UPDATE "${table}" SET ${sets} WHERE id = $${pv.length}`, pv);
      return json(res, 200, []);
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    log('error', `${req.method} ${table}: ${e.stack || e.message}`);
    return json(res, 400, { error: e.message || 'internal_error' });
  }
});

server.listen(PORT, () => {
  log('info', `server started on port ${PORT}`);
});

process.on('uncaughtException', (e) => log('error', 'uncaughtException: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection: ' + (e && e.stack || e)));
