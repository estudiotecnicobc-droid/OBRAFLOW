import React, { useState } from 'react';
import { CreditCard, Users, FolderKanban, Zap, AlertTriangle, CheckCircle2, Clock, ArrowUpCircle, Loader2 } from 'lucide-react';
import { usePlan } from '../../../hooks/usePlan';
import { billingService } from '../../../services/billingService';
import { useAuth } from '../../../context/AuthContext';
import { PricingModal } from './PricingModal';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  starter:      'Starter',
  professional: 'Professional',
  business:     'Business',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  trialing:  { label: 'Período de prueba',    color: 'bg-amber-100 text-amber-800 border-amber-200',  icon: <Clock size={12} /> },
  active:    { label: 'Activo',               color: 'bg-green-100 text-green-800 border-green-200',  icon: <CheckCircle2 size={12} /> },
  past_due:  { label: 'Pago pendiente',       color: 'bg-red-100 text-red-800 border-red-200',        icon: <AlertTriangle size={12} /> },
  canceled:  { label: 'Cancelado',            color: 'bg-slate-100 text-slate-600 border-slate-200',  icon: <AlertTriangle size={12} /> },
  unpaid:    { label: 'Sin pago',             color: 'bg-red-100 text-red-800 border-red-200',        icon: <AlertTriangle size={12} /> },
  paused:    { label: 'Pausado',              color: 'bg-slate-100 text-slate-600 border-slate-200',  icon: <Clock size={12} /> },
};

function UsageBar({ used, limit, label, icon }: {
  used: number;
  limit: number;
  label: string;
  icon: React.ReactNode;
}) {
  const unlimited = limit === 0;
  const pct = unlimited ? 0 : Math.min(100, (used / limit) * 100);
  const critical = !unlimited && pct >= 90;
  const warning  = !unlimited && pct >= 70 && pct < 90;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-slate-500">{icon}</span>
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="ml-auto text-sm font-bold text-slate-800">
          {unlimited ? (
            <span className="text-green-600">Ilimitado</span>
          ) : (
            <span className={critical ? 'text-red-600' : warning ? 'text-amber-600' : 'text-slate-700'}>
              {used} / {limit}
            </span>
          )}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              critical ? 'bg-red-500' : warning ? 'bg-amber-400' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BillingPanel() {
  const {
    planId, status, isActive, trialDaysLeft,
    getLimit, usageProjects, usageMembers, canAddProject, canAddMember,
    loading,
  } = usePlan();
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const [showPricing, setShowPricing]    = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError]    = useState<string | null>(null);

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['active'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const maxProjects = getLimit('max_projects');
  const maxMembers  = getLimit('max_members');

  return (
    <>
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={20} className="text-blue-600" />
            Suscripción
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestiona tu plan y uso de la organización
          </p>
        </div>
      </div>

      {/* ── Plan actual ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Plan actual
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {PLAN_LABELS[planId] ?? planId}
            </p>
          </div>
          <div className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-full ${statusCfg.color}`}>
            {statusCfg.icon}
            {statusCfg.label}
          </div>
        </div>

        {/* Trial banner */}
        {status === 'trialing' && trialDaysLeft !== null && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-amber-800">
                {trialDaysLeft > 0
                  ? `Te quedan ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''} de prueba`
                  : 'Tu período de prueba ha finalizado'}
              </span>
              <span className="text-xs text-amber-600">
                {trialDaysLeft} / 14 días
              </span>
            </div>
            <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${Math.max(0, 100 - (trialDaysLeft / 14) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Past due warning */}
        {status === 'past_due' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">
              Hay un problema con tu método de pago. Actualízalo para mantener el acceso.
            </p>
          </div>
        )}
      </div>

      {/* ── Uso ────────────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">
          Uso actual
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UsageBar
            used={usageProjects}
            limit={maxProjects}
            label="Proyectos"
            icon={<FolderKanban size={16} />}
          />
          <UsageBar
            used={usageMembers}
            limit={maxMembers}
            label="Miembros del equipo"
            icon={<Users size={16} />}
          />
        </div>
        {(!canAddProject || !canAddMember) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Has alcanzado el límite de tu plan. Actualiza para continuar creciendo.
          </p>
        )}
      </div>

      {/* ── Acciones ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {planId !== 'business' && (
          <button
            className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-3 rounded-xl transition-colors shadow-sm"
            onClick={() => setShowPricing(true)}
          >
            <ArrowUpCircle size={18} />
            {planId === 'starter' ? 'Actualizar a Professional' : 'Actualizar a Business'}
          </button>
        )}
        <button
          disabled={portalLoading}
          className="flex-1 inline-flex items-center justify-center gap-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-bold px-5 py-3 rounded-xl transition-colors disabled:opacity-60"
          onClick={async () => {
            if (!orgId) return;
            setPortalLoading(true);
            setPortalError(null);
            try {
              const url = await billingService.openCustomerPortal(orgId);
              window.location.href = url;
            } catch (err) {
              setPortalError((err as Error).message);
              setPortalLoading(false);
            }
          }}
        >
          {portalLoading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          Gestionar Facturación
        </button>
      </div>

      {/* Error portal */}
      {portalError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {portalError}
        </p>
      )}
    </div>

    {/* Modal de precios */}
    {showPricing && (
      <PricingModal
        currentPlan={planId}
        onClose={() => setShowPricing(false)}
      />
    )}
    </>
  );
}
