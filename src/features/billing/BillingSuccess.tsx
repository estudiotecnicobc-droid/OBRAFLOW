import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ArrowRight, RefreshCw, Clock } from 'lucide-react';
import { usePlan } from '../../../hooks/usePlan';

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_RETRIES  = 5;
const RETRY_DELAY  = 3_000; // ms

const PLAN_LABELS: Record<string, string> = {
  starter:      'Starter',
  professional: 'Professional',
  business:     'Business',
};

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  /** Llamado cuando el usuario decide ir al panel */
  onDone: () => void;
}

/**
 * Pantalla post-Stripe Checkout.
 *
 * IMPORTANTE: la activación REAL del plan depende exclusivamente de:
 *   1. Stripe dispara el webhook `checkout.session.completed`
 *   2. billing-webhook actualiza `organization_subscriptions`
 *   3. usePlan.refetch() lee el nuevo status desde la DB
 *
 * El URL param `billing_status=success` solo confirma que Stripe procesó el pago
 * y redirigió al usuario. No activa nada en nuestra DB.
 * Esta pantalla detecta el cambio via polling de usePlan hasta que la
 * suscripción se refleja, o muestra un mensaje de espera si tarda.
 */
export const BillingSuccess: React.FC<Props> = ({ onDone }) => {
  const { planId, status, loading, refetch } = usePlan();

  const retriesRef        = useRef(0);
  const initialPlanRef    = useRef(planId);   // plan ANTES de que el webhook firme
  const [retrying, setRetrying]   = useState(false);
  const [planActivated, setPlanActivated] = useState(false);
  const [gaveUp, setGaveUp]       = useState(false);

  // Detectar si el plan cambió desde cuando montamos la pantalla
  useEffect(() => {
    if (status === 'active' && planId !== initialPlanRef.current) {
      // El webhook ya actualizó la DB y usePlan refleja el nuevo plan
      setPlanActivated(true);
    }
  }, [planId, status]);

  // Auto-retry para detectar la activación del webhook
  useEffect(() => {
    // Si ya está activado o loading, no hacer nada
    if (planActivated || loading) return;

    const scheduleRetry = () => {
      if (retriesRef.current >= MAX_RETRIES) {
        setGaveUp(true);
        return;
      }
      const timer = setTimeout(async () => {
        retriesRef.current += 1;
        setRetrying(true);
        await refetch();
        setRetrying(false);
        scheduleRetry();
      }, RETRY_DELAY);
      return timer;
    };

    // Primer refetch inmediato al montar
    refetch();
    const timer = scheduleRetry();
    return () => { if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo en mount

  const handleManualRetry = () => {
    retriesRef.current = 0;
    setGaveUp(false);
    setRetrying(true);
    refetch();
    setTimeout(() => setRetrying(false), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-10 text-center">

        {/* Icono */}
        <div className={`flex items-center justify-center w-20 h-20 rounded-full mx-auto mb-6 ${
          planActivated ? 'bg-green-100' : 'bg-amber-50'
        }`}>
          {planActivated
            ? <CheckCircle2 size={40} className="text-green-600" />
            : <Clock size={40} className="text-amber-500" />
          }
        </div>

        {/* Estado */}
        {planActivated ? (
          <>
            <h2 className="text-2xl font-black text-slate-800 mb-2">
              ¡Suscripción activada!
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-2">
              Tu pago fue procesado y el plan fue actualizado.
            </p>
            <p className="text-sm font-semibold text-blue-600 mb-8">
              Plan {PLAN_LABELS[planId] ?? planId} activo
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-slate-800 mb-2">
              Pago procesado
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-2">
              Stripe confirmó el pago. Estamos esperando la activación del plan en nuestra base de datos
              (esto puede tardar unos segundos).
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-8">
              {retrying
                ? <><RefreshCw size={14} className="animate-spin" /> Verificando…</>
                : gaveUp
                  ? <><Clock size={14} /> La activación puede tardar hasta 1 minuto</>
                  : <><Clock size={14} /> Verificando activación ({retriesRef.current}/{MAX_RETRIES})</>
              }
            </div>
          </>
        )}

        {/* Nota arquitectónica: la activación es solo via webhook */}
        {!planActivated && gaveUp && (
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Si el plan no se actualiza, recargá la página en 1 minuto.
            La activación ocurre cuando nuestro servidor recibe la confirmación de Stripe.
          </p>
        )}

        {/* Botones */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onDone}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-sm"
          >
            Ir a mi panel
            <ArrowRight size={16} />
          </button>

          {!planActivated && (
            <button
              onClick={handleManualRetry}
              disabled={retrying}
              className="inline-flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
              Verificar estado manualmente
            </button>
          )}
        </div>

        {/* Stripe receipt note */}
        <p className="text-xs text-slate-400 mt-6">
          Recibirás un recibo por email desde Stripe.
        </p>
      </div>
    </div>
  );
};
