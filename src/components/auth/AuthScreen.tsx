import React, { useState } from 'react';
import { Sprout, Lock, Mail, Building2, Leaf } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [fullName, setFullName] = useState('');
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
        const invite = inviteCode.trim().toUpperCase();
        if (!invite && !farmName.trim()) {
          setMessage({
            type: 'err',
            text: 'Indicá el nombre de tu granja o un código de invitación para unirte a una existente.',
          });
          setBusy(false);
          return;
        }
        const { error, needsEmailConfirmation } = await signUp(email, password, {
          farmName: farmName.trim(),
          inviteCode: invite,
          fullName: fullName.trim(),
        });
        if (error) {
          setMessage({ type: 'err', text: error.message });
        } else if (needsEmailConfirmation) {
          setMessage({
            type: 'ok',
            text: 'Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.',
          });
        } else {
          setMessage({
            type: 'ok',
            text: 'Cuenta creada. Ya podés iniciar sesión.',
          });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-capataz-forest-deep text-stone-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 right-0 w-[min(100%,720px)] h-[min(100%,720px)] bg-[radial-gradient(circle_at_top_right,rgba(167,243,208,0.2),transparent_55%)] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[min(100%,600px)] h-[min(100%,600px)] bg-[radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.1),transparent_50%)] pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center gap-4 mb-8">
          <img
            src="/logo-granja.png"
            alt="El Capataz"
            className="h-24 w-24 object-contain rounded-full shadow-xl shadow-black/30 ring-2 ring-capataz-mint/50 bg-capataz-mint-soft/10"
            width={96}
            height={96}
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">El Capataz</h1>
            <p className="text-sm text-capataz-mint/90 flex items-center justify-center gap-1 mt-1">
              <Leaf size={14} className="text-capataz-leaf-bright" />
              Manejo avícola
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-capataz-forest/80 bg-capataz-forest-light/90 backdrop-blur-md shadow-2xl shadow-black/40 p-8">
          <div className="flex rounded-xl bg-black/25 p-1 mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setMessage(null);
                setInviteCode('');
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-capataz-leaf text-capataz-forest-deep shadow-md'
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
                setInviteCode('');
                setFullName('');
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-capataz-leaf text-capataz-forest-deep shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Registro
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <>
                <div className="relative">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-capataz-mint/90 mb-1.5">
                    Código de invitación
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Ej: CAP-2026-ABC123"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-capataz-forest/50 bg-black/20 px-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-capataz-leaf/60 focus:border-capataz-leaf/40 font-mono tracking-wide"
                  />
                  <p className="mt-1.5 text-xs text-stone-500">
                    Si tu administrador te pasó un código, pegalo aquí. El rol lo define quien administra la
                    granja al generar el código (no hace falta el nombre de granja).
                  </p>
                </div>
                <div className="relative">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-capataz-mint/90 mb-1.5">
                    Tu nombre (opcional)
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej: Ana Gómez"
                    autoComplete="name"
                    className="w-full rounded-xl border border-capataz-forest/50 bg-black/20 px-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-capataz-leaf/60 focus:border-capataz-leaf/40"
                  />
                  <p className="mt-1.5 text-xs text-stone-500">
                    Se guarda en tu perfil de la granja para que el equipo te reconozca.
                  </p>
                </div>
                <div className="relative">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-capataz-mint/90 mb-1.5">
                    Nombre de la granja
                    {inviteCode.trim() ? (
                      <span className="normal-case font-normal text-stone-500"> (solo si creás una granja nueva)</span>
                    ) : null}
                  </label>
                  <div className="relative">
                    <Building2
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-capataz-leaf/80"
                      size={18}
                    />
                    <input
                      type="text"
                      value={farmName}
                      onChange={(e) => setFarmName(e.target.value)}
                      placeholder="Ej: Granja Los Robles"
                      disabled={Boolean(inviteCode.trim())}
                      className="w-full rounded-xl border border-capataz-forest/50 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-capataz-leaf/60 focus:border-capataz-leaf/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      autoComplete="organization"
                    />
                  </div>
                  {!inviteCode.trim() ? (
                    <p className="mt-1.5 text-xs text-stone-500 flex items-center gap-1">
                      <Sprout size={12} className="text-capataz-leaf" />
                      Se creará tu organización y quedará vinculada a tu cuenta (sos administrador).
                    </p>
                  ) : null}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-capataz-mint/90 mb-1.5">
                Correo
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-capataz-leaf/80" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-capataz-forest/50 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-capataz-leaf/60 focus:border-capataz-leaf/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-capataz-mint/90 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-capataz-leaf/80" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-capataz-forest/50 bg-black/20 pl-10 pr-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-capataz-leaf/60 focus:border-capataz-leaf/40"
                />
              </div>
            </div>

            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  message.type === 'ok'
                    ? 'bg-capataz-leaf/15 text-capataz-mint-soft border border-capataz-leaf/35'
                    : 'bg-red-950/50 text-red-200 border border-red-500/30'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-capataz-leaf hover:bg-capataz-leaf-bright disabled:opacity-60 disabled:cursor-not-allowed text-capataz-forest-deep font-bold shadow-lg shadow-black/25 transition-colors"
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
