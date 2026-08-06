import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fuel, Plus, Truck, User, Droplets, Receipt, TrendingUp, Calendar, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RefuelWithRefs, Car } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { SectionHeader, Modal, Field, Select, FormActions } from '@/sections/Cars';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import type { ToastFn } from '@/hooks/useToasts';

type PeriodKey = 'week' | 'month' | 'custom';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'custom', label: 'Произвольный' },
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFor(p: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (p === 'week') from.setDate(now.getDate() - 7);
  else if (p === 'month') from.setMonth(now.getMonth() - 1);
  return { from: toDateStr(from), to: toDateStr(to) };
}

interface RefuelsProps {
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  notify: ToastFn;
}

export function Refuels({ cars, drivers, notify }: RefuelsProps) {
  const [refuels, setRefuels] = useState<RefuelWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RefuelWithRefs | null>(null);
  const [editRefuel, setEditRefuel] = useState<RefuelWithRefs | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Report state
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(rangeFor('month').from);
  const [customTo, setCustomTo] = useState(rangeFor('month').to);
  const [sortAsc, setSortAsc] = useState(false);
  const [excludePersonal, setExcludePersonal] = useState(false);

  const { from, to } = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const personalCarIds = useMemo(() => cars.filter((c) => c.personal).map((c) => c.id), [cars]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('refuels').select('*, cars(id,plate_number), drivers(id,full_name)').gte('date', from).lte('date', to).order('date', { ascending: false });
    if (!error) setRefuels((data as RefuelWithRefs[]) || []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const filteredRefuels = useMemo(() => {
    if (!excludePersonal) return refuels;
    return refuels.filter((r) => !r.car_id || !personalCarIds.includes(r.car_id));
  }, [refuels, excludePersonal, personalCarIds]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('refuels').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) { notify('Ошибка удаления', 'error'); }
    else { notify('Заправка удалена'); setConfirmDelete(null); load(); }
  };

  const report = useMemo(() => {
    const inRange = filteredRefuels;
    const totalCost = inRange.reduce((s, r) => s + Number(r.cost), 0);
    const totalLiters = inRange.reduce((s, r) => s + (Number(r.liters) || 0), 0);
    const avgCheck = inRange.length > 0 ? totalCost / inRange.length : 0;

    const byDay = new Map<string, number>();
    for (const r of inRange) {
      byDay.set(r.date, (byDay.get(r.date) || 0) + Number(r.cost));
    }
    const daily = Array.from(byDay.entries())
      .map(([date, sum]) => ({ date, sum }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const group = (getKey: (r: RefuelWithRefs) => { id: string; label: string } | null) => {
      const map = new Map<string, { label: string; count: number; cost: number; liters: number }>();
      for (const r of inRange) {
        const k = getKey(r); if (!k) continue;
        const e = map.get(k.id) || { label: k.label, count: 0, cost: 0, liters: 0 };
        e.count += 1; e.cost += Number(r.cost); e.liters += Number(r.liters) || 0;
        map.set(k.id, e);
      }
      return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
    };

    return {
      totalCost, totalLiters, count: inRange.length, avgCheck, daily,
      byDriver: group((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),      byCar: group((r) => (r.cars ? { id: r.cars.id, label: r.cars.plate_number } : null)),
    };
  }, [refuels, from, to]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Заправки по автомобилям"
        subtitle="Учёт топлива для рейтинга водителей"
        action={
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Добавить заправку</span>
            <span className="sm:hidden">+</span>
          </button>
        }
      />

      {showAdd && <AddRefuelForm cars={cars} drivers={drivers} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} notify={notify} />}

      {/* Report */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-600 text-white">
              <Fuel className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary-900">Дашборд заправок</h3>
              <p className="text-xs text-primary-400">{formatDate(from)} — {formatDate(to)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-50"
            >
              {sortAsc ? '↑ Сначала старые' : '↓ Сначала новые'}
            </button>
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
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 no-print">
            <div><label className="label-base">С</label><input type="date" className="input-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div><label className="label-base">По</label><input type="date" className="input-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
          </div>
        )}

        <label className="flex w-fit items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={excludePersonal} onChange={(e) => setExcludePersonal(e.target.checked)} className="h-4 w-4 rounded border-primary-300 text-accent-600" />
          <span className="text-sm text-primary-600">Исключить личные автомобили</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Fuel className="h-5 w-5" />} label="Заправок" value={String(report.count)} accent="accent" />
          <Kpi icon={<Droplets className="h-5 w-5" />} label="Литров" value={report.totalLiters.toFixed(1)} accent="primary" />
          <Kpi icon={<Receipt className="h-5 w-5" />} label="Сумма" value={formatRub(report.totalCost)} accent="warning" />
          <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Ср. чек" value={formatRub(report.avgCheck)} accent="success" />
        </div>

        {report.count === 0 ? (
          <div className="card-base p-8 text-center">
            <Calendar className="mx-auto h-10 w-10 text-primary-200" />
            <p className="mt-3 text-sm font-semibold text-primary-600">Нет заправок за выбранный период</p>
          </div>
        ) : (
          <>
            <FuelChart daily={report.daily} />

            <div className="grid gap-4 lg:grid-cols-2">
              <RankingCard title="Рейтинг водителей" rows={report.byDriver} icon={<User className="h-4 w-4" />} />
              <RankingCard title="По автомобилям" rows={report.byCar} icon={<Truck className="h-4 w-4" />} />
            </div>
          </>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : refuels.length === 0 ? (
        <EmptyState title="Заправок пока нет" description="Нажмите «Добавить заправку»" />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Автомобиль</th>
                  <th className="px-4 py-3 font-semibold">Водитель</th>
                  <th className="px-4 py-3 text-right font-semibold">Литры</th>
                  <th className="px-4 py-3 text-right font-semibold">Стоимость</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {[...filteredRefuels].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)).map((r) => (
                  <tr key={r.id} className="transition hover:bg-primary-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-primary-600">{r.cars?.plate_number || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{r.drivers?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{r.liters ? `${r.liters} л` : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(r.cost)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditRefuel(r)} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-100 hover:text-primary-600" title="Редактировать"><Pencil className="h-4 w-4" /></button>
                        <DeleteButton onClick={() => setConfirmDelete(r)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить заправку?"
        message={`Заправка на сумму ${formatRub(confirmDelete?.cost || 0)} будет удалена.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />

      {editRefuel && (
        <EditRefuelForm refuel={editRefuel} cars={cars} drivers={drivers} onClose={() => setEditRefuel(null)} onSaved={() => { setEditRefuel(null); load(); }} notify={notify} />
      )}
    </div>
  );
}

function AddRefuelForm({ cars, drivers, onClose, onSaved, notify }: {
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const today = toDateInput(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [carId, setCarId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!date) { setErr('Укажите дату'); return; }
    const costNum = parseFloat(cost);
    if (!costNum || costNum <= 0) { setErr('Стоимость должна быть больше 0'); return; }
    setSaving(true);
    const { error } = await supabase.from('refuels').insert({
      date, car_id: carId || null, driver_id: driverId || null,
      liters: liters ? parseFloat(liters) : null, cost: costNum,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Заправка добавлена');
    onSaved();
  };

  return (
    <Modal title="Добавить заправку" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дата *"><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Литры"><input type="number" min="0" step="0.1" className="input-base" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="50" /></Field>
        </div>
        <Field label="Автомобиль"><Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" /></Field>
        <Field label="Водитель"><Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Выберите (необязательно)" /></Field>
        <Field label="Стоимость, ₽ *"><input type="number" min="0" step="0.01" className="input-base" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="5000" /></Field>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}

type AccentKey = 'primary' | 'accent' | 'success' | 'warning';

const ACCENT: Record<AccentKey, string> = {
  primary: 'from-primary-500 to-primary-400 text-primary-600 bg-primary-100',
  accent: 'from-accent-500 to-accent-400 text-accent-600 bg-accent-100',
  success: 'from-success-500 to-success-400 text-success-600 bg-success-100',
  warning: 'from-warning-500 to-warning-400 text-warning-600 bg-warning-100',
};

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: AccentKey }) {
  return (
    <div className="card-base relative overflow-hidden p-5">
      <div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-gradient-to-br ${ACCENT[accent].split(' ')[0]} ${ACCENT[accent].split(' ')[1]} opacity-10`} />
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${ACCENT[accent].split(' ')[2]} ${ACCENT[accent].split(' ')[3]}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-primary-900">{value}</p>
    </div>
  );
}

function FuelChart({ daily }: { daily: { date: string; sum: number }[] }) {
  const maxSum = Math.max(...daily.map((d) => d.sum), 1);
  const chartData = daily.length > 20 ? daily.slice(-20) : daily;
  return (
    <div className="card-base p-6">
      <h3 className="mb-4 text-sm font-bold text-primary-900">Заправки по дням</h3>
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-primary-400">Нет данных для графика</p>
      ) : (
        <div className="flex items-end gap-2 overflow-x-auto scrollbar-thin pb-2" style={{ minHeight: '200px' }}>
          {chartData.map((d) => {
            const heightPct = (d.sum / maxSum) * 100;
            return (
              <div key={d.date} className="flex shrink-0 flex-col items-center gap-1 justify-end" style={{ minWidth: '56px', width: '56px', height: '160px' }}>
                <div className="text-[9px] font-semibold text-primary-700 leading-tight text-center max-w-[56px] truncate">
                  {formatRub(d.sum)}
                </div>
                <div className="relative w-full flex items-end justify-center flex-1" style={{ minHeight: '4px' }}>
                  <div
                    className="w-[28px] rounded-t-md bg-gradient-to-t from-accent-500 to-accent-400 transition-all duration-300 hover:from-primary-600 hover:to-primary-500"
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    title={`${formatDate(d.date)}: ${formatRub(d.sum)}`}
                  />
                </div>
                <span className="text-[9px] leading-none text-primary-400 shrink-0">{formatDate(d.date).slice(0, 5)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, rows, icon }: { title: string; rows: { label: string; count: number; cost: number; liters: number }[]; icon: React.ReactNode }) {
  const maxCost = Math.max(...rows.map((r) => r.cost), 1);
  return (
    <div className="card-base p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-100 text-primary-600">{icon}</div>
        <h3 className="text-sm font-bold text-primary-900">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-primary-400">Нет данных</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-medium text-primary-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[10px] font-bold text-accent-600">{i + 1}</span>
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-primary-800">{formatRub(r.cost)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-primary-50">
                <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-all duration-500" style={{ width: `${(r.cost / maxCost) * 100}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-primary-400">{r.count} раз · {r.liters.toFixed(1)} л</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditRefuelForm({ refuel, cars, drivers, onClose, onSaved, notify }: {
  refuel: RefuelWithRefs;
  cars: Car[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const [date, setDate] = useState(toDateInput(refuel.date));
  const [carId, setCarId] = useState(refuel.car_id || '');
  const [driverId, setDriverId] = useState(refuel.driver_id || '');
  const [liters, setLiters] = useState(refuel.liters ? String(refuel.liters) : '');
  const [cost, setCost] = useState(String(refuel.cost));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!date) { setErr('Укажите дату'); return; }
    const costNum = parseFloat(cost);
    if (!costNum || costNum <= 0) { setErr('Стоимость должна быть больше 0'); return; }
    setSaving(true);
    const { error } = await supabase.from('refuels').update({
      date, car_id: carId || null, driver_id: driverId || null,
      liters: liters ? parseFloat(liters) : null, cost: costNum,
    }).eq('id', refuel.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Заправка изменена');
    onSaved();
  };

  return (
    <Modal title="Редактировать заправку" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дата *"><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Литры"><input type="number" min="0" step="0.1" className="input-base" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="50" /></Field>
        </div>
        <Field label="Автомобиль"><Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Выберите (необязательно)" /></Field>
        <Field label="Водитель"><Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Выберите (необязательно)" /></Field>
        <Field label="Стоимость, ₽ *"><input type="number" min="0" step="0.01" className="input-base" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="5000" /></Field>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
