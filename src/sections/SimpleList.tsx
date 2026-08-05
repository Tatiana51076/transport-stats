import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import { SectionHeader, Modal, Field, FormActions } from '@/sections/Cars';
import { formatDate, toDateInput } from '@/lib/format';
import type { ToastFn } from '@/hooks/useToasts';

interface SimpleItem {
  id: string;
  name?: string;
  full_name?: string;
  birth_date?: string | null;
  created_at: string;
}

function daysUntilBirthday(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
}

interface SimpleListProps {
  title: string;
  subtitle: string;
  fieldName: string;
  tableName: 'drivers' | 'contractors' | 'trips';
  items: SimpleItem[];
  loading: boolean;
  notify: ToastFn;
  onChanged: () => void;
}

export function SimpleList({ title, subtitle, fieldName, tableName, items, loading, notify, onChanged }: SimpleListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<SimpleItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<SimpleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const labelOf = (i: SimpleItem) => i.name || i.full_name || '—';

  const handleDelete = async () => {
    if (!confirmItem) return;
    setDeleting(true);
    const { error } = await supabase.from(tableName).delete().eq('id', confirmItem.id);
    setDeleting(false);
    if (error) { notify('Ошибка при удалении', 'error'); }
    else { notify('Запись удалена'); setConfirmItem(null); onChanged(); }
  };

  const fieldLabel = tableName === 'drivers' ? 'ФИО' : tableName === 'contractors' ? 'Наименование' : 'Название / номер рейса';

  return (
    <div className="space-y-6">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Добавить</span>
            <span className="sm:hidden">+</span>
          </button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title={`Список пуст`} description={`Нажмите «Добавить», чтобы создать первую запись`} />
      ) : (
        <div className="card-base divide-y divide-primary-50 overflow-hidden">
          {items.map((item) => {
            const days = tableName === 'drivers' ? daysUntilBirthday(item.birth_date) : null;
            const isBirthdaySoon = days !== null && days <= 3 && days >= 0;
            const isBirthdayToday = days === 0;
            return (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-primary-50/40 ${isBirthdayToday ? 'bg-accent-50' : isBirthdaySoon ? 'bg-warning-50' : ''}`}>
              <div className={`h-2 w-2 shrink-0 rounded-full ${isBirthdaySoon ? 'bg-accent-500 animate-pulse' : 'bg-primary-400'}`} />
              <span className="flex-1 truncate text-sm font-medium text-primary-800">{labelOf(item)}</span>
              {tableName === 'drivers' && item.birth_date && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isBirthdayToday ? 'bg-accent-600 text-white' : isBirthdaySoon ? 'bg-accent-100 text-accent-700' : 'bg-primary-50 text-primary-400'}`}>
                  {isBirthdayToday ? '🎂 Сегодня!' : isBirthdaySoon ? `🎂 Через ${days} дн.` : formatDate(item.birth_date)}
                </span>
              )}
              <button onClick={() => setEditItem(item)} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-100 hover:text-primary-600" title="Редактировать">
                <Pencil className="h-4 w-4" />
              </button>
              <DeleteButton onClick={() => setConfirmItem(item)} />
            </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddSimpleForm
          title={`Добавить — ${title}`}
          fieldLabel={fieldLabel}
          fieldName={fieldName}
          tableName={tableName}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onChanged(); }}
          notify={notify}
        />
      )}

      {editItem && (
        <EditSimpleForm
          title={`Редактировать — ${title}`}
          fieldLabel={fieldLabel}
          fieldName={fieldName}
          tableName={tableName}
          item={editItem}
          value={labelOf(editItem)}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); onChanged(); }}
          notify={notify}
        />
      )}

      <ConfirmModal
        open={!!confirmItem}
        title="Удалить запись?"
        message={confirmItem ? `«${labelOf(confirmItem)}» будет удалена. Связанные рейсы сохранятся, но ссылка на эту запись будет очищена.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setConfirmItem(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}

interface AddSimpleFormProps {
  title: string;
  fieldLabel: string;
  fieldName: string;
  tableName: 'drivers' | 'contractors' | 'trips';
  onClose: () => void;
  onSaved: () => void;
  notify: ToastFn;
}

function AddSimpleForm({ title, fieldLabel, fieldName, tableName, onClose, onSaved, notify }: AddSimpleFormProps) {
  const [value, setValue] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!value.trim()) { setErr('Поле обязательно для заполнения'); return; }
    setSaving(true);
    const payload = tableName === 'drivers' ? { full_name: value.trim(), birth_date: birthDate || null } : { name: value.trim() };
    const { error } = await supabase.from(tableName).insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Запись добавлена');
    onSaved();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={fieldLabel}>
          <input className="input-base" value={value} onChange={(e) => setValue(e.target.value)} placeholder={fieldLabel} autoFocus />
        </Field>
        {tableName === 'drivers' && (
          <Field label="Дата рождения">
            <input type="date" className="input-base" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        )}
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}

interface EditSimpleFormProps {
  title: string;
  fieldLabel: string;
  fieldName: string;
  tableName: 'drivers' | 'contractors' | 'trips';
  item: SimpleItem;
  value: string;
  onClose: () => void;
  onSaved: () => void;
  notify: ToastFn;
}

function EditSimpleForm({ title, fieldLabel, fieldName, tableName, item, value: initialValue, onClose, onSaved, notify }: EditSimpleFormProps) {
  const [value, setValue] = useState(initialValue);
  const [birthDate, setBirthDate] = useState(item.birth_date ? toDateInput(item.birth_date) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!value.trim()) { setErr('Поле обязательно для заполнения'); return; }
    setSaving(true);
    const payload = tableName === 'drivers' ? { full_name: value.trim(), birth_date: birthDate || null } : { name: value.trim() };
    const { error } = await supabase.from(tableName).update(payload).eq('id', item.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Запись изменена');
    onSaved();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={fieldLabel}>
          <input className="input-base" value={value} onChange={(e) => setValue(e.target.value)} placeholder={fieldLabel} autoFocus />
        </Field>
        {tableName === 'drivers' && (
          <Field label="Дата рождения">
            <input type="date" className="input-base" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        )}
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
