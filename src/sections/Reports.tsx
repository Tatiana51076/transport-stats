import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RecordWithRefs, Car, Driver, Contractor } from '@/lib/types';
import { formatRub, formatDate } from '@/lib/format';
import { LoadingState, EmptyState } from '@/components/States';
import { SectionHeader, Select } from '@/sections/Cars';
import { Dashboard } from '@/sections/Dashboard';

type PeriodKey = 'week' | 'month' | 'halfyear' | 'year' | 'custom';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'halfyear', label: 'Полгода' },
  { key: 'year', label: 'Год' },
  { key: 'custom', label: 'Произвольный' },
];

function rangeFor(period: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'week') from.setDate(now.getDate() - 7);
  else if (period === 'month') from.setMonth(now.getMonth() - 1);
  else if (period === 'halfyear') from.setMonth(now.getMonth() - 6);
  else if (period === 'year') from.setFullYear(now.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface ReportsProps {
  cars: Car[];
  drivers: Driver[];
  contractors: Contractor[];
  notify: (m: string, t?: 'success' | 'error' | 'info') => void;
}

export function Reports({ cars, drivers, contractors, notify }: ReportsProps) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(rangeFor('month').from);
  const [customTo, setCustomTo] = useState(rangeFor('month').to);
  const [carFilter, setCarFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [contractorFilter, setContractorFilter] = useState('');
  const [data, setData] = useState<RecordWithRefs[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { from, to } = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const buildReport = async () => {
    if (!from || !to) { notify('Укажите период', 'error'); return; }
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
    setLoaded(true);
    if (error) { notify('Ошибка построения отчёта', 'error'); return; }
    setData((rows as RecordWithRefs[]) || []);
  };

  const totals = useMemo(() => {
    const totalCost = data.reduce((s, r) => s + Number(r.cost), 0);
    const totalTrips = data.length;
    const totalPallets = data.reduce((s, r) => s + r.pallets, 0);

    const group = (getKey: (r: RecordWithRefs) => { id: string; label: string } | null) => {
      const map = new Map<string, { label: string; count: number; sum: number }>();
      for (const r of data) {
        const k = getKey(r);
        if (!k) continue;
        const e = map.get(k.id) || { label: k.label, count: 0, sum: 0 };
        e.count += 1;
        e.sum += Number(r.cost);
        map.set(k.id, e);
      }
      return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
    };

    return {
      totalCost,
      totalTrips,
      totalPallets,
      byDriver: group((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),
      byCar: group((r) => (r.cars ? { id: r.cars.id, label: [r.cars.plate_number, r.cars.brand, r.cars.model].filter(Boolean).join(' ') } : null)),
      byContractor: group((r) => (r.contractors ? { id: r.contractors.id, label: r.contractors.name } : null)),
    };
  }, [data]);

  return (
    <div className="space-y-8">
      <SectionHeader title="Отчёты" subtitle="Сводка по перевозкам за выбранный период" />

      <Dashboard cars={cars} drivers={drivers} contractors={contractors} />

      <div className="border-t border-primary-100 pt-2" />

      <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-primary-500" />
        <h2 className="text-lg font-bold text-primary-900">Детальный отчёт</h2>
      </div>

      <div className="card-base space-y-5 p-6 no-print">
        <div>
          <p className="label-base">Период</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${period === p.key ? 'bg-primary-600 text-white shadow-card' : 'bg-primary-50 text-primary-600 hover:bg-primary-100'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-base">С</label>
              <input type="date" className="input-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="label-base">По</label>
              <input type="date" className="input-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label-base">Автомобиль</label>
            <Select value={carFilter} onChange={setCarFilter} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Все автомобили" />
          </div>
          <div>
            <label className="label-base">Водитель</label>
            <Select value={driverFilter} onChange={setDriverFilter} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Все водители" />
          </div>
          <div>
            <label className="label-base">Контрагент</label>
            <Select value={contractorFilter} onChange={setContractorFilter} options={contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Все контрагенты" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={buildReport} disabled={loading} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60">
            {loading ? 'Построение…' : 'Построить отчёт'}
          </button>
          <span className="text-xs text-primary-400">
            Период: {formatDate(from)} — {formatDate(to)}
          </span>
          {data.length > 0 && (
            <button onClick={() => window.print()} className="ml-auto flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">
              <Printer className="h-4 w-4" />
              Печать
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState label="Формирование отчёта…" />
      ) : !loaded ? (
        <EmptyState title="Отчёт ещё не сформирован" description="Выберите период и нажмите «Построить отчёт»" />
      ) : data.length === 0 ? (
        <EmptyState title="Нет данных за выбранный период" description="Измените период или фильтры и попробуйте снова" />
      ) : (
        <>
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                    <th className="px-4 py-3 font-semibold">Контрагент</th>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Рейс</th>
                    <th className="px-4 py-3 font-semibold">Водитель</th>
                    <th className="px-4 py-3 font-semibold">Автомобиль</th>
                    <th className="px-4 py-3 text-right font-semibold">Паллеты</th>
                    <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {data.map((r) => (
                    <tr key={r.id} className="transition hover:bg-primary-50/40">
                      <td className="px-4 py-3 text-primary-700">{r.contractors?.name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-primary-600">{r.trips?.name || '—'}</td>
                      <td className="px-4 py-3 text-primary-600">{r.drivers?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-primary-600">{r.cars?.plate_number || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-800">{r.pallets}</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-base p-6">
            <h3 className="mb-4 text-lg font-bold text-primary-900">Итоговая статистика</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Общее кол-во рейсов" value={String(totals.totalTrips)} />
              <StatCard label="Общая сумма" value={formatRub(totals.totalCost)} />
              <StatCard label="Всего паллет" value={String(totals.totalPallets)} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <GroupTable title="По водителям" rows={totals.byDriver} />
              <GroupTable title="По автомобилям" rows={totals.byCar} />
              <GroupTable title="По контрагентам" rows={totals.byContractor} />
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-primary-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-primary-900">{value}</p>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: { label: string; count: number; sum: number }[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-primary-700">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-primary-400">Нет данных</p>
      ) : (
        <div className="divide-y divide-primary-50 rounded-xl border border-primary-100">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-primary-700">{r.label}</span>
              <span className="shrink-0 text-xs text-primary-400">{r.count} рейс.</span>
              <span className="shrink-0 text-sm font-semibold text-primary-800">{formatRub(r.sum)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
