import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { HardHat, LogIn, UserPlus, AlertTriangle, Loader2, Building2, KeyRound, ChevronLeft, Mail } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'forgot';

interface Props {
  hasInvite?: boolean;
}

export const Login: React.FC<Props> = ({ hasInvite = false }) => {
  const { signIn, signUp, sendPasswordResetEmail } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const reset = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();

    if (mode === 'forgot') {
      if (!email.trim()) { setErrorMsg('Ingresá tu email.'); return; }
      setSubmitting(true);
      await sendPasswordResetEmail(email.trim());
      setSubmitting(false);
      // Always show neutral message — don't reveal whether account exists
      setSuccessMsg('Si existe una cuenta asociada a ese email, recibirás las instrucciones para recuperar tu contraseña.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Email y contraseña son obligatorios.');
      return;
    }
    if (mode === 'signup' && !hasInvite && !orgName.trim()) {
      setErrorMsg('El nombre de la empresa es obligatorio para registrarte.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) setErrorMsg(error);
      } else {
        const resolvedOrgName = hasInvite ? 'Mi organización' : orgName.trim();
        const { error } = await signUp(email.trim(), password, fullName.trim(), resolvedOrgName);
        if (error) {
          setErrorMsg(error);
        } else {
          setSuccessMsg(
            'Cuenta creada. Revisá tu email para confirmar tu cuenta antes de ingresar.',
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
          <div className="mx-auto bg-blue-600 w-16 h-16 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 mb-4">
            <HardHat size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Obraflow</h1>
          <p className="text-slate-500 text-sm mt-1">Plataforma de Gestión de Obras</p>
        </div>

        {/* ── Modo: Forgot password ─────────────────────────────────────── */}
        {mode === 'forgot' ? (
          <div className="p-8 space-y-4">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-2"
            >
              <ChevronLeft size={13} /> Volver al inicio de sesión
            </button>

            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700 text-sm">Recuperar contraseña</h2>
            </div>
            <p className="text-xs text-slate-500">
              Ingresá tu email y te enviaremos las instrucciones para crear una nueva contraseña.
            </p>

            {errorMsg && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                {successMsg}
              </div>
            )}

            {!successMsg && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 size={16} className="animate-spin" /> Enviando…</>
                    : <><Mail size={16} /> Enviar instrucciones</>
                  }
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ── Modos: signin / signup ──────────────────────────────────── */
          <>
            {/* Toggle signin / signup */}
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'signin' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <LogIn size={15} /> Ingresar
                </span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'signup' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <UserPlus size={15} /> Registrarse
                </span>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-4">

              {/* Banner invitación */}
              {hasInvite && (
                <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <Building2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>Fuiste invitado a una organización. Ingresá o creá una cuenta para aceptar la invitación.</span>
                </div>
              )}

              {/* Mensajes */}
              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                  {successMsg}
                </div>
              )}

              {/* Nombre completo (solo signup) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Juan García"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="name"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  required
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete="email"
                />
              </div>

              {/* Contraseña */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase">
                    Contraseña
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[11px] text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
                  required
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>

              {/* Nombre empresa (solo signup sin invitación) */}
              {mode === 'signup' && !hasInvite && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Nombre de tu empresa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="Constructora González S.A."
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Se creará tu organización automáticamente. Podrás invitar colaboradores después.
                  </p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Procesando…</>
                  : mode === 'signin'
                    ? <><LogIn size={16} /> Ingresar</>
                    : <><UserPlus size={16} /> Crear cuenta</>
                }
              </button>
            </form>
          </>
        )}

        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">
            Acceso seguro con Supabase Auth · Multitenant
          </p>
        </div>
      </div>
    </div>
  );
};
