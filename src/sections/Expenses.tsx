import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Fuel, Users, Receipt, MoreHorizontal, Plus, Truck, Calendar, Hash, DollarSign, User, AlignLeft, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseWithCar, Car } from '@/lib/types';
import { EXPENSE_CATEGORIES } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { SectionHeader, Modal, Field, Select, FormActions } from '@/sections/Cars';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import { VoiceInputButton } from '@/components/VoiceInput';
import { parseVoiceInput } from '@/lib/voiceParser';
import type { ToastFn } from '@/hooks/useToasts';

type ExpenseCategory = Expense['category'];

const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: React.ComponentType<{ className?: string }>; label: string; hasCar: boolean; hasDesc: boolean; hasEmployee: boolean }> = {
  leasing: { icon: FileText, label: 'Лизинг', hasCar: true, hasDesc: true, hasEmployee: false },
  fuel: { icon: Fuel, label: 'Топливо', hasCar: true, hasDesc: true, hasEmployee: false },
  salary: { icon: Users, label: 'Зарплата', hasCar: false, hasDesc: false, hasEmployee: true },
  taxes: { icon: Receipt, label: 'Налоги', hasCar: true, hasDesc: true, hasEmployee: true },
  other: { icon: MoreHorizontal, label: 'Прочие', hasCar: true, hasDesc: true, hasEmployee: true },
};

interface ExpensesSectionProps {
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  notify: ToastFn;
}

