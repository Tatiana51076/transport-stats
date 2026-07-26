import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, CheckCircle2, XCircle, Truck, User } from 'lucide-react';
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

  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.paid).reduce((s, i) => s + Number(i.amount), 0);
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

      {showAdd && <AddInvoiceForm contractors={contractors} cars={cars} drivers={drivers} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} notify={notify} />}

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
                  <th className="px-4 py-3 text-center font-semibold">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="transition hover:bg-primary-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3 text-primary-700">{inv.contractor_name}</td>
                    <td className="px-4 py-3 text-primary-600">{inv.cars?.plate_number || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{inv.drivers?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(inv.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${inv.paid ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                        {inv.paid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {inv.paid ? 'Оплачен' : 'Не оплачен'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right"><DeleteButton onClick={() => setConfirmDelete(inv)} /></td>
                  </tr>
                ))}
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
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!contractorId) { setErr('Выберите контрагента'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Сумма должна быть больше 0'); return; }
    const contractorName = contractors.find((c) => c.id === contractorId)?.name || '';
    setSaving(true);
    const { error } = await supabase.from('invoices').insert({
      contractor_name: contractorName,
      car_id: carId || null,
      driver_id: driverId || null,
      amount: amt,
      paid,
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
        <Field label="Сумма, ₽ *">
          <input type="number" min="0" step="0.01" className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary-200 bg-white p-3 transition hover:bg-primary-50">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-5 w-5 rounded border-primary-300 text-primary-600 focus:ring-primary-500" />
          <div>
            <p className="text-sm font-medium text-primary-800">Счёт оплачен</p>
            <p className="text-xs text-primary-400">Снимите галочку если счёт ещё не оплачен</p>
          </div>
        </label>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}
