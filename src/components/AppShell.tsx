import { useState } from 'react';
import { Truck, ClipboardList, Users, Building2, BarChart3, Wallet, FileText, Fuel, Trophy, LogOut, Menu, X } from 'lucide-react';
import { Toast, type ToastMessage } from '@/components/Toast';

export type Section = 'cars' | 'trips' | 'drivers' | 'contractors' | 'expenses' | 'invoices' | 'refuels' | 'rating' | 'reports';

interface NavItem {
  key: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'cars', label: 'Автомобили', icon: Truck },
  { key: 'trips', label: 'Рейсы', icon: ClipboardList },
  { key: 'drivers', label: 'Водители', icon: Users },
  { key: 'contractors', label: 'Контрагенты', icon: Building2 },
  { key: 'expenses', label: 'Расходы', icon: Wallet },
  { key: 'invoices', label: 'Счета', icon: FileText },
  { key: 'refuels', label: 'Заправки', icon: Fuel },
  { key: 'rating', label: 'Рейтинг', icon: Trophy },
  { key: 'reports', label: 'Отчёты', icon: BarChart3 },
];

interface AppShellProps {
  active: Section;
  onNavigate: (s: Section) => void;
  onLogout: () => void;
  toasts: ToastMessage[];
  onDismissToast: (id: string) => void;
  children: React.ReactNode;
}

export function AppShell({ active, onNavigate, onLogout, toasts, onDismissToast, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (s: Section) => {
    onNavigate(s);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-primary-50">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden h-full w-64 flex-col border-r border-primary-100 bg-white lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-primary-900">Статистика</p>
            <p className="text-xs leading-tight text-primary-400">перевозок</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavButton key={item.key} item={item} active={active === item.key} onClick={() => handleNav(item.key)} />
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-error-600 transition hover:bg-error-50">
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Выйти</span>
          </button>
        </div>
        <div className="px-6 py-4 text-xs text-primary-300">
          <p>Версия 1.0</p>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-primary-100 bg-white px-4 py-3 lg:hidden no-print">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Truck className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-primary-900">Статистика перевозок</span>
        </div>
        <button onClick={() => setMobileMenuOpen(true)} className="rounded-lg p-2 text-primary-600 hover:bg-primary-50">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile slide-over menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-primary-950/40 backdrop-blur-sm animate-fade-in" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-card-hover animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-primary-100">
              <span className="text-sm font-bold text-primary-900">Меню</span>
              <button onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-2 text-primary-400 hover:bg-primary-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1 p-3">
              {NAV_ITEMS.map((item) => (
                <NavButton key={item.key} item={item} active={active === item.key} onClick={() => handleNav(item.key)} />
              ))}
            </nav>
            <div className="border-t border-primary-100 p-3">
              <button onClick={() => { setMobileMenuOpen(false); onLogout(); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-error-600 transition hover:bg-error-50">
                <LogOut className="h-5 w-5 shrink-0" />
                <span>Выйти</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-primary-100 bg-white/95 backdrop-blur lg:hidden no-print">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition ${isActive ? 'text-primary-600' : 'text-primary-300'}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <Toast toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
        active ? 'bg-primary-600 text-white shadow-card' : 'text-primary-600 hover:bg-primary-50'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </button>
  );
}
