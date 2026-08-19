import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Shield, User as UserIcon, Trash2, RefreshCw } from 'lucide-react';
import { adminApi, supabase } from '@/lib/supabase';
import type { User } from '@/lib/types';
import { ConfirmModal } from '@/components/ConfirmModal';
import { LoadingState } from '@/components/States';
import { SectionHeader } from '@/sections/Cars';
import type { ToastFn } from '@/hooks/useToasts';

interface UsersProps {
  notify: ToastFn;
}

const ROLE_LABELS: Record<User['role'], string> = {
  admin: 'Администратор',
  employee: 'Сотрудник',
};

export function Users({ notify }: UsersProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('employee');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = supabase.auth.getUser();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await adminApi.listUsers());
    } catch (e: any) {
      notify('Ошибка загрузки пользователей', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) { setErr('Введите email'); return; }
    if (password.length < 6) { setErr('Пароль должен быть не менее 6 символов'); return; }
    setSaving(true);
    try {
      await adminApi.createUser(email.trim(), password, role);
      notify(`Пользователь ${email.trim()} создан`);
      setEmail(''); setPassword(''); setRole('employee');
      load();
    } catch (e: any) {
      let msg = e.message || 'Ошибка создания';
      if (msg.includes('exists')) msg = 'Пользователь с таким email уже существует';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await adminApi.deleteUser(confirmDelete.id);
      notify(`Пользователь удалён`);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      let msg = e.message || 'Ошибка удаления';
      if (msg.includes('self')) msg = 'Нельзя удалить самого себя';
      if (msg.includes('last_admin')) msg = 'Нельзя удалить последнего администратора';
      notify(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Пользователи"
        subtitle="Управление доступом к приложению (только для администратора)"
        action={
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
          >
            <RefreshCw className="h-4 w-4" />
            Обновить
          </button>
        }
      />

      <div className="card-base p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-bold text-primary-900">Новый пользователь</h3>
        </div>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label-base">Email *</label>
            <input
              type="email"
              className="input-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.ru"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label-base">Пароль *</label>
            <input
              type="text"
              className="input-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label-base">Роль</label>
            <select className="input-base" value={role} onChange={(e) => setRole(e.target.value as User['role'])}>
              <option value="employee">Сотрудник</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Создание…' : 'Создать пользователя'}
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-primary-400">
          Сотрудник видит все данные и заполняет всё необходимое. Администратор дополнительно управляет пользователями.
        </p>
        {err && <p className="mt-2 text-sm text-error-600">{err}</p>}
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-primary-100 px-6 py-4">
          <h3 className="text-lg font-bold text-primary-900">Список пользователей</h3>
        </div>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="divide-y divide-primary-50">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  {u.role === 'admin' ? <Shield className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary-900">
                    {u.email}
                    {me?.id === u.id && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-500">это вы</span>}
                  </p>
                  <p className="text-xs text-primary-400">{ROLE_LABELS[u.role]}</p>
                </div>
                <button
                  onClick={() => setConfirmDelete(u)}
                  disabled={me?.id === u.id}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title={me?.id === u.id ? 'Нельзя удалить самого себя' : 'Удалить доступ'}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Удалить</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить пользователя?"
        message={`Пользователь «${confirmDelete?.email}» потеряет доступ к приложению. Если он вернётся на работу, можно будет выдать новый логин и пароль.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}
