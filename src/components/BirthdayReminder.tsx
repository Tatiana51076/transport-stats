import { useMemo } from 'react';
import { Cake, X } from 'lucide-react';
import type { Driver } from '@/lib/types';
import { formatDate } from '@/lib/format';

function daysUntilBirthday(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
}

export function BirthdayReminder({ drivers, onDismiss }: { drivers: Driver[]; onDismiss: (id: string) => void }) {
  const upcoming = useMemo(() => {
    return drivers
      .map((d) => ({ driver: d, days: daysUntilBirthday(d.birth_date) }))
      .filter((x) => x.days !== null && x.days <= 3 && x.days >= 0)
      .sort((a, b) => (a.days as number) - (b.days as number));
  }, [drivers]);

  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-2 no-print">
      {upcoming.map(({ driver, days }) => (
        <div key={driver.id} className="flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3">
          <Cake className="h-5 w-5 shrink-0 text-accent-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-primary-900">
              🎂 {driver.full_name}{days === 0 ? ' — день рождения сегодня!' : ` — день рождения через ${days} дн.`}
            </p>
            {driver.birth_date && <p className="text-xs text-primary-500">Дата рождения: {formatDate(driver.birth_date)}</p>}
          </div>
          <button onClick={() => onDismiss(driver.id)} className="rounded-lg p-1.5 text-accent-400 transition hover:bg-accent-100 hover:text-accent-700" title="Скрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
