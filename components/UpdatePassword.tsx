import React, { useState } from 'react';
import { HardHat, KeyRound, CheckCircle, AlertTriangle, Loader2, LogIn } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface Props {
  onDone: () => Promise<void>;
}

export const UpdatePassword: React.FC<Props> = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validate = (): string | null => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validationError = validate();
    if (validationError) { setErrorMsg(validationError); return; }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErrorMsg('No se pudo actualizar la contraseña. El enlace puede haber expirado. Solicitá uno nuevo desde el login.');
      return;
    }
    setDone(true);
  };

  const handleBackToLogin = async () => {
    await onDone(); // signs out → app returns to login screen
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
          <p className="text-slate-500 text-sm mt-1">Nueva contraseña</p>
        </div>

        <div className="p-8">
          {done ? (
            /* ── Éxito ── */
            <div className="text-center space-y-5">
              <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">
                  Contraseña actualizada
                </h2>
                <p className="text-sm text-slate-500">
                  Ya podés iniciar sesión con tu nueva contraseña.
                </p>
              </div>
              <button
                onClick={handleBackToLogin}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <LogIn size={16} /> Ir al login
              </button>
            </div>
          ) : (
            /* ── Formulario ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={16} className="text-slate-400" />
                <p className="text-sm text-slate-600">Ingresá tu nueva contraseña.</p>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Repetir contraseña
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                  : <><KeyRound size={16} /> Guardar nueva contraseña</>
                }
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
