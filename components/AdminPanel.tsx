import React, { useEffect, useState } from 'react';
import { ShieldCheck, ChevronLeft, RefreshCw, AlertTriangle, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auditService, AuditEvent } from '../services/auditService';

interface AdminPanelProps {
  onBack: () => void;
}

const OP_COLORS: Record<string, string> = {
  INSERT: 'bg-green-50 text-green-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  MANUAL: 'bg-blue-50 text-blue-700',
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const { user, isMasterAdmin } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!isMasterAdmin) return;
    setLoading(true);
    const data = await auditService.listRecent(100);
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [isMasterAdmin]);

  if (!isMasterAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
        <AlertTriangle className="w-12 h-12 mb-4 text-amber-500" />
        <h2 className="text-xl font-bold text-slate-700 mb-2">Acceso Restringido</h2>
        <p className="text-sm mb-6">Solo los administradores del sistema pueden acceder a esta área.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 text-sm"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-slate-700 rounded transition-colors"
          title="Volver"
        >
          <ChevronLeft size={16} />
        </button>
        <ShieldCheck size={18} className="text-blue-400" />
        <h1 className="font-semibold text-base">Admin del Sistema</h1>
        <span className="text-[10px] bg-blue-700 text-blue-100 px-2 py-0.5 rounded-full font-bold">
          master_admin
        </span>
        <span className="text-slate-500 text-xs ml-1">{user?.email}</span>
        <button
          onClick={load}
          className="ml-auto p-1.5 hover:bg-slate-700 rounded transition-colors"
          title="Recargar"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Audit Log */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Activity size={15} className="text-slate-400" />
            <h2 className="font-semibold text-slate-700 text-sm">Registro de Auditoría — Catálogo Global</h2>
            <span className="ml-auto text-xs text-slate-400">{events.length} entradas</span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">Cargando…</div>
          ) : events.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              Sin registros de auditoría aún.<br />
              <span className="text-xs">Las modificaciones al catálogo global aparecerán aquí.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-4 py-2.5 text-left font-medium">Actor (ID)</th>
                    <th className="px-4 py-2.5 text-left font-medium">Operación</th>
                    <th className="px-4 py-2.5 text-left font-medium">Entidad</th>
                    <th className="px-4 py-2.5 text-left font-medium">Entity ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {events.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-400">
                        {e.actorId ? e.actorId.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${OP_COLORS[e.operation] ?? 'bg-slate-100 text-slate-600'}`}>
                          {e.operation}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{e.entity}</td>
                      <td className="px-4 py-2 font-mono text-slate-400">
                        {e.entityId?.slice(0, 8)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-5 py-3.5 text-xs text-blue-700">
          <strong>Nota de seguridad:</strong> Para promover un usuario a <code>master_admin</code>, ejecutar el SQL correspondiente directamente desde el Supabase Dashboard (ver <code>docs/how-to-promote-master-admin.md</code>). No existe auto-promoción desde la UI.
        </div>

      </div>
    </div>
  );
};
