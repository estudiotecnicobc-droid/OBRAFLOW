import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Copy, Check, Trash2, X, Link } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authSupabaseService';
import { invitationsService, Invitation } from '../services/invitationsService';
import { OrganizationMember, OrgRole } from '../types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<OrgRole, string> = {
  owner:  'Propietario',
  admin:  'Administrador',
  editor: 'Editor',
  viewer: 'Observador',
};

const ROLE_BADGE: Record<OrgRole, string> = {
  owner:  'bg-amber-100 text-amber-800',
  admin:  'bg-blue-100 text-blue-800',
  editor: 'bg-green-100 text-green-800',
  viewer: 'bg-slate-100 text-slate-600',
};

// Roles que un admin/owner puede asignar (el owner nunca se cambia desde la UI)
const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'editor', 'viewer'];

// ─── Componente ───────────────────────────────────────────────────────────────

export const UsersPanel: React.FC = () => {
  const { activeOrganizationId, user } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);  // id del miembro que se está guardando
  const [error, setError] = useState<string | null>(null);

  // Invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState<OrgRole>('editor');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // user.role === 'admin' en la app mapea a owner|admin en DB (ver orgRoleToAppRole)
  const canManage = user?.role === 'admin';

  useEffect(() => {
    if (!activeOrganizationId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      authService.listOrgMembers(activeOrganizationId),
      canManage ? invitationsService.listForOrg(activeOrganizationId) : Promise.resolve([]),
    ])
      .then(([fetchedMembers, fetchedInvitations]) => {
        setMembers(fetchedMembers);
        setPendingInvitations(fetchedInvitations);
      })
      .catch(() => setError('No se pudo cargar la lista de miembros.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganizationId]);

  const handleRoleChange = async (member: OrganizationMember, newRole: OrgRole) => {
    if (member.role === 'owner') return; // el propietario no se modifica
    setSaving(member.id);
    setError(null);
    try {
      await authService.updateMemberRole(member.id, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
      );
    } catch (e: any) {
      setError(e.message ?? 'Error al actualizar el rol.');
    } finally {
      setSaving(null);
    }
  };

  const handleOpenInviteModal = () => {
    setGeneratedLink(null);
    setInviteEmail('');
    setInviteRole('editor');
    setShowInviteModal(true);
  };

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    try {
      const inv = await invitationsService.create(
        activeOrganizationId,
        inviteRole,
        inviteEmail.trim() || undefined,
      );
      const link = `${window.location.origin}${window.location.pathname}?invite=${inv.token}`;
      setGeneratedLink(link);
      setPendingInvitations(prev => [inv, ...prev]);
    } catch (e: any) {
      setError(e.message ?? 'Error al crear la invitación.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRevoke = async (invId: string) => {
    setRevoking(invId);
    try {
      await invitationsService.remove(invId);
      setPendingInvitations(prev => prev.filter(i => i.id !== invId));
    } catch {
      // silencio; la lista no se actualiza
    } finally {
      setRevoking(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        Cargando miembros…
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Users size={15} />
          <span>{members.length} miembro{members.length !== 1 ? 's' : ''}</span>
          {!canManage && (
            <span className="ml-2 text-xs text-slate-400">
              (solo owner y admin pueden cambiar roles)
            </span>
          )}
        </div>
        {canManage && (
          <button
            onClick={handleOpenInviteModal}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={14} />
            Invitar miembro
          </button>
        )}
      </div>

      {/* Members table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Rol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const isOwner = m.role === 'owner';
              const isSaving = saving === m.id;

              return (
                <tr key={m.id} className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {m.fullName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {m.email ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {canManage && !isOwner ? (
                      <select
                        value={m.role}
                        disabled={isSaving}
                        onChange={(e) => handleRoleChange(m, e.target.value as OrgRole)}
                        className="text-sm border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 cursor-pointer"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[m.role]}`}
                      >
                        {ROLE_LABELS[m.role]}
                      </span>
                    )}
                    {isSaving && (
                      <span className="ml-2 text-xs text-slate-400">Guardando…</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No hay miembros en esta organización.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending invitations */}
      {canManage && pendingInvitations.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Invitaciones pendientes
          </h4>
          <div className="space-y-2">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Link size={14} className="text-slate-400" />
                  <div>
                    <span className="font-medium text-slate-700">
                      {ROLE_LABELS[inv.role]}
                    </span>
                    {inv.invitedEmail && (
                      <span className="ml-2 text-slate-400">— {inv.invitedEmail}</span>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      Expira {new Date(inv.expiresAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revoking === inv.id}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                  title="Revocar invitación"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Invitar miembro</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Role select */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Rol
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                  disabled={!!generatedLink}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {/* Optional email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email del invitado <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={!!generatedLink}
                  placeholder="ej: usuario@empresa.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
                />
              </div>

              {/* Generated link */}
              {generatedLink && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-2">Link generado (válido 7 días):</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={generatedLink}
                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-600 truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                        copied
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                {generatedLink ? 'Cerrar' : 'Cancelar'}
              </button>
              {!generatedLink && (
                <button
                  onClick={handleCreateInvite}
                  disabled={creatingInvite}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {creatingInvite ? 'Generando…' : 'Generar link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
