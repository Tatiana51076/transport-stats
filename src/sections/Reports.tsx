import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RecordWithRefs, Car, Driver, Contractor, ExpenseWithCar, Invoice } from '@/lib/types';
import { EXPENSE_CATEGORIES } from '@/lib/types';
import { formatRub, formatDate, exportToExcel } from '@/lib/format';
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
  const [carFilter, setCarFilter] = useState<string[]>([]);
  const [driverFilter, setDriverFilter] = useState<string[]>([]);
  const [contractorFilter, setContractorFilter] = useState<string[]>([]);
  const [excludePersonal, setExcludePersonal] = useState(false);
  const [data, setData] = useState<RecordWithRefs[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithCar[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { from, to } = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const handlePeriodChange = (p: PeriodKey) => {
    setPeriod(p);
    if (p !== 'custom') {
      const r = rangeFor(p);
      setCustomFrom(r.from);
      setCustomTo(r.to);
    }
  };

  const buildReport = async () => {
    if (!from || !to) { notify('Укажите период', 'error'); return; }
    setLoading(true);
    let q = supabase
      .from('records')
      .select('*, trips(id,name), drivers(id,full_name), contractors(id,name), cars(id,plate_number,brand,model)')
      .gte('date', from).lte('date', to).order('date', { ascending: true });
    if (carFilter.length > 0) q = q.in('car_id', carFilter);
    if (driverFilter.length > 0) q = q.in('driver_id', driverFilter);
    if (contractorFilter.length > 0) q = q.in('contractor_id', contractorFilter);
    if (excludePersonal) q = q.not('cars.personal', 'eq', true);
    const { data: rows } = await q;
    if (excludePersonal) {
      const personalCarIds = cars.filter((c) => c.personal).map((c) => c.id);
      if (rows) setData((rows as RecordWithRefs[]).filter((r) => !personalCarIds.includes(r.car_id)));
      else setData([]);
    } else {
      setData((rows as RecordWithRefs[]) || []);
    }

      let eq = supabase.from('expenses').select('*, cars(id,plate_number,brand,model)').gte('date', from).lte('date', to).order('date', { ascending: true });
    if (carFilter.length > 0) eq = eq.in('car_id', carFilter);
    const { data: expRows } = await eq;
    let filteredExpenses = (expRows as ExpenseWithCar[]) || [];
    if (excludePersonal) {
      const personalCarIds = cars.filter((c) => c.personal).map((c) => c.id);
      filteredExpenses = filteredExpenses.filter((e) => e.car_id && !personalCarIds.includes(e.car_id));
    }
    setExpenses(filteredExpenses);

    let iq = supabase.from('invoices').select('*').gte('date', from).lte('date', to);
    const { data: invRows } = await iq;
    setInvoices((invRows as Invoice[]) || []);

    setLoading(false);
    setLoaded(true);
  };

  const totals = useMemo(() => {
    const revenue = data.reduce((s, r) => s + Number(r.cost), 0);
    const trips = data.length;
    const pallets = data.reduce((s, r) => s + r.pallets + (r.pallets2 || 0), 0);
    const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const invTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
    const invPaid = invoices.filter((i) => i.paid).reduce((s, i) => s + Number(i.amount), 0);
    const invUnpaid = invTotal - invPaid;
    const profit = revenue - expTotal;
    const realProfit = invPaid - expTotal;
    const forecastProfit = invTotal - expTotal;

    const group = (getKey: (r: RecordWithRefs) => { id: string; label: string } | null) => {
      const map = new Map<string, { label: string; count: number; sum: number }>();
      for (const r of data) {
        const k = getKey(r); if (!k) continue;
        const e = map.get(k.id) || { label: k.label, count: 0, sum: 0 };
        e.count += 1; e.sum += Number(r.cost);
        map.set(k.id, e);
      }
      return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
    };

    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      byCategory.set(e.category, (byCategory.get(e.category) || 0) + Number(e.amount));
    }
    const expByCategory = EXPENSE_CATEGORIES.map((c) => ({
      label: c.label, amount: byCategory.get(c.key) || 0,
    })).filter((c) => c.amount > 0);

    return {
      revenue, trips, pallets, expTotal, profit, invTotal, invPaid, invUnpaid, realProfit, forecastProfit,
      byDriver: group((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),
      byCar: group((r) => (r.cars ? { id: r.cars.id, label: [r.cars.plate_number, r.cars.brand, r.cars.model].filter(Boolean).join(' ') } : null)),
      byContractor: group((r) => (r.contractors ? { id: r.contractors.id, label: r.contractors.name } : null)),
      expByCategory,
    };
  }, [data, expenses, invoices]);

  const handleExport = () => {
    const periodStr = `${formatDate(from)}—${formatDate(to)}`;
    const tables = [];

    tables.push({
      title: `Доходы (${periodStr})`,
      headers: ['Контрагент', 'Дата', 'Рейс', 'Водитель', 'Автомобиль', 'Паллеты', 'Сумма'],
      rows: data.map((r) => [
        r.contractors?.name || '—', formatDate(r.date), r.trips?.name || '—',
        r.drivers?.full_name || '—', r.cars?.plate_number || '—',
        `{r.pallets}${r.pallets2 > 0 ? `+${r.pallets2}` : ''}`, formatRub(r.cost),
      ]),
    });

    tables.push({
      title: `Итого доходы`,
      headers: ['Показатель', 'Значение'],
      rows: [
        ['Выручка', formatRub(totals.revenue)],
        ['Кол-во рейсов', String(totals.trips)],
        ['Всего паллет', String(totals.pallets)],
      ],
    });

    if (totals.invTotal > 0) {
      tables.push({
        title: `Счета (${periodStr})`,
        headers: ['Дата', 'Контрагент', 'Сумма', 'Статус'],
        rows: invoices.map((i) => [formatDate(i.date), i.contractor_name, formatRub(i.amount), i.paid ? 'Оплачен' : 'Не оплачен']),
      });
    }

    if (totals.expTotal > 0) {
      tables.push({
        title: `Детально по расходам (${periodStr})`,
        headers: ['Дата', 'Категория', 'Автомобиль', 'Сотрудник', 'Описание', 'Сумма'],
        rows: expenses.map((e) => [
          formatDate(e.date),
          EXPENSE_CATEGORIES.find((c) => c.key === e.category)?.label || e.category,
          e.cars?.plate_number || '—',
          e.employee_name || '—',
          e.description || '—',
          formatRub(e.amount),
        ]),
      });
      tables.push({
        title: `Расходы по категориям (${periodStr})`,
        headers: ['Категория', 'Сумма'],
        rows: totals.expByCategory.map((c) => [c.label, formatRub(c.amount)]),
      });
    }

    tables.push({
      title: 'Финансовый итог',
      headers: ['Показатель', 'Значение'],
      rows: [
        ['Доходы (выручка)', formatRub(totals.revenue)],
        ['Выставлено счетов', formatRub(totals.invTotal)],
        ['Оплачено счетов', formatRub(totals.invPaid)],
        ['Не оплачено счетов', formatRub(totals.invUnpaid)],
        ['Расходы', formatRub(totals.expTotal)],
        ['Прибыль (доходы - расходы)', formatRub(totals.profit)],
        ['Реальная прибыль (оплачено - расходы)', formatRub(totals.realProfit)],
        ['Прогноз прибыли (все счета - расходы)', formatRub(totals.forecastProfit)],
      ],
    });

    exportToExcel(`Отчёт_${periodStr}`, tables);
    notify('Отчёт скачан', 'success');
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="Отчёты" subtitle="Сводка по перевозкам и финансам" />
      <Dashboard cars={cars} drivers={drivers} contractors={contractors} />

      <div className="border-t border-primary-100 pt-2" />

      <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-primary-500" />
        <h2 className="text-lg font-bold text-primary-900">Финансовый отчёт</h2>
      </div>

      <div className="card-base space-y-5 p-6 no-print">
        <div>
          <p className="label-base">Период</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => handlePeriodChange(p.key)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${period === p.key ? 'bg-primary-600 text-white shadow-card' : 'bg-primary-50 text-primary-600 hover:bg-primary-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label-base">С</label><input type="date" className="input-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div><label className="label-base">По</label><input type="date" className="input-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <MultiSelect label="Автомобиль" options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} selected={carFilter} onChange={setCarFilter} placeholder="Все автомобили" />
          <MultiSelect label="Водитель" options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} selected={driverFilter} onChange={setDriverFilter} placeholder="Все водители" />
          <MultiSelect label="Контрагент" options={contractors.map((c) => ({ value: c.id, label: c.name }))} selected={contractorFilter} onChange={setContractorFilter} placeholder="Все контрагенты" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer pt-2">
          <input type="checkbox" checked={excludePersonal} onChange={(e) => setExcludePersonal(e.target.checked)} className="h-4 w-4 rounded border-primary-300 text-accent-600" />
          <span className="text-sm text-primary-600">Исключить личные автомобили</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={buildReport} disabled={loading} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60">
            {loading ? 'Построение…' : 'Построить отчёт'}
          </button>
          <span className="text-xs text-primary-400">Период: {formatDate(from)} — {formatDate(to)}</span>
          {loaded && (data.length > 0 || invoices.length > 0) && (
            <>
              <button onClick={handleExport} className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">
                <FileDown className="h-4 w-4" /> Excel
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">
                <Printer className="h-4 w-4" /> Печать
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState label="Формирование отчёта…" />
      ) : !loaded ? (
        <EmptyState title="Отчёт ещё не сформирован" description="Выберите период и нажмите «Построить отчёт»" />
      ) : data.length === 0 && expenses.length === 0 && invoices.length === 0 ? (
        <EmptyState title="Нет данных за выбранный период" />
      ) : (
        <>
          {data.length > 0 && (
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
                        <td className="px-4 py-3 text-right font-semibold text-primary-800">{r.pallets}{r.pallets2 > 0 ? `+${r.pallets2}` : ''}</td>
                        <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invoices.length > 0 && (
            <div className="card-base overflow-hidden">
              <div className="px-5 py-4">
                <h3 className="text-lg font-bold text-primary-900">Счета</h3>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                      <th className="px-4 py-3 font-semibold">Дата</th>
                      <th className="px-4 py-3 font-semibold">Контрагент</th>
                      <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                      <th className="px-4 py-3 text-center font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="transition hover:bg-primary-50/40">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(inv.date)}</td>
                        <td className="px-4 py-3 text-primary-700">{inv.contractor_name}</td>
                        <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(inv.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${inv.paid ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                            {inv.paid ? 'Оплачен' : 'Не оплачен'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card-base p-6">
            <h3 className="mb-4 text-lg font-bold text-primary-900">Финансовая сводка</h3>

            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <StatCard label="Доходы (выручка)" value={formatRub(totals.revenue)} />
              <StatCard label="Расходы" value={formatRub(totals.expTotal)} />
              <StatCard label="Прибыль" value={formatRub(totals.profit)} accent={totals.profit >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50'} />
            </div>

            {totals.invTotal > 0 && (
              <div className="mb-6">
                <h4 className="mb-3 text-sm font-bold text-primary-700">Счета</h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard label="Выставлено счетов" value={formatRub(totals.invTotal)} />
                  <StatCard label="Оплачено" value={formatRub(totals.invPaid)} accent="text-success-600 bg-success-50" />
                  <StatCard label="Не оплачено" value={formatRub(totals.invUnpaid)} accent="text-error-600 bg-error-50" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <StatCard label="Реальная прибыль (оплачено − расходы)" value={formatRub(totals.realProfit)} accent={totals.realProfit >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50'} />
                  <StatCard label="Прогноз прибыли (все счета − расходы)" value={formatRub(totals.forecastProfit)} accent={totals.forecastProfit >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50'} />
                </div>
              </div>
            )}

            {totals.expByCategory.length > 0 && (
              <div className="mb-6">
                <h4 className="mb-3 text-sm font-bold text-primary-700">Расходы по категориям</h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {totals.expByCategory.map((c) => (
                    <div key={c.label} className="rounded-xl bg-primary-50 p-3">
                      <p className="text-xs text-primary-500">{c.label}</p>
                      <p className="mt-1 text-base font-bold text-primary-900">{formatRub(c.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expenses.length > 0 && (
              <div className="mb-6">
                <h4 className="mb-3 text-sm font-bold text-primary-700">Детально по расходам</h4>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                        <th className="px-4 py-3 font-semibold">Дата</th>
                        <th className="px-4 py-3 font-semibold">Категория</th>
                        <th className="px-4 py-3 font-semibold">Автомобиль</th>
                        <th className="px-4 py-3 font-semibold">Сотрудник</th>
                        <th className="px-4 py-3 font-semibold">Описание</th>
                        <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-primary-50">
                      {expenses.map((e) => (
                        <tr key={e.id} className="transition hover:bg-primary-50/40">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(e.date)}</td>
                          <td className="px-4 py-3 text-primary-600">{EXPENSE_CATEGORIES.find((c) => c.key === e.category)?.label || e.category}</td>
                          <td className="px-4 py-3 text-primary-600">{e.cars?.plate_number || '—'}</td>
                          <td className="px-4 py-3 text-primary-600">{e.employee_name || '—'}</td>
                          <td className="px-4 py-3 text-primary-600 max-w-[200px] truncate" title={e.description || ''}>{e.description || '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
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

function StatCard({ label, value, accent = '' }: { label: string; value: string; accent?: string }) {
  return (
    <div className={`rounded-xl p-4 ${accent || 'bg-primary-50'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? 'text-primary-900' : 'text-primary-900'}`}>{value}</p>
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

function MultiSelect({ label, options, selected, onChange, placeholder }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const display = selected.length === 0 ? placeholder : `${selected.length} выбрано`;

  return (
    <div className="relative">
      <label className="label-base">{label}</label>
      <button type="button" onClick={() => setOpen(!open)} className="input-base text-left flex items-center justify-between">
        <span className={selected.length === 0 ? 'text-primary-300' : 'text-primary-900'}>{display}</span>
        <span className="text-primary-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-primary-100 bg-white shadow-card-hover max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-xs font-medium text-primary-500 hover:bg-primary-50 border-b border-primary-50"
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-primary-50 transition">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="h-4 w-4 rounded border-primary-300 text-primary-600" />
              <span className="text-primary-700">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
    </div>
  );
}
