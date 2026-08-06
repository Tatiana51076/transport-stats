import { useMemo, useState } from 'react';
import { Printer, FileDown, Download } from 'lucide-react';
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

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFor(period: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'week') from.setDate(now.getDate() - 7);
  else if (period === 'month') from.setMonth(now.getMonth() - 1);
  else if (period === 'halfyear') from.setMonth(now.getMonth() - 6);
  else if (period === 'year') from.setFullYear(now.getFullYear() - 1);
  return { from: toDateStr(from), to: toDateStr(to) };
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
  const [sortAsc, setSortAsc] = useState(true);
  const [extraExpenses, setExtraExpenses] = useState('');
  const [prevMonthExpenses, setPrevMonthExpenses] = useState('');
  const [monthExpenses, setMonthExpenses] = useState<ExpenseWithCar[]>([]);

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

  const expenseFrom = useMemo(() => from, [from]);
  const expenseTo = useMemo(() => to, [to]);

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
    const { data: rows } = await q;
    if (excludePersonal) {
      const personalCarIds = cars.filter((c) => c.personal).map((c) => c.id);
      setData((rows as RecordWithRefs[]).filter((r) => !personalCarIds.includes(r.car_id)));
    } else {
      setData((rows as RecordWithRefs[]) || []);
    }

      let eq = supabase.from('expenses').select('*, cars(id,plate_number,brand,model)').gte('date', expenseFrom).lte('date', expenseTo).order('date', { ascending: true });
    if (carFilter.length > 0) eq = eq.in('car_id', carFilter);
    const { data: expRows } = await eq;
    let filteredExpenses = (expRows as ExpenseWithCar[]) || [];
    if (excludePersonal) {
      const personalCarIds = cars.filter((c) => c.personal).map((c) => c.id);
      filteredExpenses = filteredExpenses.filter((e) => !e.personal && (!e.car_id || !personalCarIds.includes(e.car_id)));
    }
    setExpenses(filteredExpenses);

    let iq = supabase.from('invoices').select('*').gte('date', from).lte('date', to);
    const { data: invRows } = await iq;
    let filteredInvoices = (invRows as Invoice[]) || [];
    if (excludePersonal) {
      filteredInvoices = filteredInvoices.filter((i) => !i.personal);
    }
    setInvoices(filteredInvoices);

    // Расходы за предыдущий месяц внутри периода (от from до конца месяца from)
    if (from) {
      const fromDate = new Date(from);
      const isStartOfMonth = Number(from.slice(8, 10)) === 1;
      const prevMonthEnd = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0);
      const prevMonthEndStr = toDateStr(prevMonthEnd);
      if (!isStartOfMonth && from <= prevMonthEndStr) {
        const { data: prevRows } = await supabase.from('expenses').select('amount, personal, car_id').gte('date', from).lte('date', prevMonthEndStr);
        const prevList = (prevRows as { amount: number; personal: boolean; car_id: string | null }[]) || [];
        const personalCarIdsAll = cars.filter((c) => c.personal).map((c) => c.id);
        const prevSum = prevList
          .filter((e) => !excludePersonal || (!e.personal && (!e.car_id || !personalCarIdsAll.includes(e.car_id))))
          .reduce((s, e) => s + Number(e.amount), 0);
        setPrevMonthExpenses(prevSum > 0 ? String(prevSum) : '');
      } else {
        setPrevMonthExpenses('');
      }
    }

    // Доп расходы: от следующего дня после периода до конца месяца окончания
    if (to) {
      const endDate = new Date(to);
      const isEndOfMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate() === Number(to.slice(8, 10));
      const nextDay = new Date(endDate);
      nextDay.setDate(endDate.getDate() + 1);
      const nextDayStr = toDateStr(nextDay);
      const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
      const lastDayStr = toDateStr(lastDay);
      if (!isEndOfMonth && nextDayStr <= lastDayStr) {
        const { data: extraRows } = await supabase.from('expenses').select('amount, personal, car_id').gte('date', nextDayStr).lte('date', lastDayStr);
        const extraList = (extraRows as { amount: number; personal: boolean; car_id: string | null }[]) || [];
        const personalCarIdsAll2 = cars.filter((c) => c.personal).map((c) => c.id);
        const extraSum = extraList
          .filter((e) => !excludePersonal || (!e.personal && (!e.car_id || !personalCarIdsAll2.includes(e.car_id))))
          .reduce((s, e) => s + Number(e.amount), 0);
        setExtraExpenses(extraSum > 0 ? String(extraSum) : '');
      } else {
        setExtraExpenses('');
      }
    }

    // Детальные расходы за полный месяц окончания периода (например июль для 24.06–19.07)
    if (to) {
      const endDate = new Date(to);
      const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      const monthStartStr = toDateStr(monthStart);
      const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
      const monthEndStr = toDateStr(monthEnd);
      let mq = supabase.from('expenses').select('*, cars(id,plate_number,brand,model)').gte('date', monthStartStr).lte('date', monthEndStr).order('date', { ascending: true });
      if (carFilter.length > 0) mq = mq.in('car_id', carFilter);
      const { data: monthRows } = await mq;
      let filteredMonth = (monthRows as ExpenseWithCar[]) || [];
      if (excludePersonal) {
        const personalCarIdsAll = cars.filter((c) => c.personal).map((c) => c.id);
        filteredMonth = filteredMonth.filter((e) => !e.personal && (!e.car_id || !personalCarIdsAll.includes(e.car_id)));
      }
      setMonthExpenses(filteredMonth);
    }

    setLoading(false);
    setLoaded(true);
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [data, sortAsc]);

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [expenses, sortAsc]);

  const sortedInvoices = useMemo(() => {
    return [...invoices].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [invoices, sortAsc]);

  const sortedMonthExpenses = useMemo(() => {
    return [...monthExpenses].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [monthExpenses, sortAsc]);

  const totals = useMemo(() => {
    const revenue = data.reduce((s, r) => s + Number(r.cost), 0);
    const trips = data.length;
    const pallets = data.reduce((s, r) => s + r.pallets + (r.pallets2 || 0) + (r.pallets3 || 0), 0);
    const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const invTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
    const invPaid = invoices.reduce((s, i) => s + Number(i.paid ? i.amount : (i.paid_amount || 0)), 0);
    const invUnpaid = invTotal - invPaid;
    const profit = revenue - expTotal;
    const realProfit = invPaid - expTotal;
    const forecastProfit = invTotal - expTotal;
    // Прибыль для распределения = получено − (расходы периода − расходы пред. месяца + доп расходы)
    const extraExp = parseFloat(extraExpenses) || 0;
    const prevExp = parseFloat(prevMonthExpenses) || 0;
    const adjustedExpenses = expTotal - prevExp + extraExp;
    const distributableProfit = invPaid - adjustedExpenses;
    const partnerShare = distributableProfit / 2;

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
      distributableProfit, partnerShare, adjustedExpenses,
      prevMonthExpenses: prevExp, extraExpenses: extraExp,
      byDriver: group((r) => (r.drivers ? { id: r.drivers.id, label: r.drivers.full_name } : null)),
      byCar: group((r) => (r.cars ? { id: r.cars.id, label: [r.cars.plate_number, r.cars.brand, r.cars.model].filter(Boolean).join(' ') } : null)),
      byContractor: group((r) => (r.contractors ? { id: r.contractors.id, label: r.contractors.name } : null)),
      expByCategory,
    };
  }, [data, expenses, invoices, extraExpenses, prevMonthExpenses]);

  const handleExport = () => {
    const periodStr = `${formatDate(from)}—${formatDate(to)}`;
    const tables = [];

    tables.push({
      title: `Доходы (${periodStr})`,
      headers: ['Контрагент', 'Дата', 'Рейс', 'Водитель', 'Автомобиль', 'Паллеты', 'Сумма'],
      rows: sortedData.map((r) => [
        r.contractors?.name || '—', formatDate(r.date), r.trips?.name || '—',
        r.drivers?.full_name || '—', r.cars?.plate_number || '—',
        `${r.pallets}${r.pallets2 > 0 ? `+${r.pallets2}` : ''}${r.pallets3 > 0 ? `+${r.pallets3}` : ''}`, String(Number(r.cost).toFixed(2).replace('.', ',')),
      ]),
    });

    tables.push({
      title: `Итого доходы`,
      headers: ['Показатель', 'Значение'],
      rows: [
        ['Выручка', String(Number(totals.revenue).toFixed(2).replace('.', ','))],
        ['Кол-во рейсов', String(totals.trips)],
        ['Всего паллет', String(totals.pallets)],
      ],
    });

    if (totals.invTotal > 0) {
      tables.push({
        title: `Счета (${periodStr})`,
        headers: ['№ счёта', 'Дата', 'Контрагент', 'Сумма', 'Оплачено', 'Остаток', 'Статус'],
        rows: sortedInvoices.map((i) => [
          i.invoice_number || '—',
          formatDate(i.date), i.contractor_name,
          String(Number(i.amount).toFixed(2).replace('.', ',')),
          String(Number(i.paid ? i.amount : (i.paid_amount || 0)).toFixed(2).replace('.', ',')),
          String(Number(Number(i.amount) - Number(i.paid ? i.amount : (i.paid_amount || 0))).toFixed(2).replace('.', ',')),
          i.paid ? 'Оплачен' : Number(i.paid_amount) > 0 ? 'Частично' : 'Не оплачен',
        ]),
      });
    }

    if (totals.expTotal > 0) {
      tables.push({
        title: `Детально по расходам (${periodStr})`,
        headers: ['Дата', 'Категория', 'Автомобиль', 'Сотрудник', 'Описание', 'Сумма'],
        rows: sortedExpenses.map((e) => [
          formatDate(e.date),
          EXPENSE_CATEGORIES.find((c) => c.key === e.category)?.label || e.category,
          e.cars?.plate_number || '—',
          e.employee_name || '—',
          e.description || '—',
          String(Number(e.amount).toFixed(2).replace('.', ',')),
        ]),
      });
      tables.push({
        title: `Расходы по категориям (${periodStr})`,
        headers: ['Категория', 'Сумма'],
        rows: totals.expByCategory.map((c) => [c.label, String(Number(c.amount).toFixed(2).replace('.', ','))]),
      });
    }

    tables.push({
      title: 'Прибыль для распределения между партнёрами',
      headers: ['Показатель', 'Значение'],
      rows: [
        ['Получено оплат', String(Number(totals.invPaid).toFixed(2).replace('.', ','))],
        ['Расходы за период', String(Number(totals.expTotal).toFixed(2).replace('.', ','))],
        ['Расходы предыдущего месяца', String(Number(totals.prevMonthExpenses || 0).toFixed(2).replace('.', ','))],
        ['Доп. расходы (после периода)', String(Number(totals.extraExpenses || 0).toFixed(2).replace('.', ','))],
        ['Итоговые расходы', String(Number(totals.adjustedExpenses).toFixed(2).replace('.', ','))],
        ['Доступно партнёрам', String(Number(totals.distributableProfit).toFixed(2).replace('.', ','))],
        ['Доля партнёра (50%)', String(Number(totals.partnerShare).toFixed(2).replace('.', ','))],
        ['Долги (не оплачено)', String(Number(totals.invUnpaid).toFixed(2).replace('.', ','))],
      ],
    });

    if (monthExpenses.length > 0) {
      const me = monthExpenses[0];
      const monthLabel = me.date ? new Date(me.date).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : '';
      const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
      tables.push({
        title: `Детально по расходам за месяц: ${monthLabel}`,
        headers: ['Дата', 'Категория', 'Автомобиль', 'Сотрудник', 'Описание', 'Сумма'],
        rows: [
          ...sortedMonthExpenses.map((e) => [
            formatDate(e.date),
            EXPENSE_CATEGORIES.find((c) => c.key === e.category)?.label || e.category,
            e.cars?.plate_number || '—',
            e.employee_name || '—',
            e.description || '—',
            String(Number(e.amount).toFixed(2).replace('.', ',')),
          ]),
          ['', '', '', '', 'ИТОГО', String(Number(monthTotal).toFixed(2).replace('.', ','))],
        ],
      });
    }

    tables.push({
      title: 'Финансовый итог',
      headers: ['Показатель', 'Значение'],
      rows: [
        ['Доходы (выручка)', String(Number(totals.revenue).toFixed(2).replace('.', ','))],
        ['Выставлено счетов', String(Number(totals.invTotal).toFixed(2).replace('.', ','))],
        ['Оплачено счетов', String(Number(totals.invPaid).toFixed(2).replace('.', ','))],
        ['Не оплачено счетов', String(Number(totals.invUnpaid).toFixed(2).replace('.', ','))],
        ['Расходы', String(Number(totals.expTotal).toFixed(2).replace('.', ','))],
        ['Прибыль (доходы - расходы)', String(Number(totals.profit).toFixed(2).replace('.', ','))],
        ['Реальная прибыль (оплачено - расходы)', String(Number(totals.realProfit).toFixed(2).replace('.', ','))],
        ['Прогноз прибыли (все счета - расходы)', String(Number(totals.forecastProfit).toFixed(2).replace('.', ','))],
      ],
    });

    exportToExcel(`Отчёт_${periodStr}`, tables);
    notify('Отчёт скачан', 'success');
  };

  const exportPartnerPDF = async () => {
    try {
      notify('Формируем PDF…', 'info');
      const [{ jsPDF }, html2canvas] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const periodStr = `${formatDate(from)} — ${formatDate(to)}`;
      const todayStr = new Date().toLocaleDateString('ru-RU');
      const money = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
      const isProfit = totals.distributableProfit >= 0;
      const sign = (v: number) => (v >= 0 ? '+' : '−') + money(Math.abs(v));

      const css = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #0d3138; background: #fff; }
  .doc { width: 794px; padding: 28px 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0C7281; padding-bottom: 14px; margin-bottom: 24px; }
  .logo { font-size: 26px; font-weight: 800; color: #0C7281; letter-spacing: 0.5px; }
  .logo span { color: #74364D; }
  .doc-title { font-size: 15px; font-weight: 600; color: #4aa3ad; margin-top: 4px; }
  .meta { text-align: right; font-size: 12px; color: #064851; line-height: 1.6; }
  h1 { font-size: 22px; color: #0C7281; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #5a7a80; margin-bottom: 22px; }
  .grid { display: flex; gap: 12px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #d9eef0; border-radius: 10px; padding: 12px 14px; background: #f0f9fa; }
  .card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #4aa3ad; font-weight: 700; margin-bottom: 6px; }
  .card .val { font-size: 17px; font-weight: 700; color: #0d3138; }
  .calc { border: 1px solid #d9eef0; border-left: 4px solid #0C7281; border-radius: 8px; background: #f7fbfc; padding: 12px 14px; margin-bottom: 16px; }
  .calc .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #064851; font-weight: 700; margin-bottom: 6px; }
  .calc .formula { font-size: 13px; color: #064851; line-height: 1.7; }
  .calc .formula b { color: #0C7281; }
  .result { border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; text-align: center; }
  .result.pos { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 2px solid #22c55e; }
  .result.neg { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 2px solid #dc2626; }
  .result .lbl { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin-bottom: 6px; }
  .result.pos .lbl { color: #15803d; }
  .result.neg .lbl { color: #b91c1c; }
  .result .val { font-size: 30px; font-weight: 800; }
  .result.pos .val { color: #15803d; }
  .result.neg .val { color: #b91c1c; }
  .result .note { font-size: 12px; margin-top: 6px; }
  .result.pos .note { color: #16a34a; }
  .result.neg .note { color: #dc2626; }
  .partners { display: flex; gap: 12px; margin-bottom: 22px; }
  .pcard { flex: 1; border: 1px solid #efd1da; border-radius: 10px; padding: 14px; text-align: center; }
  .pcard .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #74364D; font-weight: 700; margin-bottom: 6px; }
  .pcard .val { font-size: 19px; font-weight: 700; }
  .pcard.good .val { color: #16a34a; }
  .pcard.bad .val { color: #dc2626; }
  .pcard .note { font-size: 11px; color: #5a7a80; margin-top: 4px; }
  .foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid #d9eef0; }
  .foot p { font-size: 11px; color: #5a7a80; margin: 0 0 24px; line-height: 1.6; }
  .sign { display: flex; justify-content: space-between; font-size: 13px; color: #0d3138; }
  .sign .s { text-align: center; }
  .sign .line { border-bottom: 1px solid #0d3138; width: 200px; margin-bottom: 6px; }
  .sign .cap { font-size: 11px; color: #5a7a80; }`;

      const body = `
  <div class="doc">
    <div class="header">
      <div>
        <div class="logo">Global<span>Truck</span></div>
        <div class="doc-title">Финансовый отчёт для партнёра</div>
      </div>
      <div class="meta">
        Период: <b>${periodStr}</b><br>
        Дата формирования: ${todayStr}
      </div>
    </div>

    <h1>Прибыль для распределения</h1>
    <div class="sub">Между партнёрами · расчёт по фактически полученным оплатам</div>

    <div class="grid">
      <div class="card"><div class="lbl">Получено оплат</div><div class="val">${money(totals.invPaid)}</div></div>
      <div class="card"><div class="lbl">Расходы за период</div><div class="val">${money(totals.expTotal)}</div></div>
      <div class="card"><div class="lbl">Итоговые расходы</div><div class="val">${money(totals.adjustedExpenses)}</div></div>
    </div>

    <div class="calc">
      <div class="lbl">Расчёт итоговых расходов</div>
      <div class="formula">
        Расходы за период <b>${money(totals.expTotal)}</b> − расходы предыдущего месяца <b>${money(totals.prevMonthExpenses || 0)}</b>
        + доп. расходы после периода <b>${money(totals.extraExpenses || 0)}</b> = <b>${money(totals.adjustedExpenses)}</b>
      </div>
    </div>

    <div class="result ${isProfit ? 'pos' : 'neg'}">
      <div class="lbl">Доступно партнёрам</div>
      <div class="val">${sign(totals.distributableProfit)}</div>
      <div class="note">${isProfit ? 'Эту сумму реально можно распределить между партнёрами' : 'Сумма отрицательная — делить нечего, расходы превысили доходы'}</div>
    </div>

    <div class="partners">
      <div class="pcard ${totals.partnerShare >= 0 ? 'good' : 'bad'}">
        <div class="lbl">Доля партнёра (50%)</div>
        <div class="val">${sign(totals.partnerShare)}</div>
        <div class="note">От суммы «Доступно партнёрам»</div>
      </div>
      <div class="pcard good">
        <div class="lbl">Долги (не оплачено)</div>
        <div class="val">${money(totals.invUnpaid)}</div>
        <div class="note">Делить долги нельзя — деньги ещё не поступили</div>
      </div>
    </div>

    <div class="foot">
      <p>Расчёт произведён по фактически поступившим оплатам. Личные автомобили исключены из расчёта. Итоговые расходы включают расходы предыдущего месяца и доп. расходы после расчётного периода.</p>
      <div class="sign">
        <div class="s"><div class="line"></div><div class="cap">Компания</div></div>
        <div class="s"><div class="line"></div><div class="cap">Партнёр</div></div>
        <div class="s"><div class="line"></div><div class="cap">Дата</div></div>
      </div>
    </div>
  </div>`;

      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;';
      holder.innerHTML = `<style>${css}</style>${body}`;
      document.body.appendChild(holder);

      try {
        await document.fonts.ready;
        const canvas = await html2canvas.default(holder, { scale: 2, backgroundColor: '#ffffff', logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pdfW = 210;
        const pdfH = 297;
        const margin = 10;
        const imgHmm = (canvas.height * (pdfW - margin * 2)) / canvas.width;
        let heightLeft = imgHmm;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', margin, margin, pdfW - margin * 2, imgHmm);
        heightLeft -= pdfH - margin * 2;
        while (heightLeft > 0) {
          position = heightLeft - imgHmm;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, pdfW - margin * 2, imgHmm);
          heightLeft -= pdfH - margin * 2;
        }
        pdf.save(`GlobalTruck_прибыль_${from}_${to}.pdf`);
        notify('PDF скачан', 'success');
      } finally {
        document.body.removeChild(holder);
      }
    } catch (err) {
      notify('Не удалось сформировать PDF: ' + String(err), 'error');
    }
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
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
            title={sortAsc ? 'Показать новые первыми' : 'Показать старые первыми'}
          >
            {sortAsc ? '↑ Сначала старые' : '↓ Сначала новые'}
          </button>
          <span className="text-xs text-primary-400">Период: {formatDate(from)} — {formatDate(to)}</span>
          {loaded && (data.length > 0 || invoices.length > 0) && (
            <>
              <button onClick={handleExport} className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">
                <FileDown className="h-4 w-4" /> Excel
              </button>
              <button onClick={exportPartnerPDF} className="flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-700">
                <Download className="h-4 w-4" /> Скачать PDF для партнёра
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
                    {sortedData.map((r) => (
                      <tr key={r.id} className="transition hover:bg-primary-50/40">
                        <td className="px-4 py-3 text-primary-700">{r.contractors?.name || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 text-primary-600">{r.trips?.name || '—'}</td>
                        <td className="px-4 py-3 text-primary-600">{r.drivers?.full_name || '—'}</td>
                        <td className="px-4 py-3 text-primary-600">{r.cars?.plate_number || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-primary-800">{r.pallets}{r.pallets2 > 0 ? `+${r.pallets2}` : ''}{r.pallets3 > 0 ? `+${r.pallets3}` : ''}</td>
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
                      <th className="px-4 py-3 font-semibold">№ счёта</th>
                      <th className="px-4 py-3 font-semibold">Дата</th>
                      <th className="px-4 py-3 font-semibold">Контрагент</th>
                      <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                      <th className="px-4 py-3 text-center font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {sortedInvoices.map((inv) => (
                      <tr key={inv.id} className="transition hover:bg-primary-50/40">
                        <td className="px-4 py-3 font-medium text-primary-800">{inv.invoice_number || '—'}</td>
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
              <StatCard label="Сумма рейсов" value={formatRub(totals.revenue)} accent={totals.revenue === totals.invTotal ? 'text-success-600 bg-success-50' : 'text-warning-600 bg-warning-50'} />
              <StatCard label="Выставлено счетов" value={formatRub(totals.invTotal)} />
              <StatCard label="Расходы" value={formatRub(totals.expTotal)} />
            </div>

            {totals.revenue !== totals.invTotal && (
              <div className="mb-4 rounded-xl bg-warning-50 p-4 text-sm text-warning-700">
                ⚠️ Сумма рейсов ({formatRub(totals.revenue)}) не совпадает с суммой выставленных счетов ({formatRub(totals.invTotal)}). Проверьте, все ли счета и рейсы введены.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <StatCard label="Оплачено (по факту)" value={formatRub(totals.invPaid)} accent="text-success-600 bg-success-50" />
              <StatCard label="Прибыль (оплачено − расходы)" value={formatRub(totals.realProfit)} accent={totals.realProfit >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50'} />
              <StatCard label="Прогноз (все счета − расходы)" value={formatRub(totals.forecastProfit)} accent={totals.forecastProfit >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50'} />
            </div>

            <div className="mb-6 rounded-2xl border-2 border-accent-300 bg-accent-50 p-5">
              <h4 className="mb-3 text-base font-bold text-accent-800">💰 Прибыль для распределения между партнёрами</h4>
              <div className="grid gap-4 sm:grid-cols-3 mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-accent-500">Получено оплат</p>
                  <p className="text-lg font-bold text-primary-900">{formatRub(totals.invPaid)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-accent-500">Расходы за период</p>
                  <p className="text-lg font-bold text-primary-900">{formatRub(totals.expTotal)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-accent-500">Расходы предыдущего месяца</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-base w-full"
                    value={prevMonthExpenses}
                    onChange={(e) => setPrevMonthExpenses(e.target.value)}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[11px] text-primary-400">Авто: расходы с {from || ''} до конца этого месяца</p>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-accent-500">Доп. расходы (после периода)</p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-base w-full"
                  value={extraExpenses}
                  onChange={(e) => setExtraExpenses(e.target.value)}
                  placeholder="0"
                />
                <p className="mt-1 text-[11px] text-primary-400">Авто: расходы после периода до конца месяца</p>
              </div>
              <div className="mb-4 rounded-xl bg-white p-4 border border-accent-200">
                <p className="text-xs font-semibold uppercase text-primary-500">Расчёт</p>
                <p className="mt-1 text-sm text-primary-700">
                  {formatRub(totals.expTotal)} − {formatRub(totals.prevMonthExpenses || 0)} + {formatRub(totals.extraExpenses || 0)} ={' '}
                  <span className="font-bold text-primary-900">{formatRub(totals.adjustedExpenses)}</span>
                  <span className="text-[11px] text-primary-400"> (итоговые расходы)</span>
                </p>
              </div>
              <div className="mb-4 rounded-xl bg-white p-4 border border-accent-200">
                <p className="text-xs font-semibold uppercase text-primary-500">Доступно партнёрам (честная цифра)</p>
                <p className={`text-xl font-bold ${totals.distributableProfit >= 0 ? 'text-success-700' : 'text-error-700'}`}>{formatRub(totals.distributableProfit)}</p>
                <p className="mt-1 text-[11px] text-primary-400">
                  {totals.distributableProfit >= 0
                    ? 'Эту сумму реально можно делить'
                    : 'Сумма отрицательная — делить нечего, расходы превысили доходы'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-4 border border-accent-200">
                  <p className="text-xs font-semibold uppercase text-primary-500">Доля партнёра (50%)</p>
                  <p className={`text-xl font-bold ${totals.partnerShare >= 0 ? 'text-accent-700' : 'text-error-700'}`}>{formatRub(totals.partnerShare)}</p>
                  <p className="mt-1 text-[11px] text-primary-400">От суммы «Доступно партнёрам»</p>
                </div>
                <div className="rounded-xl bg-white p-4 border border-accent-200">
                  <p className="text-xs font-semibold uppercase text-primary-500">Долги (не оплачено)</p>
                  <p className="text-xl font-bold text-warning-600">{formatRub(totals.invUnpaid)}</p>
                  <p className="mt-1 text-[11px] text-primary-400">Делить долги нельзя — деньги ещё не пришли</p>
                </div>
              </div>
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
                      {sortedExpenses.map((e) => (
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
