import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Truck, Package, Receipt, Calendar,
  DollarSign, Target, Wallet, ArrowUpRight, ArrowDownRight, Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RecordWithRefs, Car, Driver, Contractor } from '@/lib/types';
import { formatRub, formatDate } from '@/lib/format';
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

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFor(period: DashPeriod): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'week') from.setDate(now.getDate() - 7);
  else if (period === 'month') from.setMonth(now.getMonth() - 1);
  else if (period === 'halfyear') from.setMonth(now.getMonth() - 6);
  else if (period === 'year') from.setFullYear(now.getFullYear() - 1);
  return { from: toDateStr(from), to: toDateStr(to) };
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
  const [excludePersonal, setExcludePersonal] = useState(false);
  const [data, setData] = useState<RecordWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState<{
    cur: { revenue: number; expenses: number; profit: number; label: string };
    prev: { revenue: number; expenses: number; profit: number; label: string };
  } | null>(null);

  useEffect(() => {
    const loadCompare = async () => {
      const now = new Date();
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const [curRec, prevRec, curExp, prevExp] = await Promise.all([
        supabase.from('records').select('cost').gte('date', fmt(curStart)).lte('date', fmt(curEnd)),
        supabase.from('records').select('cost').gte('date', fmt(prevStart)).lte('date', fmt(prevEnd)),
        supabase.from('expenses').select('amount').gte('date', fmt(curStart)).lte('date', fmt(curEnd)),
        supabase.from('expenses').select('amount').gte('date', fmt(prevStart)).lte('date', fmt(prevEnd)),
      ]);
      const sum = (rows: unknown, key: string) => ((rows as Record<string, unknown>[]) || []).reduce((s, r) => s + Number(r[key] || 0), 0);
      const curRevenue = sum(curRec.data, 'cost');
      const curExpenses = sum(curExp.data, 'amount');
      const prevRevenue = sum(prevRec.data, 'cost');
      const prevExpenses = sum(prevExp.data, 'amount');
      const monthLabel = (d: Date) => d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      setCompare({
        cur: { revenue: curRevenue, expenses: curExpenses, profit: curRevenue - curExpenses, label: monthLabel(curStart) },
        prev: { revenue: prevRevenue, expenses: prevExpenses, profit: prevRevenue - prevExpenses, label: monthLabel(prevStart) },
      });
    };
    loadCompare();
  }, []);

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
    if (error) return;
    let result = (rows as RecordWithRefs[]) || [];
    if (excludePersonal) {
      const personalCarIds = cars.filter((c) => c.personal).map((c) => c.id);
      result = result.filter((r) => !personalCarIds.includes(r.car_id));
    }
    setData(result);
  }, [from, to, carFilter, driverFilter, contractorFilter, excludePersonal, cars]);

  const applyPeriod = useCallback((p: DashPeriod) => {
    setPeriod(p);
    if (p !== 'custom') {
      const r = rangeFor(p);
      setCustomFrom(r.from);
      setCustomTo(r.to);
    }
  }, []);

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, carFilter, driverFilter, contractorFilter, excludePersonal]);

  const stats = useMemo(() => {
    const totalCost = data.reduce((s, r) => s + Number(r.cost), 0);
    const totalTrips = data.length;
    const totalPallets = data.reduce((s, r) => s + r.pallets + (r.pallets2 || 0) + (r.pallets3 || 0), 0);
    const avgCheck = totalTrips > 0 ? totalCost / totalTrips : 0;
    const costPerPallet = totalPallets > 0 ? totalCost / totalPallets : 0;
    const palletsPerTrip = totalTrips > 0 ? totalPallets / totalTrips : 0;

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
        e.pallets += r.pallets + (r.pallets2 || 0) + (r.pallets3 || 0);
        map.set(k.id, e);
      }
      return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
    };

    return {
      totalCost, totalTrips, totalPallets, avgCheck, costPerPallet, palletsPerTrip, daily,
      topDrivers: top((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),
      topCars: top((r) => (r.cars ? { id: r.cars.id, label: `${r.cars.plate_number}${r.cars.brand ? ' · ' + r.cars.brand : ''}` } : null)),
      topContractors: top((r) => (r.contractors ? { id: r.contractors.id, label: r.contractors.name } : null)),
    };
  }, [data]);

  const delta = compare ? compare.cur.profit - compare.prev.profit : 0;
  const deltaPct = compare && compare.prev.profit !== 0
    ? (delta / Math.abs(compare.prev.profit)) * 100
    : null;

  if (loading) {
    return <LoadingState label="Загрузка дашборда…" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-600 to-primary-600 text-white shadow-card">
            <Activity className="h-5 w-5" />
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
              onClick={() => applyPeriod(p.key)}
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

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-accent-600 p-6 text-white shadow-card sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Выручка за период</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{formatRub(stats.totalCost)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/80">
              <span className="inline-flex items-center gap-1.5"><Truck className="h-4 w-4" /> {stats.totalTrips} рейсов</span>
              <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4" /> {stats.totalPallets} паллет</span>
              <span className="inline-flex items-center gap-1.5"><Receipt className="h-4 w-4" /> ср. чек {formatRub(stats.avgCheck)}</span>
            </div>
          </div>
          <div className="w-full max-w-md lg:w-72">
            <Sparkline points={stats.daily.map((d) => d.sum)} />
            <p className="mt-2 text-center text-[11px] uppercase tracking-wider text-white/50">Динамика выручки по дням</p>
          </div>
        </div>
      </div>

      {/* Month compare */}
      {compare && (
        <div className="card-base p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary-900">Прибыль / убыток: текущий месяц vs прошлый</h3>
            {deltaPct !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${delta >= 0 ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(deltaPct).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <MonthBar title={compare.prev.label} profit={compare.prev.profit} revenue={compare.prev.revenue} expenses={compare.prev.expenses} max={Math.max(Math.abs(compare.prev.profit), Math.abs(compare.cur.profit), 1)} />
            <MonthBar title={compare.cur.label} profit={compare.cur.profit} revenue={compare.cur.revenue} expenses={compare.cur.expenses} max={Math.max(Math.abs(compare.prev.profit), Math.abs(compare.cur.profit), 1)} highlight />
          </div>
        </div>
      )}

      {/* Filters */}
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

      <label className="flex items-center gap-2 cursor-pointer no-print">
        <input type="checkbox" checked={excludePersonal} onChange={(e) => setExcludePersonal(e.target.checked)} className="h-4 w-4 rounded border-primary-300 text-accent-600" />
        <span className="text-xs text-primary-500">Исключить личные автомобили</span>
      </label>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Receipt className="h-5 w-5" />} label="Выручка" value={formatRub(stats.totalCost)} gradient="from-primary-600 to-primary-700" />
        <KpiCard icon={<Truck className="h-5 w-5" />} label="Рейсов" value={String(stats.totalTrips)} gradient="from-accent-600 to-accent-700" />
        <KpiCard icon={<Package className="h-5 w-5" />} label="Паллет" value={String(stats.totalPallets)} gradient="from-success-500 to-success-600" />
        <KpiCard icon={<Target className="h-5 w-5" />} label="Средний чек" value={formatRub(stats.avgCheck)} gradient="from-warning-500 to-warning-600" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard icon={<Wallet className="h-5 w-5" />} label="Затраты на паллету" value={formatRub(stats.costPerPallet)} gradient="from-primary-600 to-accent-600" />
        <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Паллет на рейс" value={stats.palletsPerTrip.toFixed(1)} gradient="from-accent-600 to-primary-600" />
      </div>

      {stats.totalTrips === 0 ? (
        <div className="card-base p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-primary-200" />
          <p className="mt-3 text-sm font-semibold text-primary-600">Нет данных за выбранный период</p>
          <p className="mt-1 text-xs text-primary-400">Измените период или фильтры</p>
        </div>
      ) : (
        <>
          <DailyChart daily={stats.daily} />

          <div className="grid gap-4 lg:grid-cols-3">
            <TopCard title="Топ водители" rows={stats.topDrivers} gradient="from-primary-500 to-primary-400" />
            <TopCard title="Топ автомобили" rows={stats.topCars} gradient="from-accent-600 to-accent-500" />
            <TopCard title="Топ контрагенты" rows={stats.topContractors} gradient="from-success-500 to-success-400" />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- visuals ---------- */

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="flex h-24 items-center justify-center text-xs text-white/50">Мало данных для графика</div>;
  }
  const w = 300;
  const h = 96;
  const pad = 6;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, h - pad - ((p - min) / range) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${xy[xy.length - 1][0].toFixed(1)} ${h} L ${xy[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={line} fill="none" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill="white" />
      ))}
    </svg>
  );
}

function MonthBar({ title, profit, revenue, expenses, max, highlight }: {
  title: string; profit: number; revenue: number; expenses: number; max: number; highlight?: boolean;
}) {
  const pct = Math.max((Math.abs(profit) / max) * 100, 2);
  const positive = profit >= 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className={`text-sm font-semibold capitalize ${highlight ? 'text-accent-700' : 'text-primary-600'}`}>{title}</span>
        <span className={`text-lg font-extrabold ${positive ? 'text-success-600' : 'text-error-600'}`}>{formatRub(profit)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-primary-50">
        <div
          className={`h-full rounded-full transition-all duration-700 ${positive ? 'bg-gradient-to-r from-success-400 to-success-600' : 'bg-gradient-to-r from-error-400 to-error-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-primary-400">
        <span>Выручка <b className="text-primary-700">{formatRub(revenue)}</b></span>
        <span>Расходы <b className="text-primary-700">{formatRub(expenses)}</b></span>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, gradient }: {
  icon: React.ReactNode; label: string; value: string; gradient: string;
}) {
  return (
    <div className="card-base group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-card`}>
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
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary-500" />
        <h3 className="text-sm font-bold text-primary-900">Выручка по дням</h3>
      </div>
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
                    className="w-[28px] rounded-t-md bg-gradient-to-t from-primary-600 to-accent-500 transition-all duration-300 hover:from-accent-600 hover:to-accent-400"
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

const MEDALS = ['🥇', '🥈', '🥉'];

function TopCard({ title, rows, gradient }: {
  title: string; rows: { label: string; count: number; sum: number; pallets?: number }[]; gradient: string;
}) {
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
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-600">
                    {MEDALS[i] || i + 1}
                  </span>
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-primary-800">{formatRub(r.sum)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-primary-50">
                <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`} style={{ width: `${(r.sum / maxSum) * 100}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-primary-400">{r.count} рейсов{r.pallets ? ` · ${r.pallets} паллет` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
