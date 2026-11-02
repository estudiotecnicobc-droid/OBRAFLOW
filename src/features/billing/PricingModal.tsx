import React, { useState } from 'react';
import { X, CheckCircle2, Zap, Building2, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { billingService } from '../../../services/billingService';
import { PlanId, BillingCycle } from '../../../types';

// ── Definición de planes (solo copy y display prices — sin Stripe IDs) ─────────

interface PlanDisplay {
  id: PlanId;
  name: string;
  monthlyPrice: number | null;  // USD/mes — null = gratis
  yearlyMonthly: number | null; // USD/mes equivalente cuando se factura anual
  yearlyTotal: number | null;   // USD facturado una vez al año
  yearlyDiscount: number | null;// % de descuento vs monthly × 12
  tagline: string;
  badge?: string;
  features: string[];
  limits: string[];
}

const PLANS: PlanDisplay[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: null,
    yearlyMonthly: null,
    yearlyTotal: null,
    yearlyDiscount: null,
    tagline: 'Para empezar a gestionar tu primera obra',
    features: [
      'Presupuesto básico',
      'Dashboard de proyecto',
      'Planificación y recepción',
      'Control de calidad',
    ],
    limits: ['Hasta 3 proyectos', '1 usuario'],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 59,
    yearlyMonthly: 49,   // = $588/año
    yearlyTotal: 588,
    yearlyDiscount: 17,
    tagline: 'Para estudios y constructoras en crecimiento',
    badge: 'Más popular',
    features: [
      'Todo lo de Starter',
      'APUs Maestros',
      'Cómputo Paramétrico',
      'Reportes Centralizados',
      'Branding en reportes',
      'Sincronización automática',
    ],
    limits: ['Hasta 15 proyectos', 'Hasta 3 usuarios'],
  },
  {
    id: 'business',
    name: 'Business',
    monthlyPrice: 249,
    yearlyMonthly: 199, // = $2388/año
    yearlyTotal: 2388,
    yearlyDiscount: 20,
    tagline: 'Para empresas constructoras de alto volumen',
    features: [
      'Todo lo de Professional',
      'Proyectos ilimitados',
      'Comparación de costos',
      'Reportes avanzados',
      'Soporte prioritario',
    ],
    limits: ['Proyectos ilimitados', 'Hasta 10 usuarios'],
  },
];

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  currentPlan: PlanId;
  onClose: () => void;
}

export const PricingModal: React.FC<Props> = ({ currentPlan, onClose }) => {
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading]           = useState<PlanId | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const handleUpgrade = async (plan: PlanDisplay) => {
    if (plan.id === 'starter' || plan.id === currentPlan) return;
    if (!orgId) return;

    setLoading(plan.id);
    setError(null);
    try {
      // El frontend solo envía planId + billingCycle.
      // El backend resuelve el Stripe price ID desde la DB (subscription_plans).
      const url = await billingService.createCheckoutSession(orgId, plan.id, billingCycle);
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90dvh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Elige tu plan</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Cambia tu plan en cualquier momento. Sin contratos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toggle Monthly / Yearly */}
        <div className="flex justify-center pt-5 pb-1">
          <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar size={13} />
              Anual
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                -17%
              </span>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isLoading = loading === plan.id;
            const isPro     = plan.id === 'professional';
            const isBiz     = plan.id === 'business';
            const isPaid    = plan.monthlyPrice !== null;

            // Precios según ciclo
            const displayPrice = isPaid
              ? (billingCycle === 'yearly' ? plan.yearlyMonthly! : plan.monthlyPrice!)
              : null;
            const billingNote = isPaid && billingCycle === 'yearly'
              ? `facturado USD ${plan.yearlyTotal}/año`
              : null;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border-2 p-5 ${
                  isCurrent
                    ? 'bg-slate-50 border-slate-300'
                    : isPro
                      ? 'bg-blue-50/50 border-blue-500 shadow-md shadow-blue-100'
                      : isBiz
                        ? 'bg-violet-50/50 border-violet-500 shadow-md shadow-violet-100'
                        : 'bg-white border-slate-200'
                }`}
              >
                {/* Badge */}
                {plan.badge && !isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
                    Plan actual
                  </span>
                )}

                {/* Nombre y precio */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    {isPro && <Zap size={16} className="text-blue-600" />}
                    {isBiz && <Building2 size={16} className="text-violet-600" />}
                    <h3 className={`font-bold text-base ${isPro ? 'text-blue-700' : isBiz ? 'text-violet-700' : 'text-slate-700'}`}>
                      {plan.name}
                    </h3>
                    {isPaid && billingCycle === 'yearly' && plan.yearlyDiscount && (
                      <span className="ml-auto text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                        -{plan.yearlyDiscount}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 mb-0.5">
                    {displayPrice !== null ? (
                      <>
                        <span className="text-2xl font-black text-slate-900">
                          USD {displayPrice}
                        </span>
                        <span className="text-sm text-slate-400">/mes</span>
                      </>
                    ) : (
                      <span className="text-2xl font-black text-slate-900">Gratis</span>
                    )}
                  </div>

                  {billingNote && (
                    <p className="text-[11px] text-slate-400 mb-1">{billingNote}</p>
                  )}
                  <p className="text-xs text-slate-500 leading-snug">{plan.tagline}</p>
                </div>

                {/* Límites */}
                <div className="mb-3 space-y-1">
                  {plan.limits.map((l) => (
                    <p key={l} className="text-xs font-semibold text-slate-500">{l}</p>
                  ))}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-1.5 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2
                        size={14}
                        className={`mt-0.5 flex-shrink-0 ${
                          isPro ? 'text-blue-500' : isBiz ? 'text-violet-500' : 'text-slate-400'
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="text-center text-xs font-semibold text-slate-400 py-2.5">
                    Plan actual
                  </div>
                ) : plan.id === 'starter' ? (
                  <div className="text-center text-xs text-slate-400 py-2.5">
                    Plan gratuito
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={!!loading}
                    className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl transition-all disabled:opacity-60 ${
                      isPro
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
                        : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200'
                    }`}
                  >
                    {isLoading ? (
                      <><Loader2 size={15} className="animate-spin" /> Redirigiendo…</>
                    ) : (
                      <>Actualizar a {plan.name}</>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 text-center">
          <p className="text-xs text-slate-400">
            Pagos seguros con Stripe · Podés cancelar en cualquier momento · Sin costos ocultos
          </p>
        </div>
      </div>
    </div>
  );
};
