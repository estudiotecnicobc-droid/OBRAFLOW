import { supabase } from './supabaseClient';
import { Profile, Organization, OrganizationMember, OrgRole, SystemRole } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function profileFromRow(row: Record<string, any>): Profile {
  return {
    id: row.id,
    fullName: row.full_name ?? undefined,
    email: row.email ?? undefined,
    defaultOrganizationId: row.default_organization_id ?? undefined,
    createdAt: row.created_at,
    systemRole: (row.system_role as SystemRole) ?? 'user',
  };
}

function orgFromRow(row: Record<string, any>): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    createdAt: row.created_at,
  };
}

function memberFromRow(row: Record<string, any>): OrganizationMember {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: (row.role as OrgRole) ?? 'viewer',
    organization: row.organizations ? orgFromRow(row.organizations) : undefined,
  };
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const authService = {

  /** Lee el perfil del usuario desde public.profiles */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[authService.getProfile]', error.message);
      return null;
    }
    return data ? profileFromRow(data) : null;
  },

  /**
   * Lee las membresías del usuario con join a organizations.
   * Devuelve [] si no tiene ninguna.
   */
  async getMemberships(userId: string): Promise<OrganizationMember[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', userId);
    if (error) {
      console.error('[authService.getMemberships]', error.message);
      return [];
    }
    return (data ?? []).map(memberFromRow);
  },

  /**
   * Lista todos los miembros de la organización con nombre y email.
   * Hace dos queries: members + profiles (evita ambigüedad de FK con auth.users).
   */
  async listOrgMembers(organizationId: string): Promise<OrganizationMember[]> {
    const { data: membersData, error: membersError } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('organization_id', organizationId)
      .order('role', { ascending: true });

    if (membersError) {
      console.error('[authService.listOrgMembers]', membersError.message);
      return [];
    }

    const members = membersData ?? [];
    if (members.length === 0) return [];

    // Enriquecer con email y nombre desde profiles
    const userIds = members.map((m) => m.user_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

    return members.map((row) => {
      const prof = profileMap.get(row.user_id);
      return {
        ...memberFromRow(row),
        fullName: prof?.full_name ?? undefined,
        email: prof?.email ?? undefined,
      };
    });
  },

  /**
   * Cambia el rol de un miembro.
   * La política RLS solo permite esta operación a owner/admin de la misma org.
   * No permite cambiar el rol del owner (guardado también en la UI).
   */
  async updateMemberRole(memberId: string, newRole: OrgRole): Promise<void> {
    const { error } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId);
    if (error) throw new Error(`[authService.updateMemberRole] ${error.message}`);
  },

  /**
   * Bootstrap para un usuario recién registrado vía RPC server-side.
   * La función SQL public.bootstrap_organization corre con SECURITY DEFINER
   * y esquiva las políticas RLS del cliente.
   *
   * Parámetros de la RPC:
   *   org_name       TEXT  — nombre de la organización
   *   org_slug       TEXT  — slug derivado del nombre (lowercase, guiones)
   *   user_full_name TEXT  — nombre completo del usuario
   *
   * La función crea: organization + profile + organization_members con role = 'owner'.
   * auth.uid() se resuelve internamente desde el JWT de la sesión activa.
   */
  async bootstrapNewUser(
    _userId: string,    // mantenido para compatibilidad de firma; la RPC usa auth.uid()
    email: string,
    fullName: string,
    orgName: string,
  ): Promise<void> {
    const slug = orgName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const { error } = await supabase.rpc('bootstrap_organization', {
      org_name: orgName,
      org_slug: slug,
      user_full_name: fullName || email,
    });

    if (error) throw new Error(`[bootstrap] ${error.message}`);
  },
};
