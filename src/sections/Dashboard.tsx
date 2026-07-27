import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp, Truck, Package, Receipt, Calendar, DollarSign, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RecordWithRefs, Car, Driver, Contractor } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { LoadingState } from '@/components/States';
import { Select } from '@/sections/Cars';

type DashPeriod = 'week' | 'month' | 'halfyear' | 'year' | 'custom';

const DASH_PERIODS: { key: DashPeriod; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'halfyear', label: 'Полгода' },
  { key: 'year', label: 'Год' },
  { key: 'custom', label: 'Произвольный' },
];

function rangeFor(period: DashPeriod): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'week') from.setDate(now.getDate() - 7);
  else if (period === 'month') from.setMonth(now.getMonth() - 1);
  else if (period === 'halfyear') from.setMonth(now.getMonth() - 6);
  else if (period === 'year') from.setFullYear(now.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface DashboardProps {
  cars?: Car[];
  drivers?: Driver[];
  contractors?: Contractor[];
}

export function Dashboard({ cars = [], drivers = [], contractors = [] }: DashboardProps) {
  const [period, setPeriod] = useState<DashPeriod>('month');
  const [customFrom, setCustomFrom] = useState(rangeFor('month').from);
  const [customTo, setCustomTo] = useState(rangeFor('month').to);
  const [carFilter, setCarFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [contractorFilter, setContractorFilter] = useState('');
  const [data, setData] = useState<RecordWithRefs[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('records')
      .select('*, trips(id,name), drivers(id,full_name), contractors(id,name), cars(id,plate_number,brand,model)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (carFilter) query = query.eq('car_id', carFilter);
    if (driverFilter) query = query.eq('driver_id', driverFilter);
    if (contractorFilter) query = query.eq('contractor_id', contractorFilter);
    const { data: rows, error } = await query;
    setLoading(false);
    if (!error) setData((rows as RecordWithRefs[]) || []);
  }, [period, from, to, carFilter, driverFilter, contractorFilter]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const totalCost = data.reduce((s, r) => s + Number(r.cost), 0);
    const totalTrips = data.length;
    const totalPallets = data.reduce((s, r) => s + r.pallets + (r.pallets2 || 0), 0);
    const avgCheck = totalTrips > 0 ? totalCost / totalTrips : 0;
    const costPerPallet = totalPallets > 0 ? totalCost / totalPallets : 0;

    const byDay = new Map<string, number>();
    for (const r of data) {
      const key = r.date;
      byDay.set(key, (byDay.get(key) || 0) + Number(r.cost));
    }
    const daily = Array.from(byDay.entries())
      .map(([date, sum]) => ({ date, sum }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const top = (getKey: (r: RecordWithRefs) => { id: string; label: string } | null) => {
      const map = new Map<string, { label: string; count: number; sum: number; pallets: number }>();
      for (const r of data) {
        const k = getKey(r);
        if (!k) continue;
        const e = map.get(k.id) || { label: k.label, count: 0, sum: 0, pallets: 0 };
        e.count += 1;
        e.sum += Number(r.cost);
        e.pallets += r.pallets + (r.pallets2 || 0);
        map.set(k.id, e);
      }
      return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
    };

    const avgCost = totalTrips > 0 ? totalCost / totalTrips : 0;

    return {
      totalCost, totalTrips, totalPallets, avgCheck, costPerPallet, daily,
      topDrivers: top((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),
      topCars: top((r) => (r.cars ? { id: r.cars.id, label: `${r.cars.plate_number}${r.cars.brand ? ' · ' + r.cars.brand : ''}` } : null)),
      topContractors: top((r) => (r.contractors ? { id: r.contractors.id, label: r.contractors.name } : null)),
      avgCost,
    };
  }, [data]);

  if (loading) {
    return <LoadingState label="Загрузка дашборда…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-600 text-white">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary-900">Дашборд</h2>
            <p className="text-xs text-primary-400">{formatDate(from)} — {formatDate(to)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DASH_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p.key ? 'bg-accent-600 text-white shadow-card' : 'bg-white text-primary-500 hover:bg-primary-50 border border-primary-100'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-100 bg-white p-4">
          <div>
            <label className="label-base">С</label>
            <input type="date" className="input-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div>
            <label className="label-base">По</label>
            <input type="date" className="input-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <button onClick={load} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700">Обновить</button>
        </div>
      )}

      {(cars.length > 0 || drivers.length > 0 || contractors.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          {cars.length > 0 && (
            <div>
              <label className="label-base">Автомобиль</label>
              <Select value={carFilter} onChange={setCarFilter} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Все автомобили" />
            </div>
          )}
          {drivers.length > 0 && (
            <div>
              <label className="label-base">Водитель</label>
              <Select value={driverFilter} onChange={setDriverFilter} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Все водители" />
            </div>
          )}
          {contractors.length > 0 && (
            <div>
              <label className="label-base">Контрагент</label>
              <Select value={contractorFilter} onChange={setContractorFilter} options={contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Все контрагенты" />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Receipt className="h-5 w-5" />} label="Выручка" value={formatRub(stats.totalCost)} accent="primary" />
        <KpiCard icon={<Truck className="h-5 w-5" />} label="Рейсов" value={String(stats.totalTrips)} accent="accent" />
        <KpiCard icon={<Package className="h-5 w-5" />} label="Паллет" value={String(stats.totalPallets)} accent="success" />
        <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Средний чек" value={formatRub(stats.avgCheck)} accent="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Затраты на паллету" value={formatRub(stats.costPerPallet)} accent="primary" />
        <KpiCard icon={<Target className="h-5 w-5" />} label="Средняя стоимость рейса" value={formatRub(stats.avgCost)} accent="accent" />
      </div>

      {stats.totalTrips === 0 ? (
        <div className="card-base p-8 text-center">
          <Calendar className="mx-auto h-10 w-10 text-primary-200" />
          <p className="mt-3 text-sm font-semibold text-primary-600">Нет данных за выбранный период</p>
          <p className="mt-1 text-xs text-primary-400">Измените период или фильтры</p>
        </div>
      ) : (
        <>
          <DailyChart daily={stats.daily} />

          <div className="grid gap-4 lg:grid-cols-3">
            <TopCard title="Топ водители" rows={stats.topDrivers} />
            <TopCard title="Топ автомобили" rows={stats.topCars} />
            <TopCard title="Топ контрагенты" rows={stats.topContractors} />
          </div>
        </>
      )}
    </div>
  );
}

type AccentKey = 'primary' | 'accent' | 'success' | 'warning';

const ACCENT_CLASSES: Record<AccentKey, { bg: string; text: string; iconBg: string }> = {
  primary: { bg: 'from-primary-600 to-primary-700', text: 'text-primary-600', iconBg: 'bg-primary-100' },
  accent: { bg: 'from-accent-600 to-accent-700', text: 'text-accent-600', iconBg: 'bg-accent-100' },
  success: { bg: 'from-success-500 to-success-600', text: 'text-success-600', iconBg: 'bg-success-100' },
  warning: { bg: 'from-warning-500 to-warning-600', text: 'text-warning-600', iconBg: 'bg-warning-100' },
};

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: AccentKey }) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div className="card-base relative overflow-hidden p-5">
      <div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-gradient-to-br ${c.bg} opacity-5`} />
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg} ${c.text}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-primary-900">{value}</p>
    </div>
  );
}

function DailyChart({ daily }: { daily: { date: string; sum: number }[] }) {
  const maxSum = Math.max(...daily.map((d) => d.sum), 1);
  const chartData = daily.length > 20 ? daily.slice(-20) : daily;

  return (
    <div className="card-base p-6">
      <h3 className="mb-4 text-sm font-bold text-primary-900">Выручка по дням</h3>
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
                    className="w-[28px] rounded-t-md bg-gradient-to-t from-primary-500 to-primary-400 transition-all duration-300 hover:from-accent-600 hover:to-accent-500"
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

function TopCard({ title, rows }: { title: string; rows: { label: string; count: number; sum: number; pallets?: number }[] }) {
  const maxSum = Math.max(...rows.map((r) => r.sum), 1);
  return (
    <div className="card-base p-5">
      <h3 className="mb-3 text-sm font-bold text-primary-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-primary-400">Нет данных</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-medium text-primary-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-600">{i + 1}</span>
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-primary-800">{formatRub(r.sum)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-primary-50">
                <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500" style={{ width: `${(r.sum / maxSum) * 100}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-primary-400">{r.count} рейсов{r.pallets ? ` · ${r.pallets} паллет` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
