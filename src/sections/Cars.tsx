import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Plus, ArrowLeft, Calendar, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Car, RecordWithRefs } from '@/lib/types';
import { MAX_RECORDS_PER_CAR } from '@/lib/types';
import { formatRub, formatDate, toDateInput } from '@/lib/format';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DeleteButton } from '@/components/DeleteButton';
import { EmptyState, LoadingState } from '@/components/States';
import { VoiceInputButton } from '@/components/VoiceInput';
import { parseVoiceInput } from '@/lib/voiceParser';
import type { ToastFn } from '@/hooks/useToasts';

interface CarListProps {
  cars: Car[];
  loading: boolean;
  notify: ToastFn;
  onDeleted: () => void;
  onOpen: (car: Car) => void;
}

export function CarList({ cars, loading, notify, onDeleted, onOpen }: CarListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [confirmCar, setConfirmCar] = useState<Car | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirmCar) return;
    setDeleting(true);
    const { error } = await supabase.from('cars').delete().eq('id', confirmCar.id);
    setDeleting(false);
    if (error) {
      notify('Ошибка при удалении автомобиля', 'error');
    } else {
      notify('Автомобиль удалён');
      setConfirmCar(null);
      onDeleted();
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Автомобили"
        subtitle="Учёт транспортных средств и рейсов по каждому автомобилю"
        action={
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Добавить автомобиль</span>
            <span className="sm:hidden">Добавить</span>
          </button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : cars.length === 0 ? (
        <EmptyState
          title="Автомобили ещё не добавлены"
          description="Нажмите «Добавить автомобиль», чтобы создать первую запись"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => (
            <button
              key={car.id}
              onClick={() => onOpen(car)}
              className="group relative flex items-start gap-4 rounded-2xl border border-primary-100 bg-white p-5 text-left shadow-card transition hover:shadow-card-hover hover:border-primary-300"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition group-hover:bg-primary-100">
                <Truck className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-primary-900">{car.plate_number}</p>
                {(car.brand || car.model) && (
                  <p className="mt-0.5 truncate text-sm text-primary-500">
                    {[car.brand, car.model].filter(Boolean).join(' ')}
                  </p>
                )}
                {car.year && <p className="mt-1 text-xs text-primary-400">{car.year} г.{car.vin ? ` · VIN: ${car.vin}` : ''}</p>}
              </div>
              <div className="absolute right-3 top-3" onClick={(e) => { e.stopPropagation(); setConfirmCar(car); }}>
                <DeleteButton onClick={() => setConfirmCar(car)} />
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && <AddCarForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onDeleted(); }} notify={notify} />}

      <ConfirmModal
        open={!!confirmCar}
        title="Удалить автомобиль?"
        message={`Автомобиль «${confirmCar?.plate_number}» и все связанные с ним рейсы будут удалены без возможности восстановления.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmCar(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}

interface AddCarFormProps {
  onClose: () => void;
  onSaved: () => void;
  notify: ToastFn;
}

function AddCarForm({ onClose, onSaved, notify }: AddCarFormProps) {
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!plate.trim()) { setErr('Укажите госномер'); return; }
    setSaving(true);
    const { error } = await supabase.from('cars').insert({
      plate_number: plate.trim().toUpperCase(),
      brand: brand.trim() || null,
      model: model.trim() || null,
      year: year ? Number(year) : null,
      vin: vin.trim() || null,
    });
    setSaving(false);
    if (error) {
      if (error.code === '23505') { setErr('Автомобиль с таким госномером уже существует'); return; }
      setErr(error.message); return;
    }
    notify('Автомобиль добавлен');
    onSaved();
  };

  return (
    <Modal title="Добавить автомобиль" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Госномер *">
          <input className="input-base uppercase" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123ВВ77" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Марка">
            <input className="input-base" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="ГАЗ" />
          </Field>
          <Field label="Модель">
            <input className="input-base" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Валдай" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Год выпуска">
            <input className="input-base" type="number" min="1900" max="2100" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" />
          </Field>
          <Field label="VIN">
            <input className="input-base" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="XTA…" />
          </Field>
        </div>
        {err && <p className="text-sm text-error-600">{err}</p>}
        <FormActions onCancel={onClose} saving={saving} submitLabel="Сохранить" />
      </form>
    </Modal>
  );
}

interface CarDetailProps {
  car: Car;
  refs: { drivers: { id: string; full_name: string }[]; contractors: { id: string; name: string }[]; trips: { id: string; name: string }[] };
  notify: ToastFn;
  onBack: () => void;
  onRefsReload: () => void;
}

export function CarDetail({ car, refs, notify, onBack, onRefsReload }: CarDetailProps) {
  const [records, setRecords] = useState<RecordWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRec, setConfirmRec] = useState<RecordWithRefs | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('records')
      .select('*, trips(id,name), drivers(id,full_name), contractors(id,name)')
      .eq('car_id', car.id)
      .order('date', { ascending: false });
    if (error) { notify('Ошибка загрузки рейсов', 'error'); }
    setRecords((data as RecordWithRefs[]) || []);
    setLoading(false);
  }, [car.id, notify]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleDeleteRecord = async () => {
    if (!confirmRec) return;
    setDeleting(true);
    const { error } = await supabase.from('records').delete().eq('id', confirmRec.id);
    setDeleting(false);
    if (error) { notify('Ошибка удаления', 'error'); }
    else { notify('Рейс удалён'); setConfirmRec(null); loadRecords(); }
  };

  const slotsLeft = MAX_RECORDS_PER_CAR - records.length;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-primary-500 transition hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" />
        <span>Назад к автомобилям</span>
      </button>

      <div className="card-base p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white">
            <Truck className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-primary-900">{car.plate_number}</h2>
            {(car.brand || car.model) && <p className="text-primary-500">{[car.brand, car.model].filter(Boolean).join(' ')}</p>}
            <p className="mt-1 text-xs text-primary-400">
              {[car.year && `${car.year} г.`, car.vin && `VIN: ${car.vin}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="card-base p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary-900">Рейсы автомобиля</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${slotsLeft > 0 ? 'bg-primary-50 text-primary-600' : 'bg-error-50 text-error-600'}`}>
            {records.length} / {MAX_RECORDS_PER_CAR}
          </span>
        </div>

        {records.length < MAX_RECORDS_PER_CAR ? (
          <AddRecordForm carId={car.id} refs={refs} onSaved={() => { loadRecords(); onRefsReload(); }} notify={notify} />
        ) : (
          <div className="rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
            Достигнут лимит рейсов ({MAX_RECORDS_PER_CAR}). Удалите один из рейсов, чтобы добавить новый.
          </div>
        )}
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : records.length === 0 ? (
          <EmptyState title="Рейсов пока нет" description="Добавьте первый рейс с помощью формы выше" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50 text-left text-xs uppercase tracking-wide text-primary-500">
                  <th className="px-4 py-3 font-semibold">Дата</th>
                  <th className="px-4 py-3 font-semibold">Рейс</th>
                  <th className="px-4 py-3 font-semibold">Водитель</th>
                  <th className="px-4 py-3 font-semibold">Контрагент</th>
                  <th className="px-4 py-3 text-right font-semibold">Паллеты</th>
                  <th className="px-4 py-3 text-right font-semibold">Стоимость</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {records.map((r) => (
                  <tr key={r.id} className="transition hover:bg-primary-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-primary-800">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-primary-600">{r.trips?.name || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{r.drivers?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{r.contractors?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{r.pallets}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary-800">{formatRub(r.cost)}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteButton onClick={() => setConfirmRec(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmRec}
        title="Удалить рейс?"
        message={`Рейс от ${formatDate(confirmRec?.date)} будет удалён.`}
        onConfirm={handleDeleteRecord}
        onCancel={() => setConfirmRec(null)}
        danger
        confirmLabel={deleting ? 'Удаление…' : 'Удалить'}
      />
    </div>
  );
}

interface AddRecordFormProps {
  carId: string;
  refs: { drivers: { id: string; full_name: string }[]; contractors: { id: string; name: string }[]; trips: { id: string; name: string }[] };
  onSaved: () => void;
  notify: ToastFn;
}

function AddRecordForm({ carId, refs, onSaved, notify }: AddRecordFormProps) {
  const today = toDateInput(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [tripId, setTripId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [cost, setCost] = useState('');
  const [pallets, setPallets] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const voiceLookups = useMemo(() => ({
    cars: [],
    drivers: refs.drivers.map((d) => ({ id: d.id, label: d.full_name })),
    contractors: refs.contractors.map((c) => ({ id: c.id, label: c.name })),
    trips: refs.trips.map((t) => ({ id: t.id, label: t.name })),
  }), [refs]);

  const handleVoiceResult = useCallback((text: string) => {
    const parsed = parseVoiceInput(text, voiceLookups);
    if (parsed.date) setDate(parsed.date);
    if (parsed.trip_name) setTripId(parsed.trip_name);
    if (parsed.driver_name) setDriverId(parsed.driver_name);
    if (parsed.contractor_name) setContractorId(parsed.contractor_name);
    if (parsed.pallets !== undefined) setPallets(String(parsed.pallets));
    if (parsed.cost !== undefined) setCost(String(parsed.cost));
    notify('Голос распознан. Проверьте поля и нажмите «Добавить рейс»', 'info');
  }, [voiceLookups, notify]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!date) { setErr('Укажите дату'); return; }
    if (!tripId) { setErr('Выберите рейс'); return; }
    if (!driverId) { setErr('Выберите водителя'); return; }
    if (!contractorId) { setErr('Выберите контрагента'); return; }
    const costNum = parseFloat(cost);
    const palletsNum = parseInt(pallets, 10);
    if (!costNum || costNum <= 0) { setErr('Стоимость должна быть больше 0'); return; }
    if (!palletsNum || palletsNum <= 0) { setErr('Количество паллет должно быть больше 0'); return; }

    setSaving(true);
    const { error } = await supabase.from('records').insert({
      car_id: carId,
      trip_id: tripId,
      driver_id: driverId,
      contractor_id: contractorId,
      date,
      cost: costNum,
      pallets: palletsNum,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes('лимит')) { setErr(error.message); return; }
      setErr(error.message); return;
    }
    notify('Рейс добавлен');
    setDate(today); setTripId(''); setDriverId(''); setContractorId(''); setCost(''); setPallets('');
    onSaved();
  };

  const emptyRefs = refs.drivers.length === 0 && refs.contractors.length === 0 && refs.trips.length === 0;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-primary-100 bg-primary-50/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Дата *">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
            <input type="date" className="input-base pl-9" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </Field>
        <Field label="Рейс *">
          <Select value={tripId} onChange={setTripId} options={refs.trips.map((t) => ({ value: t.id, label: t.name }))} placeholder="Выберите рейс" />
        </Field>
        <Field label="Водитель *">
          <Select value={driverId} onChange={setDriverId} options={refs.drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder="Выберите водителя" />
        </Field>
        <Field label="Контрагент *">
          <Select value={contractorId} onChange={setContractorId} options={refs.contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Выберите контрагента" />
        </Field>
        <Field label="Паллеты *">
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
            <input type="number" min="1" step="1" className="input-base pl-9" value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder="10" />
          </div>
        </Field>
        <Field label="Стоимость, ₽ *">
          <input type="number" min="0" step="0.01" className="input-base" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="3000.00" />
        </Field>
      </div>

      {emptyRefs && (
        <p className="text-xs text-warning-700">Сначала добавьте водителей, контрагентов и рейсы в соответствующих разделах.</p>
      )}
      {err && <p className="text-sm text-error-600">{err}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <VoiceInputButton onResult={handleVoiceResult} label="Продиктовать рейс" />
        <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60">
          <Plus className="h-4 w-4" />
          {saving ? 'Сохранение…' : 'Добавить рейс'}
        </button>
      </div>
    </form>
  );
}

// --- shared UI bits (kept local to avoid an extra import hop) ---

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-primary-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-primary-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-card-hover animate-scale-in max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-primary-400 transition hover:bg-primary-50 hover:text-primary-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-base">{label}</label>
      {children}
    </div>
  );
}

export function FormActions({ onCancel, saving, submitLabel = 'Сохранить' }: { onCancel: () => void; saving: boolean; submitLabel?: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">Отмена</button>
      <button type="submit" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60">
        {saving ? 'Сохранение…' : submitLabel}
      </button>
    </div>
  );
}

interface SelectOption { value: string; label: string; }

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: SelectOption[]; placeholder: string }) {
  return (
    <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