export function ExpensesSection({ cars, drivers, notify }: ExpensesSectionProps) {
  const [tab, setTab] = useState<ExpenseCategory>('leasing');
  const [expenses, setExpenses] = useState<ExpenseWithCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseWithCar | null>(null);
  const [editExpense, setEditExpense] = useState<ExpenseWithCar | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('expenses')
      .select('*, cars(id,plate_number,brand,model)')
      .eq('category', tab);
    if (dateFrom) q = q.gte('date', dateFrom);
    if (dateTo) q = q.lte('date', dateTo);
    q = q.order('date', { ascending: false });
    const { data, error } = await q;
    if (!error) setExpenses((data as ExpenseWithCar[]) || []);
    setLoading(false);
  }, [tab, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('expenses').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) { notify('Ошибка удаления', 'error'); }
    else { notify('Расход удалён'); setConfirmDelete(null); load(); }
  };

  const totalAmount = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Расходы" subtitle="Учёт всех затрат по категориям" />

      <div className="flex flex-wrap gap-2">
        {EXPENSE_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_CONFIG[cat.key].icon;
          const isActive = tab === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setTab(cat.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-accent-600 text-white shadow-card' : 'bg-white text-primary-600 border border-primary-200 hover:bg-primary-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-primary-500">С</label>
          <input type="date" className="input-base py-1.5 px-2 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-primary-500">По</label>
          <input type="date" className="input-base py-1.5 px-2 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-primary-500 hover:text-primary-700 underline">
            Сбросить
          </button>
        )}
      </div>

      <AddExpenseForm category={tab} cars={cars} drivers={drivers} onSaved={load} notify={notify} />

      <div className="card-base p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary-900">{CATEGORY_CONFIG[tab].label}</h3>
          <span className="text-sm font-semibold text-primary-600">Всего: {formatRub(totalAmount)}</span>
        </div>

        {loading ? (
          <LoadingState />
        ) : expenses.length === 0 ? (
          <EmptyState title="Нет расходов" description={`Добавьте первый расход в категории «${CATEGORY_CONFIG[tab].label}»`} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  {CATEGORY_CONFIG[tab].hasCar && <th className="px-4 py-3 font-semibold">Автомобиль</th>}
                  {CATEGORY_CONFIG[tab].hasEmployee && <th className="px-4 py-3 font-semibold">Сотрудник</th>}
                  {CATEGORY_CONFIG[tab].hasDesc && <th className="px-4 py-3 font-semibold">Описание</th>}
                  {tab === 'taxes' && <th className="px-4 py-3 text-right font-semibold">Надо оплатить</th>}
                  {tab === 'taxes' && <th className="px-4 py-3 text-right font-semibold">Срок до</th>}
                  {tab === 'taxes' && <th className="px-4 py-3 text-right font-semibold">Осталось</th>}
                  {tab === 'taxes' && <th className="px-4 py-3 text-right font-semibold">Дней</th>}
                  <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                  {tab === 'fuel' && <th className="px-4 py-3 text-right font-semibold">Литров</th>}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {expenses.map((e) => {
                  const remaining = e.amount_to_pay ? e.amount_to_pay - e.amount : null;
                  const daysLeft = e.due_date ? Math.ceil((new Date(e.due_date).getTime() - Date.now()) / 86400000) : null;
                  return (
                  <tr key={e.id} className="transition hover:bg-primary-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(e.date)}</td>
                    {CATEGORY_CONFIG[tab].hasCar && <td className="px-4 py-3 text-primary-600">{e.cars?.plate_number || '—'}</td>}
                    {CATEGORY_CONFIG[tab].hasEmployee && <td className="px-4 py-3 text-primary-600">{e.employee_name || '—'}</td>}
                    {CATEGORY_CONFIG[tab].hasDesc && <td className="px-4 py-3 text-primary-600">{e.description || '—'}</td>}
                    {tab === 'taxes' && <td className="px-4 py-3 text-right font-semibold text-primary-800">{e.amount_to_pay ? formatRub(e.amount_to_pay) : '—'}</td>}
                    {tab === 'taxes' && <td className="px-4 py-3 text-right font-semibold text-primary-800">{e.due_date ? formatDate(e.due_date) : '—'}</td>}
                    {tab === 'taxes' && <td className="px-4 py-3 text-right font-semibold" style={{ color: remaining !== null && remaining > 0 ? '#ef4444' : '#22c55e' }}>{remaining !== null ? formatRub(Math.max(remaining, 0)) : '—'}</td>}
                    {tab === 'taxes' && <td className={`px-4 py-3 text-right font-semibold ${daysLeft !== null && daysLeft <= 7 ? 'text-error-600' : 'text-primary-600'}`}>{daysLeft !== null ? daysLeft + ' дн.' : '—'}</td>}
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(e.amount)}</td>
                    {tab === 'fuel' && <td className="px-4 py-3 text-right font-semibold text-primary-800">{e.liters ? `${e.liters} л` : '—'}</td>}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditExpense(e)} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-100 hover:text-primary-600" title="Редактировать"><Pencil className="h-4 w-4" /></button>
                        <DeleteButton onClick={() => setConfirmDelete(e)} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить расход?"
        message={`Расход на сумму ${formatRub(confirmDelete?.amount || 0)} будет удалён.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />

      {editExpense && (
        <EditExpenseForm expense={editExpense} cars={cars} drivers={drivers} category={tab} onClose={() => setEditExpense(null)} onSaved={() => { setEditExpense(null); load(); }} notify={notify} />
      )}
    </div>
  );
}

interface AddExpenseFormProps {
  category: ExpenseCategory;
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  onSaved: () => void;
  notify: ToastFn;
}

function AddExpenseForm({ category, cars, drivers, onSaved, notify }: AddExpenseFormProps) {
  const cfg = CATEGORY_CONFIG[category];
  const today = toDateInput(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [carId, setCarId] = useState('');
  const [amount, setAmount] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [description, setDescription] = useState('');
  const [liters, setLiters] = useState('');
  const [amountToPay, setAmountToPay] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const voiceLookups = useMemo(() => ({
    cars: cars.map((c) => ({ id: c.id, label: `${c.plate_number} ${c.brand || ''}` })),
    drivers: drivers.map((d) => ({ id: d.id, label: d.full_name })),
    contractors: [], trips: [],
  }), [cars, drivers]);

  const handleVoiceResult = useCallback((text: string) => {
    const parsed = parseVoiceInput(text, voiceLookups);
    if (parsed.date) setDate(parsed.date);
    if (parsed.cost !== undefined) setAmount(String(parsed.cost));
    if (parsed.plate_number) setCarId(parsed.plate_number);
    if (parsed.textValue && cfg.hasEmployee) setEmployeeName(parsed.textValue);
    notify('Голос распознан. Проверьте поля', 'info');
  }, [voiceLookups, notify, cfg]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!date) { setErr('Укажите дату'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setErr('Сумма должна быть больше 0'); return; }
    if (cfg.hasEmployee && employeeName && !employeeName.trim()) { setErr('Укажите сотрудника'); return; }

    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      category,
      car_id: cfg.hasCar && carId ? carId : null,
      amount: amountNum,
      date,
      description: cfg.hasDesc && description.trim() ? description.trim() : null,
      employee_name: cfg.hasEmployee && employeeName ? employeeName.trim() || null : null,
      amount_to_pay: category === 'taxes' && amountToPay ? parseFloat(amountToPay) : null,
      due_date: category === 'taxes' && dueDate ? dueDate : null,
      liters: liters ? parseFloat(liters) : null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Расход добавлен');
    setDate(today); setCarId(''); setAmount(''); setEmployeeName(''); setDescription('');
    onSaved();
  };

  return (
    <div className="card-base p-5">
      <h3 className="mb-4 text-base font-bold text-primary-900">Добавить расход — {cfg.label}</h3>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Дата *">
            <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {cfg.hasCar && (
            <Field label="Автомобиль">
              <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" />
            </Field>
          )}
          {cfg.hasEmployee && (
            <Field label="Сотрудник">
              <Select value={employeeName} onChange={setEmployeeName} options={drivers.map((d) => ({ value: d.full_name, label: d.full_name }))} placeholder="Выберите или пропустите" />
            </Field>
          )}
          {cfg.hasDesc && (
            <Field label="Описание">
              <input className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Назначение расхода" />
            </Field>
          )}
          <Field label="Сумма, ₽ *">
            <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
          </Field>
        </div>

        {category === 'fuel' && (
          <Field label="Литров">
            <input type="number" min="0" step="0.1" className="input-base" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="50" />
          </Field>
        )}

        {category === 'taxes' && (
          <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4">
            <Field label="Сумма к оплате (всего)">
              <input type="number" min="0" step="0.01" className="input-base" value={amountToPay} onChange={(e) => setAmountToPay(e.target.value)} placeholder="100000" />
            </Field>
            <Field label="Срок оплаты до">
              <input type="date" className="input-base" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        )}

        {err && <p className="text-sm text-error-600">{err}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <VoiceInputButton onResult={handleVoiceResult} label="Продиктовать расход" />
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60">
            <Plus className="h-4 w-4" />
            {saving ? 'Сохранение…' : 'Добавить'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditExpenseForm({ expense, cars, drivers, category, onClose, onSaved, notify }: {
  expense: ExpenseWithCar;
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  category: ExpenseCategory;
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const cfg = CATEGORY_CONFIG[category];
  const [date, setDate] = useState(toDateInput(expense.date));
  const [carId, setCarId] = useState(expense.car_id || '');
  const [amount, setAmount] = useState(String(expense.amount));
  const [employeeName, setEmployeeName] = useState(expense.employee_name || '');
  const [description, setDescription] = useState(expense.description || '');
  const [amountToPay, setAmountToPay] = useState(expense.amount_to_pay ? String(expense.amount_to_pay) : '');
  const [dueDate, setDueDate] = useState(expense.due_date ? toDateInput(expense.due_date) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!date) { setErr('Укажите дату'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setErr('Сумма должна быть больше 0'); return; }
    setSaving(true);
    const { error } = await supabase.from('expenses').update({
      date,
      car_id: cfg.hasCar && carId ? carId : null,
      amount: amountNum,
      description: cfg.hasDesc && description.trim() ? description.trim() : null,
      employee_name: cfg.hasEmployee && employeeName ? employeeName.trim() || null : null,
      amount_to_pay: category === 'taxes' && amountToPay ? parseFloat(amountToPay) : null,
      due_date: category === 'taxes' && dueDate ? dueDate : null,
    }).eq('id', expense.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Расход изменён');
    onSaved();
  };

  return (
    <Modal title="Редактировать расход" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Дата *">
          <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {cfg.hasCar && (
          <Field label="Автомобиль">
            <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" />
          </Field>
        )}
        {cfg.hasEmployee && (
          <Field label="Сотрудник">
            <Select value={employeeName} onChange={setEmployeeName} options={drivers.map((d) => ({ value: d.full_name, label: d.full_name }))} placeholder="Выберите или пропустите" />
          </Field>
        )}
        {cfg.hasDesc && (
          <Field label="Описание">
            <input className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Назначение расхода" />
          </Field>
        )}
        <Field label="Сумма, ₽ *">
          <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
        </Field>
        {category === 'taxes' && (
          <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4">
            <Field label="Сумма к оплате (всего)">
              <input type="number" min="0" step="0.01" className="input-base" value={amountToPay} onChange={(e) => setAmountToPay(e.target.value)} placeholder="100000" />
            </Field>
            <Field label="Срок оплаты до">
              <input type="date" className="input-base" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        )}
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
