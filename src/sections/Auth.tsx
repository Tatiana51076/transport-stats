import { useState, useEffect, useCallback } from 'react';
import { Truck, Eye, EyeOff, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AuthProps {
  onAuth: () => void;
}

export function AuthPage({ onAuth }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('transport-stats-credentials');
    if (saved) {
      try {
        const { email: savedEmail, password: savedPassword } = JSON.parse(saved);
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
        }
      } catch {}
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError('Введите email'); return; }
    if (!password.trim()) { setError('Введите пароль'); return; }
    if (password.length < 6) { setError('Пароль должен быть не менее 6 символов'); return; }

    setLoading(true);

    if (mode === 'login') {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (authError) {
        if (authError.message.includes('Invalid login')) {
          setError('Неверный email или пароль');
        } else {
          setError(authError.message);
        }
        return;
      }
      if (remember) {
        localStorage.setItem('transport-stats-credentials', JSON.stringify({ email: email.trim(), password }));
      } else {
        localStorage.removeItem('transport-stats-credentials');
      }
      onAuth();
    } else {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (remember) {
        localStorage.setItem('transport-stats-credentials', JSON.stringify({ email: email.trim(), password }));
      }
      setMode('login');
      setError('Регистрация прошла успешно! Теперь войдите.');
    }
  }, [email, password, remember, mode, onAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-700 via-primary-600 to-accent-700 p-4">
      <div className="w-full max-w-md animate-scale-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Truck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Статистика перевозок</h1>
          <p className="mt-1 text-sm text-white/70">Учёт и аналитика грузоперевозок</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 flex rounded-xl bg-primary-50 p-1">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-white text-primary-900 shadow-card' : 'text-primary-500 hover:text-primary-700'}`}
            >
              <LogIn className="mr-1.5 inline h-4 w-4" />
              Вход
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-white text-primary-900 shadow-card' : 'text-primary-500 hover:text-primary-700'}`}
            >
              <UserPlus className="mr-1.5 inline h-4 w-4" />
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-base">Email</label>
              <input
                type="email"
                className="input-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label-base">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-base pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-primary-600">Запомнить меня</span>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-error-50 p-3 text-sm text-error-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary-600 py-3 text-sm font-bold text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-primary-400">
            {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            {' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              className="font-semibold text-primary-600 hover:text-primary-800"
            >
              {mode === 'login' ? 'Создать аккаунт' : 'Войти'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
