import React, { useState } from 'react';
import { Sprout, Tractor, Lock, Mail, Building2, Leaf } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setMessage({ type: 'err', text: error.message });
        }
      } else {
        if (!farmName.trim()) {
          setMessage({ type: 'err', text: 'Indica el nombre de tu granja.' });
          setBusy(false);
          return;
        }
        const { error, needsEmailConfirmation } = await signUp(email, password, farmName);
        if (error) {
          setMessage({ type: 'err', text: error.message });
        } else if (needsEmailConfirmation) {
          setMessage({
            type: 'ok',
            text: 'Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.',
          });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#1a2f1f] text-stone-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 right-0 w-[min(100%,720px)] h-[min(100%,720px)] bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,0.18),transparent_55%)] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[min(100%,600px)] h-[min(100%,600px)] bg-[radial-gradient(circle_at_bottom_left,rgba(180,140,80,0.12),transparent_50%)] pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-700 shadow-lg shadow-emerald-900/40">
            <Tractor className="text-white" size={28} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">El Capataz</h1>
            <p className="text-sm text-lime-200/80 flex items-center gap-1">
              <Leaf size={14} className="text-lime-400" />
              Gestión avícola inteligente
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-lime-900/50 bg-[#243528]/90 backdrop-blur-md shadow-2xl shadow-black/40 p-8">
          <div className="flex rounded-xl bg-black/25 p-1 mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setMessage(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-lime-500 text-[#1a2f1f] shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setMessage(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-lime-500 text-[#1a2f1f] shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Registro
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <div className="relative">
                <label className="block text-xs font-semibold uppercase tracking-wider text-lime-400/90 mb-1.5">
                  Nombre de la granja
                </label>
                <div className="relative">
                  <Building2
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-lime-600/80"
                    size={18}
                  />
                  <input
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="Ej: Granja Los Robles"
                    className="w-full rounded-xl border border-lime-900/40 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/40"
                    autoComplete="organization"
                  />
                </div>
                <p className="mt-1.5 text-xs text-stone-500 flex items-center gap-1">
                  <Sprout size={12} className="text-lime-500" />
                  Se creará tu organización y quedará vinculada a tu cuenta.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-lime-400/90 mb-1.5">
                Correo
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-lime-600/80" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-lime-900/40 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-lime-400/90 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-lime-600/80" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-lime-900/40 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/40"
                />
              </div>
            </div>

            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  message.type === 'ok'
                    ? 'bg-lime-500/15 text-lime-100 border border-lime-500/30'
                    : 'bg-red-950/50 text-red-200 border border-red-500/30'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-lime-500 hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed text-[#1a2f1f] font-bold shadow-lg shadow-lime-900/30 transition-colors"
            >
              {busy ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          Datos protegidos con Supabase Auth · Acceso solo a tu organización
        </p>
      </div>
    </div>
  );
}
