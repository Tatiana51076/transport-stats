import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppShell, type Section } from '@/components/AppShell';
import { useReferences } from '@/hooks/useReferences';
import { useToasts } from '@/hooks/useToasts';
import type { Car, Fine } from '@/lib/types';
import { formatRub, formatDate } from '@/lib/format';
import { CarList, CarDetail } from '@/sections/Cars';
import { SimpleList } from '@/sections/SimpleList';
import { Reports } from '@/sections/Reports';
import { ExpensesSection } from '@/sections/Expenses';
import { InvoicesSection } from '@/sections/Invoices';
import { Refuels } from '@/sections/Refuels';
import { DriverRating } from '@/sections/DriverRating';
import { BirthdayReminder } from '@/components/BirthdayReminder';
import { AuthPage } from '@/sections/Auth';
import { parseVoiceInput } from '@/lib/voiceParser';
import { VoiceInputButton } from '@/components/VoiceInput';
import { supabase } from '@/lib/supabase';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [unpaidFines, setUnpaidFines] = useState<Fine[]>([]);
  const [section, setSection] = useState<Section>('cars');
  const [openCar, setOpenCar] = useState<Car | null>(null);
  const [globalVoiceKey, setGlobalVoiceKey] = useState(0);
  const { toasts, dismiss, notify } = useToasts();
  const refs = useReferences();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.from('fines').select('*, drivers(id,full_name)').eq('paid', false).then(({ data }) => {
      if (!data) return;
      const rows = data as (Fine & { drivers?: { full_name: string } | null })[];
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      setUnpaidFines(sorted.slice(0, 5));
    });
  }, []);

  const voiceLookups = useMemo(() => ({
    cars: refs.cars.map((c) => ({ id: c.id, label: `${c.plate_number} ${c.brand || ''} ${c.model || ''}` })),
    drivers: refs.drivers.map((d) => ({ id: d.id, label: d.full_name })),
    contractors: refs.contractors.map((c) => ({ id: c.id, label: c.name })),
    trips: refs.trips.map((t) => ({ id: t.id, label: t.name })),
  }), [refs]);

  const handleGlobalVoice = useCallback((text: string) => {
    const parsed = parseVoiceInput(text, voiceLookups);
    if (parsed.action === 'navigate' && parsed.navigateTo) {
      setOpenCar(null);
      setSection(parsed.navigateTo as Section);
      notify(`Переход в раздел «${parsed.navigateTo}»`, 'info');
    } else if (parsed.action === 'add_car') {
      setSection('cars');
      notify('Перейдите в раздел Автомобили и нажмите «Добавить»', 'info');
    } else if (parsed.action === 'add_driver' || parsed.action === 'add_contractor' || parsed.action === 'add_trip') {
      const target = parsed.action === 'add_driver' ? 'drivers' :
                     parsed.action === 'add_contractor' ? 'contractors' : 'trips';
      setOpenCar(null);
      setSection(target as Section);
      notify(`Переход в раздел «${target}»`, 'info');
    } else {
      notify('Команда не распознана. Попробуйте: «Перейди в отчёты»', 'error');
    }
    setGlobalVoiceKey((k) => k + 1);
  }, [voiceLookups, notify]);

  const handleNavigate = useCallback((s: Section) => {
    setOpenCar(null);
    setSection(s);
  }, []);

  const renderSection = () => {
    if (section === 'cars') {
      if (openCar) {
        return (
          <CarDetail
            car={openCar}
            refs={refs}
            notify={notify}
            onBack={() => setOpenCar(null)}
            onRefsReload={refs.reload}
          />
        );
      }
      return (
        <CarList
          cars={refs.cars}
          loading={refs.loading}
          notify={notify}
          onDeleted={refs.reload}
          onOpen={(car) => setOpenCar(car)}
        />
      );
    }
    if (section === 'trips') {
      return (
        <SimpleList
          title="Рейсы"
          subtitle="Справочник маршрутов и номеров рейсов"
          fieldName="name"
          tableName="trips"
          items={refs.trips}
          loading={refs.loading}
          notify={notify}
          onChanged={refs.reload}
        />
      );
    }
    if (section === 'drivers') {
      return (
        <SimpleList
          title="Водители"
          subtitle="Справочник водителей"
          fieldName="full_name"
          tableName="drivers"
          items={refs.drivers}
          loading={refs.loading}
          notify={notify}
          onChanged={refs.reload}
        />
      );
    }
    if (section === 'contractors') {
      return (
        <SimpleList
          title="Контрагенты"
          subtitle="Справочник контрагентов"
          fieldName="name"
          tableName="contractors"
          items={refs.contractors}
          loading={refs.loading}
          notify={notify}
          onChanged={refs.reload}
        />
      );
    }
    if (section === 'expenses') {
      return <ExpensesSection cars={refs.cars} drivers={refs.drivers} notify={notify} />;
    }
    if (section === 'invoices') {
      return <InvoicesSection contractors={refs.contractors} cars={refs.cars} drivers={refs.drivers} notify={notify} />;
    }
    if (section === 'refuels') {
      return <Refuels cars={refs.cars} drivers={refs.drivers} notify={notify} />;
    }
    if (section === 'rating') {
      return <DriverRating cars={refs.cars} drivers={refs.drivers} notify={notify} />;
    }
    if (section === 'reports') {
      return <Reports cars={refs.cars} drivers={refs.drivers} contractors={refs.contractors} notify={notify} />;
    }
    return null;
  };

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!authenticated) {
    return <AuthPage onAuth={() => setAuthenticated(true)} />;
  }

  return (
    <>
      <AppShell active={section} onNavigate={handleNavigate} onLogout={() => { localStorage.removeItem('transport-stats-auth-v2'); setAuthenticated(false); }} toasts={toasts} onDismissToast={dismiss}>
        <BirthdayReminder drivers={refs.drivers} onDismiss={() => {}} />
        {unpaidFines.length > 0 && (
          <div className="mb-4 rounded-xl border border-error-200 bg-error-50 p-4 no-print">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-error-600" />
              <h4 className="text-sm font-bold text-error-700">Неоплаченные штрафы</h4>
            </div>
            <div className="divide-y divide-error-100">
              {unpaidFines.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-primary-800">
                    {(f as any).drivers?.full_name || '—'} · {formatDate(f.date)}{f.description ? ` · ${f.description}` : ''}
                  </span>
                  <span className="shrink-0 font-semibold text-error-700">{formatRub(f.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {renderSection()}
      </AppShell>
      <div className="fixed bottom-20 right-4 z-50 lg:bottom-6 no-print" key={globalVoiceKey}>
        <VoiceInputButton onResult={handleGlobalVoice} label="Навигация" />
      </div>
    </>
  );
}

export default App;
