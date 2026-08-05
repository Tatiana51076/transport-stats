import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, Plus, Pencil, CheckCircle2, XCircle, AlertTriangle, Truck, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FineWithRefs, Car, RecordWithRefs } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { SectionHeader, Modal, Field, Select, FormActions } from '@/sections/Cars';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import type { ToastFn } from '@/hooks/useToasts';

type PeriodKey = 'week' | 'month' | 'halfyear' | 'year' | 'custom';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'halfyear', label: 'Полгода' },
  { key: 'year', label: 'Год' },
  { key: 'custom', label: 'Произвольный' },
];

function rangeFor(p: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (p === 'week') from.setDate(now.getDate() - 7);
  else if (p === 'month') from.setMonth(now.getMonth() - 1);
  else if (p === 'halfyear') from.setMonth(now.getMonth() - 6);
  else if (p === 'year') from.setFullYear(now.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface DriverRatingProps {
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  notify: ToastFn;
}

export function DriverRating({ cars, drivers, notify }: DriverRatingProps) {
  const [fines, setFines] = useState<FineWithRefs[]>([]);
  const [records, setRecords] = useState<RecordWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editFine, setEditFine] = useState<FineWithRefs | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FineWithRefs | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(rangeFor('month').from);
  const [customTo, setCustomTo] = useState(rangeFor('month').to);
  const [driverFilter, setDriverFilter] = useState('');
  const [carFilter, setCarFilter] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const { from, to } = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, r] = await Promise.all([
      supabase.from('fines').select('*, cars(id,plate_number), drivers(id,full_name)'),
      supabase.from('records').select('*, cars(id,plate_number), drivers(id,full_name), contractors(id,name), trips(id,name)'),
    ]);
    if (!f.error) setFines((f.data as FineWithRefs[]) || []);
    if (!r.error) setRecords((r.data as RecordWithRefs[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('fines').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) { notify('Ошибка удаления', 'error'); }
    else { notify('Штраф удалён'); setConfirmDelete(null); load(); }
  };

  const handleTogglePaid = async (fine: FineWithRefs) => {
    const { error } = await supabase.from('fines').update({ paid: !fine.paid }).eq('id', fine.id);
    if (!error) load();
  };

  // Filter fines by period, driver, car
  const filteredFines = useMemo(() => {
    let rows = fines.filter((f) => f.date >= from && f.date <= to);
    if (driverFilter) rows = rows.filter((f) => f.driver_id === driverFilter);
    if (carFilter) rows = rows.filter((f) => f.car_id === carFilter);
    return [...rows].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [fines, from, to, driverFilter, carFilter, sortAsc]);

  // Build rating: fewer fines = higher, but combined with revenue and trips
  const rating = useMemo(() => {
    const map = new Map<string, { name: string; trips: number; revenue: number; fineCount: number; fineSum: number }>();
    for (const r of records) {
      if (r.date < from || r.date > to) continue;
      const d = r.drivers;
      if (!d) continue;
      const e = map.get(d.id) || { name: d.full_name, trips: 0, revenue: 0, fineCount: 0, fineSum: 0 };
      e.trips += 1;
      e.revenue += Number(r.cost);
      map.set(d.id, e);
    }
    for (const f of fines) {
      if (f.date < from || f.date > to) continue;
      const d = f.drivers;
      if (!d) continue;
      const e = map.get(d.id) || { name: d.full_name, trips: 0, revenue: 0, fineCount: 0, fineSum: 0 };
      e.fineCount += 1;
      e.fineSum += Number(f.amount);
      map.set(d.id, e);
    }
    const rows = Array.from(map.entries()).map(([id, e]) => {
      // Score: revenue base minus fines penalty (each fine = 1 point, sum scales)
      const score = e.revenue - e.fineSum * 5;
      return { id, ...e, score };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [records, fines, from, to]);

  const maxFineSum = Math.max(...rating.map((r) => r.fineSum), 1);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Рейтинг водителей"
        subtitle="Кто меньше штрафуется и больше зарабатывает — тот выше"
        action={
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Добавить штраф</span>
            <span className="sm:hidden">+</span>
          </button>
        }
      />

      {showAdd && <AddFineForm cars={cars} drivers={drivers} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} notify={notify} />}
      {editFine && <EditFineForm fine={editFine} cars={cars} drivers={drivers} onClose={() => setEditFine(null)} onSaved={() => { setEditFine(null); load(); }} notify={notify} />}

      {/* Filters */}
      <div className="card-base p-4 no-print">
        <div className="flex flex-wrap gap-2 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); if (p !== 'custom') { const r = rangeFor(p.key); setCustomFrom(r.from); setCustomTo(r.to); } }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p.key ? 'bg-accent-600 text-white shadow-card' : 'bg-white text-primary-500 border border-primary-100 hover:bg-primary-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div><label className="label-base">С</label><input type="date" className="input-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div><label className="label-base">По</label><input type="date" className="input-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
          <div>
            <label className="label-base">Водитель</label>
            <Select value={driverFilter} onChange={setDriverFilter} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Все водители" />
          </div>
          <div>
            <label className="label-base">Автомобиль</label>
            <Select value={carFilter} onChange={setCarFilter} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Все автомобили" />
          </div>
          <div className="flex items-end">
            <button onClick={() => setSortAsc(!sortAsc)} className="rounded-lg border border-primary-200 bg-white px-3 py-2 text-xs font-semibold text-primary-700 transition hover:bg-primary-50">
              {sortAsc ? '↑ Сначала старые' : '↓ Сначала новые'}
            </button>
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="card-base p-6">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-accent-600" />
          <h3 className="text-base font-bold text-primary-900">Рейтинг за период {formatDate(from)} — {formatDate(to)}</h3>
        </div>
        {rating.length === 0 ? (
          <p className="py-6 text-center text-sm text-primary-400">Нет данных за период</p>
        ) : (
          <div className="space-y-3">
            {rating.map((r, i) => {
              const isTop = i === 0 && r.fineCount === 0;
              const isBad = r.fineCount >= 3;
              return (
                <div key={r.id} className={`rounded-xl border p-3 transition ${isTop ? 'border-success-300 bg-success-50' : isBad ? 'border-error-300 bg-error-50' : 'border-primary-100 bg-white'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-primary-900">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-accent-600 text-white' : 'bg-primary-100 text-primary-600'}`}>{i + 1}</span>
                      <span className="truncate">{r.name}</span>
                      {r.fineCount >= 3 && <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-error-600 px-2 py-0.5 text-[10px] font-bold text-white"><AlertTriangle className="h-3 w-3" /> Частые нарушения</span>}
                      {r.fineCount === 0 && <span className="shrink-0 inline-flex items-center rounded-full bg-success-600 px-2 py-0.5 text-[10px] font-bold text-white">Без штрафов</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-primary-900">{formatRub(r.score)}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-primary-500">
                    <span>🚚 {r.trips} рейсов</span>
                    <span>💰 {formatRub(r.revenue)} доход</span>
                    <span className={r.fineCount > 0 ? 'font-semibold text-error-600' : ''}>⚠️ {r.fineCount} штрафов</span>
                    <span className={r.fineSum > 0 ? 'font-semibold text-error-600' : ''}>на {formatRub(r.fineSum)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fines detail table */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100">
          <h3 className="text-base font-bold text-primary-900">Штрафы</h3>
        </div>
        {loading ? (
          <LoadingState />
        ) : filteredFines.length === 0 ? (
          <EmptyState title="Штрафов нет" description="Нажмите «Добавить штраф»" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Водитель</th>
                  <th className="px-4 py-3 font-semibold">Автомобиль</th>
                  <th className="px-4 py-3 font-semibold">Описание</th>
                  <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                  <th className="px-4 py-3 text-center font-semibold">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {filteredFines.map((f) => (
                  <tr key={f.id} className="transition hover:bg-primary-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(f.date)}</td>
                    <td className="px-4 py-3 text-primary-700">{f.drivers?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{f.cars?.plate_number || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{f.description || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(f.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleTogglePaid(f)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition hover:opacity-80 ${f.paid ? 'bg-success-50 text-success-700 border-success-200' : 'bg-error-50 text-error-700 border-error-200'}`}>
                        {f.paid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {f.paid ? 'Оплачен' : 'Не оплачен'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditFine(f)} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-100 hover:text-primary-600" title="Редактировать"><Pencil className="h-4 w-4" /></button>
                        <DeleteButton onClick={() => setConfirmDelete(f)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить штраф?"
        message={`Штраф на сумму ${formatRub(confirmDelete?.amount || 0)} будет удалён.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}

function AddFineForm({ cars, drivers, onClose, onSaved, notify }: {
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const today = toDateInput(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [driverId, setDriverId] = useState('');
  const [carId, setCarId] = useState('');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!driverId) { setErr('Выберите водителя'); return; }
    if (!date) { setErr('Укажите дату'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть больше 0'); return; }
    setSaving(true);
    const { error } = await supabase.from('fines').insert({
      driver_id: driverId,
      car_id: carId || null,
      date, amount: amt, paid,
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Штраф добавлен');
    onSaved();
  };

  return (
    <Modal title="Добавить штраф" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Водитель *">
          <Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Выберите водителя" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дата *"><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Сумма, ₽ *"><input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" /></Field>
        </div>
        <Field label="Автомобиль">
          <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" />
        </Field>
        <Field label="Описание">
          <input className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: превышение скорости" />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary-200 bg-white p-3 transition hover:bg-primary-50">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-5 w-5 rounded border-primary-300 text-accent-600" />
          <p className="text-sm font-medium text-primary-800">Штраф оплачен</p>
        </label>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}

function EditFineForm({ fine, cars, drivers, onClose, onSaved, notify }: {
  fine: FineWithRefs;
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const [date, setDate] = useState(toDateInput(fine.date));
  const [driverId, setDriverId] = useState(fine.driver_id || '');
  const [carId, setCarId] = useState(fine.car_id || '');
  const [amount, setAmount] = useState(String(fine.amount));
  const [paid, setPaid] = useState(!!fine.paid);
  const [description, setDescription] = useState(fine.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!driverId) { setErr('Выберите водителя'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть больше 0'); return; }
    setSaving(true);
    const { error } = await supabase.from('fines').update({
      driver_id: driverId,
      car_id: carId || null,
      date, amount: amt, paid,
      description: description.trim() || null,
    }).eq('id', fine.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Штраф изменён');
    onSaved();
  };

  return (
    <Modal title="Редактировать штраф" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Водитель *">
          <Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Выберите водителя" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дата *"><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Сумма, ₽ *"><input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" /></Field>
        </div>
        <Field label="Автомобиль">
          <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" />
        </Field>
        <Field label="Описание">
          <input className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: превышение скорости" />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary-200 bg-white p-3 transition hover:bg-primary-50">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-5 w-5 rounded border-primary-300 text-accent-600" />
          <p className="text-sm font-medium text-primary-800">Штраф оплачен</p>
        </label>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
