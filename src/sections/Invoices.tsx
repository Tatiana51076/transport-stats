import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, CheckCircle2, XCircle, AlertCircle, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InvoiceWithRefs } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { SectionHeader, Modal, Field, FormActions, Select } from '@/sections/Cars';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import type { ToastFn } from '@/hooks/useToasts';

interface InvoicesSectionProps {
  contractors: { id: string; name: string }[];
  cars: { id: string; plate_number: string; brand: string | null }[];
  drivers: { id: string; full_name: string }[];
  notify: ToastFn;
}

export function InvoicesSection({ contractors, cars, drivers, notify }: InvoicesSectionProps) {
  const [invoices, setInvoices] = useState<InvoiceWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editInvoice, setEditInvoice] = useState<InvoiceWithRefs | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InvoiceWithRefs | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('invoices').select('*, cars(id,plate_number), drivers(id,full_name)').order('date', { ascending: false });
    if (!error) setInvoices((data as InvoiceWithRefs[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('invoices').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) { notify('Ошибка удаления', 'error'); }
    else { notify('Счёт удалён'); setConfirmDelete(null); load(); }
  };

  const handleTogglePaid = async (inv: InvoiceWithRefs) => {
    const newPaid = !inv.paid;
    const { error } = await supabase.from('invoices').update({ paid: newPaid, paid_amount: newPaid ? inv.amount : (inv.paid_amount || 0) }).eq('id', inv.id);
    if (!error) load();
  };

  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paid ? i.amount : (i.paid_amount || 0)), 0);
  const totalUnpaid = totalAmount - totalPaid;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Счета"
        subtitle="Учёт выставленных счетов контрагентам"
        action={
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Выставить счёт</span>
            <span className="sm:hidden">+</span>
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-base p-4">
          <p className="text-xs font-semibold uppercase text-primary-400">Всего выставлено</p>
          <p className="mt-1 text-xl font-bold text-primary-900">{formatRub(totalAmount)}</p>
        </div>
        <div className="card-base p-4 border-success-200 bg-success-50">
          <p className="text-xs font-semibold uppercase text-success-700">Оплачено</p>
          <p className="mt-1 text-xl font-bold text-success-700">{formatRub(totalPaid)}</p>
        </div>
        <div className="card-base p-4 border-error-200 bg-error-50">
          <p className="text-xs font-semibold uppercase text-error-700">Не оплачено</p>
          <p className="mt-1 text-xl font-bold text-error-700">{formatRub(totalUnpaid)}</p>
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="card-base p-5">
          <h3 className="mb-3 text-sm font-bold text-primary-900">Разбивка по контрагентам</h3>
          <div className="divide-y divide-primary-50">
            {Array.from(new Set(invoices.map((i) => i.contractor_name))).map((name) => {
              const invs = invoices.filter((i) => i.contractor_name === name);
              const total = invs.reduce((s, i) => s + Number(i.amount), 0);
              const paid = invs.reduce((s, i) => s + Number(i.paid ? i.amount : (i.paid_amount || 0)), 0);
              const unpaid = total - paid;
              return (
                <div key={name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium text-primary-700">{name}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-primary-500">Всего: {formatRub(total)}</span>
                    <span className="text-success-600">Оплачено: {formatRub(paid)}</span>
                    <span className="text-error-600">Долг: {formatRub(unpaid)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && <AddInvoiceForm contractors={contractors} cars={cars} drivers={drivers} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} notify={notify} />}

      {editInvoice && <EditInvoiceForm invoice={editInvoice} contractors={contractors} cars={cars} drivers={drivers} onClose={() => setEditInvoice(null)} onSaved={() => { setEditInvoice(null); load(); }} notify={notify} />}

      {loading ? (
        <LoadingState />
      ) : invoices.length === 0 ? (
        <EmptyState title="Счетов пока нет" description="Нажмите «Выставить счёт», чтобы создать первый" />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Контрагент</th>
                  <th className="px-4 py-3 font-semibold">Автомобиль</th>
                  <th className="px-4 py-3 font-semibold">Водитель</th>
                  <th className="px-4 py-3 text-right font-semibold">Сумма</th>
                  <th className="px-4 py-3 text-right font-semibold">Оплачено</th>
                  <th className="px-4 py-3 text-right font-semibold">Остаток</th>
                  <th className="px-4 py-3 text-center font-semibold">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {invoices.map((inv) => {
                  const paidAmount = Number(inv.paid ? inv.amount : (inv.paid_amount || 0));
                  const remaining = Number(inv.amount) - paidAmount;
                  const isPartial = !inv.paid && Number(inv.paid_amount) > 0 && Number(inv.paid_amount) < Number(inv.amount);
                  return (
                  <tr key={inv.id} className={`transition hover:bg-primary-50/40 ${isPartial ? 'bg-error-50/60' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3 text-primary-700">{inv.contractor_name}</td>
                    <td className="px-4 py-3 text-primary-600">{inv.cars?.plate_number || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{inv.drivers?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(inv.amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-success-600">{formatRub(paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-error-600">{formatRub(remaining)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleTogglePaid(inv)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition hover:opacity-80 ${
                          inv.paid ? 'bg-success-50 text-success-700 border-success-200' : isPartial ? 'bg-error-50 text-error-700 border-error-200' : 'bg-error-50 text-error-700 border-error-200'
                        }`}
                        title="Нажмите чтобы изменить статус"
                      >
                        {inv.paid ? <CheckCircle2 className="h-3 w-3" /> : isPartial ? <AlertCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {inv.paid ? 'Оплачен' : isPartial ? 'Частично' : 'Не оплачен'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditInvoice(inv)} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-100 hover:text-primary-600" title="Редактировать"><Pencil className="h-4 w-4" /></button>
                        <DeleteButton onClick={() => setConfirmDelete(inv)} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить счёт?"
        message={`Счёт на сумму ${formatRub(confirmDelete?.amount || 0)} будет удалён.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}

function AddInvoiceForm({ contractors, cars, drivers, onClose, onSaved, notify }: {
  contractors: { id: string; name: string }[];
  cars: { id: string; plate_number: string; brand: string | null }[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const today = toDateInput(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [contractorId, setContractorId] = useState('');
  const [carId, setCarId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [amount, setAmount] = useState('');
  const [partial, setPartial] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!contractorId) { setErr('Выберите контрагента'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть больше 0'); return; }
    const paidVal = parseFloat(paidAmount) || 0;
    if (paidVal > amt) { setErr('Оплачено не может превышать сумму счёта'); return; }
    const contractorName = contractors.find((c) => c.id === contractorId)?.name || '';
    setSaving(true);
    const { error } = await supabase.from('invoices').insert({
      contractor_name: contractorName,
      car_id: carId || null,
      driver_id: driverId || null,
      amount: amt,
      paid: !partial && paidVal >= amt,
      paid_amount: paidVal,
      date,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Счёт добавлен');
    onSaved();
  };

  return (
    <Modal title="Выставить счёт" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Контрагент *">
          <Select value={contractorId} onChange={setContractorId} options={contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Выберите контрагента" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Автомобиль">
            <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Не выбрано" />
          </Field>
          <Field label="Водитель">
            <Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Не выбран" />
          </Field>
        </div>
        <Field label="Дата *">
          <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Сумма счёта, ₽ *">
          <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary-200 bg-white p-3 transition hover:bg-primary-50">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-5 w-5 rounded border-primary-300 text-accent-600 focus:ring-accent-500" />
          <div>
            <p className="text-sm font-medium text-primary-800">Счёт оплачен частично</p>
            <p className="text-xs text-primary-400">Отметьте, если оплачена только часть суммы</p>
          </div>
        </label>
        {partial && (
          <Field label="Оплачено по факту, ₽">
            <input type="number" min="0" step="0.01" className="input-base" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="30000" />
          </Field>
        )}
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}

function EditInvoiceForm({ invoice, contractors, cars, drivers, onClose, onSaved, notify }: {
  invoice: InvoiceWithRefs;
  contractors: { id: string; name: string }[];
  cars: { id: string; plate_number: string; brand: string | null }[];
  drivers: { id: string; full_name: string }[];
  onClose: () => void; onSaved: () => void; notify: ToastFn;
}) {
  const [date, setDate] = useState(toDateInput(invoice.date));
  const [contractorId, setContractorId] = useState(contractors.find((c) => c.name === invoice.contractor_name)?.id || '');
  const [carId, setCarId] = useState(invoice.car_id || '');
  const [driverId, setDriverId] = useState(invoice.driver_id || '');
  const [amount, setAmount] = useState(String(invoice.amount));
  const [partial, setPartial] = useState(!invoice.paid && Number(invoice.paid_amount) > 0 && Number(invoice.paid_amount) < Number(invoice.amount));
  const [paidAmount, setPaidAmount] = useState(String(invoice.paid_amount || 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть больше 0'); return; }
    const paidVal = parseFloat(paidAmount) || 0;
    if (paidVal > amt) { setErr('Оплачено не может превышать сумму счёта'); return; }
    setSaving(true);
    const { error } = await supabase.from('invoices').update({
      date,
      contractor_name: contractors.find((c) => c.id === contractorId)?.name || invoice.contractor_name,
      car_id: carId || null,
      driver_id: driverId || null,
      amount: amt,
      paid: !partial && paidVal >= amt,
      paid_amount: paidVal,
    }).eq('id', invoice.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    notify('Счёт изменён');
    onSaved();
  };

  return (
    <Modal title="Редактировать счёт" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Контрагент *">
          <Select value={contractorId} onChange={setContractorId} options={contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Выберите контрагента" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Автомобиль">
            <Select value={carId} onChange={setCarId} options={cars.map((c) => ({ value: c.id, label: `${c.plate_number}${c.brand ? ' · ' + c.brand : ''}` }))} placeholder="Не выбрано" />
          </Field>
          <Field label="Водитель">
            <Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Не выбран" />
          </Field>
        </div>
        <Field label="Дата *">
          <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Сумма счёта, ₽ *">
          <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary-200 bg-white p-3 transition hover:bg-primary-50">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-5 w-5 rounded border-primary-300 text-accent-600 focus:ring-accent-500" />
          <div>
            <p className="text-sm font-medium text-primary-800">Счёт оплачен частично</p>
            <p className="text-xs text-primary-400">Отметьте, если оплачена только часть суммы</p>
          </div>
        </label>
        {partial && (
          <Field label="Оплачено по факту, ₽">
            <input type="number" min="0" step="0.01" className="input-base" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="30000" />
          </Field>
        )}
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
