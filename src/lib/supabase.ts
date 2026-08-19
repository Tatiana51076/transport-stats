// ============================================================
// Клиент API (безопасная версия).
// Все запросы к данным отправляются с токеном в заголовке
// Authorization: Bearer <token>. Пароль на клиенте НЕ хранится.
// ============================================================

const API = '/api';
const AUTH_KEY = 'transport-stats-auth-v2';

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'employee';
}

function readStored(): { token?: string; userId?: string; email?: string; role?: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getToken(): string | null {
  const s = readStored();
  return s?.token || null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) Object.assign(headers, extra);
  return headers;
}

// ---- Построитель запросов к таблицам (PostgREST-подобный) ----
function buildQuery(table: string) {
  const params: string[] = [];
  let selectQuery = '*';
  let limitNum: number | null = null;
  let isSingle = false;

  const q: any = {
    select(query: string) { selectQuery = query; return q; },
    eq(col: string, val: any) { params.push(`${col}=eq.${encodeURIComponent(String(val))}`); return q; },
    gte(col: string, val: any) { params.push(`${col}=gte.${encodeURIComponent(String(val))}`); return q; },
    lte(col: string, val: any) { params.push(`${col}=lte.${encodeURIComponent(String(val))}`); return q; },
    in(col: string, vals: any[]) {
      if (vals && vals.length > 0) params.push(`${col}=in.(${vals.map((v) => encodeURIComponent(String(v))).join(',')})`);
      return q;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      params.push(`order=${encodeURIComponent(col)}.${opts?.ascending !== false ? 'asc' : 'desc'}`);
      return q;
    },
    limit(n: number) { limitNum = n; return q; },
    single() { isSingle = true; return q; },
    then(resolve: any, reject?: any) {
      let url = `${API}/${table}?select=${encodeURIComponent(selectQuery)}`;
      if (params.length) url += '&' + params.join('&');
      if (limitNum) url += `&limit=${limitNum}`;
      url += `&_ts=${Date.now()}`;
      fetch(url, { headers: authHeaders() })
        .then(async (res) => {
          if (!res.ok) {
            const t = await res.text();
            resolve({ data: null, error: new Error(t) });
            return;
          }
          let data = await res.json();
          if (isSingle) data = data?.[0] || null;
          resolve({ data, error: null });
        })
        .catch((err) => resolve({ data: null, error: err }));
    },
  };

  q.insert = async (values: any) => {
    try {
      const res = await fetch(`${API}/${table}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const text = await res.text();
        try { const j = JSON.parse(text); return { data: null, error: new Error(j.message || text) }; } catch {}
        return { data: null, error: new Error(text) };
      }
      return { data: await res.json(), error: null };
    } catch (err: any) { return { data: null, error: err }; }
  };

  q.delete = () => ({
    eq: async (col: string, val: any) => {
      try {
        const res = await fetch(`${API}/${table}?${col}=eq.${encodeURIComponent(String(val))}`,
          { method: 'DELETE', headers: authHeaders() });
        return { data: res.ok ? await res.json() : null, error: res.ok ? null : new Error(await res.text()) };
      } catch (err: any) { return { data: null, error: err }; }
    },
  });

  q.update = (values: any) => ({
    eq: async (col: string, val: any) => {
      try {
        const res = await fetch(`${API}/${table}?${col}=eq.${encodeURIComponent(String(val))}`, {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(values),
        });
        return { data: res.ok ? await res.json() : null, error: res.ok ? null : new Error(await res.text()) };
      } catch (err: any) { return { data: null, error: err }; }
    },
  });

  return q;
}

// ---- Авторизация ----
async function authFetch(method: string, data: any) {
  try {
    const res = await fetch(`${API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ method, ...data }),
    });
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch { return { ok: res.ok, status: res.status, data: { error: text } }; }
  } catch {
    return { ok: false, status: 0, data: { error: 'network_error' } };
  }
}

function saveSession(user: SessionUser, token: string) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, userId: user.id, email: user.email, role: user.role }));
}

export const supabase = {
  from(table: string) { return buildQuery(table); },

  auth: {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const r = await authFetch('login', { email: email.trim().toLowerCase(), password });
      if (!r.ok) {
        return { data: { user: null, session: null }, error: { message: 'Неверный email или пароль' } };
      }
      const d = r.data;
      const user: SessionUser = { id: d.id, email: d.email, role: d.role || 'employee' };
      saveSession(user, d.token);
      return { data: { user, session: { user, access_token: d.token } }, error: null };
    },

    // Регистрация отключена: пользователей создаёт только админ
    signUp: async () => {
      return { data: { user: null, session: null }, error: { message: 'Регистрация отключена. Обратитесь к администратору.' } };
    },

    getSession: async () => {
      const stored = readStored();
      if (!stored?.token) return { data: { session: null } };
      const r = await authFetch('verify', { token: stored.token });
      if (!r.ok || !r.data || r.data.error) {
        localStorage.removeItem(AUTH_KEY);
        return { data: { session: null } };
      }
      const d = r.data;
      const user: SessionUser = { id: d.id, email: d.email, role: d.role || 'employee' };
      saveSession(user, stored.token);
      return { data: { session: { user, access_token: stored.token } } };
    },

    getUser: (): SessionUser | null => {
      const s = readStored();
      if (!s?.role) return null;
      return { id: s.userId || '', email: s.email || '', role: s.role as SessionUser['role'] };
    },

    signOut: () => {
      localStorage.removeItem(AUTH_KEY);
    },

    onAuthStateChange: (_callback: (event: string, session: any) => void) => {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
};

// ---- Управление пользователями (только для админа) ----
export const adminApi = {
  listUsers: async () => {
    const res = await fetch(`${API}/users`, { headers: authHeaders() });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || 'Ошибка загрузки пользователей');
    }
    return res.json();
  },

  createUser: async (email: string, password: string, role: string) => {
    const res = await fetch(`${API}/users`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password, role }),
    });
    const t = await res.text();
    let j: any = {};
    try { j = JSON.parse(t); } catch {}
    if (!res.ok) throw new Error(j.error || t);
    return j;
  },

  deleteUser: async (id: string) => {
    const res = await fetch(`${API}/users?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const t = await res.text();
    let j: any = {};
    try { j = JSON.parse(t); } catch {}
    if (!res.ok) throw new Error(j.error || t);
    return j;
  },
};
