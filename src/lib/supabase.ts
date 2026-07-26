// ── Data API (PostgREST) ──

const API = '/api';

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
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(async (res) => {
          if (!res.ok) { const t = await res.text(); resolve({ data: null, error: new Error(t) }); return; }
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(Array.isArray(values) ? values : values),
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
        const res = await fetch(`${API}/${table}?${col}=eq.${encodeURIComponent(String(val))}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
        return { data: res.ok ? await res.json() : null, error: res.ok ? null : new Error(await res.text()) };
      } catch (err: any) { return { data: null, error: err }; }
    },
  });

  q.update = (values: any) => ({
    eq: async (col: string, val: any) => {
      try {
        const res = await fetch(`${API}/${table}?${col}=eq.${encodeURIComponent(String(val))}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(values),
        });
        return { data: res.ok ? await res.json() : null, error: res.ok ? null : new Error(await res.text()) };
      } catch (err: any) { return { data: null, error: err }; }
    },
  });

  return q;
}

// ── Simple auth ──

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '-transport-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const AUTH_KEY = 'transport-stats-auth-v2';

async function findUser(email: string) {
  const res = await fetch(`${API}/users?email=eq.${encodeURIComponent(email)}&select=*`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const users = await res.json();
  return users?.[0] || null;
}

// ── Exported supabase client ──

export const supabase = {
  from(table: string) { return buildQuery(table); },
  auth: {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const user = await findUser(email);
      if (!user) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      const hash = await hashPassword(password);
      if (user.password_hash !== hash) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      const session = { user: { id: user.id, email: user.email }, access_token: 'local-' + Date.now() };
      localStorage.setItem(AUTH_KEY, JSON.stringify({ email, password, userId: user.id }));
      return { data: { user: { id: user.id, email: user.email }, session }, error: null };
    },
    signUp: async ({ email, password }: { email: string; password: string }) => {
      const existing = await findUser(email);
      if (existing) return { data: { user: null, session: null }, error: { message: 'User already registered' } };
      const hash = await hashPassword(password);
      const res = await fetch(`${API}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ email, password_hash: hash }),
      });
      if (!res.ok) {
        const t = await res.text();
        try { const j = JSON.parse(t); return { data: null, error: { message: j.message || t } }; } catch {}
        return { data: null, error: { message: t } };
      }
      return { data: { user: { id: '', email }, session: null }, error: null };
    },
    getSession: async () => {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return { data: { session: null } };
      try {
        const { email, password, userId } = JSON.parse(raw);
        if (email && password) {
          const user = await findUser(email);
          if (user) {
            const hash = await hashPassword(password);
            if (user.password_hash === hash) {
              return { data: { session: { user: { id: user.id, email: user.email }, access_token: 'local-' + Date.now() } } };
            }
          }
        }
      } catch {}
      localStorage.removeItem(AUTH_KEY);
      return { data: { session: null } };
    },
    onAuthStateChange: (_callback: (event: string, session: any) => void) => {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
};
