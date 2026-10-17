import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { authService } from '../services/authSupabaseService';
import { User, Role, OrgRole, Profile, Organization, OrganizationMember, SystemRole } from '../types';

// ─── Tipos del contexto ───────────────────────────────────────────────────────

interface AuthContextType {
  // Estado principal
  user: User | null;             // compatible con el resto de la app
  session: Session | null;
  loading: boolean;

  // Organización activa
  activeOrganizationId: string;  // UUID real de Supabase
  activeOrganization: Organization | null;
  memberships: OrganizationMember[];

  // Acciones
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    orgName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveOrganization: (organizationId: string) => void;

  // Alias de compatibilidad con el código existente
  logout: () => Promise<void>;
  hasPermission: (requiredRoles: Role[]) => boolean;

  // Recarga membresías y perfil (útil tras aceptar una invitación)
  reloadUserData: () => Promise<void>;

  // System-level role (independent of org)
  isMasterAdmin: boolean;

  // Password recovery flow
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<{ error: string | null }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mapea OrgRole (DB) → Role (app).
 * owner/admin → admin | editor → project_manager | viewer → client
 */
function orgRoleToAppRole(orgRole: OrgRole): Role {
  if (orgRole === 'owner' || orgRole === 'admin') return 'admin';
  if (orgRole === 'editor') return 'project_manager';
  return 'client';
}

/**
 * Construye el objeto User compatible con el resto de la app.
 * El rol se deriva de la membresía activa (organization_members.role),
 * ya que public.profiles no tiene columna role.
 */
function buildUser(
  session: Session,
  profile: Profile | null,
  activeOrgId: string,
  memberships: OrganizationMember[],
): User {
  const activeMembership = memberships.find(m => m.organizationId === activeOrgId);
  const role: Role = activeMembership ? orgRoleToAppRole(activeMembership.role) : 'worker';
  const systemRole: SystemRole = profile?.systemRole ?? 'user';
  return {
    id: session.user.id,
    name: profile?.fullName ?? session.user.email ?? 'Usuario',
    email: session.user.email ?? '',
    role,
    organizationId: activeOrgId,
    systemRole,
  };
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  // Early detection from URL hash so the recovery screen shows without a flash
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

  // ── Cargar perfil y membresías cuando cambia la sesión ────────────────────
  const loadUserData = async (s: Session) => {
    const [fetchedProfile, fetchedMemberships] = await Promise.all([
      authService.getProfile(s.user.id),
      authService.getMemberships(s.user.id),
    ]);

    setProfile(fetchedProfile);
    setMemberships(fetchedMemberships);

    // Resolver org activa: default_organization_id > primera membresía > ''
    const resolvedOrgId =
      fetchedProfile?.defaultOrganizationId ??
      fetchedMemberships[0]?.organizationId ??
      '';
    setActiveOrganizationId(resolvedOrgId);
  };

  // ── Escuchar cambios de sesión (onAuthStateChange) ────────────────────────
  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        loadUserData(s).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Suscripción a cambios futuros
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (event === 'PASSWORD_RECOVERY') {
          // Recovery token processed: show update-password screen immediately
          setIsPasswordRecovery(true);
          setSession(s);
          setLoading(false);
          return;
        }
        setSession(s);
        if (s) {
          loadUserData(s);
        } else {
          // Sign out
          setProfile(null);
          setMemberships([]);
          setActiveOrganizationId('');
          setIsPasswordRecovery(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derivar user compatible con el resto de la app ────────────────────────
  const user: User | null =
    session && activeOrganizationId
      ? buildUser(session, profile, activeOrganizationId, memberships)
      : null;

  // ── Organización activa (objeto completo) ─────────────────────────────────
  const activeOrganization: Organization | null =
    memberships.find(m => m.organizationId === activeOrganizationId)?.organization ?? null;

  // ── Acciones ──────────────────────────────────────────────────────────────

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    orgName: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'No se pudo crear el usuario.' };

    try {
      await authService.bootstrapNewUser(data.user.id, email, fullName, orgName);
      // onAuthStateChange no re-dispara porque la sesión no cambió —
      // recargamos manualmente para que memberships y activeOrganizationId queden bien.
      const currentSession = (await supabase.auth.getSession()).data.session;
      if (currentSession) await loadUserData(currentSession);
    } catch (e: any) {
      return { error: e.message ?? 'Error al configurar la organización.' };
    }
    return { error: null };
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  const setActiveOrganization = (organizationId: string) => {
    setActiveOrganizationId(organizationId);
  };

  const reloadUserData = async (): Promise<void> => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s) await loadUserData(s);
  };

  // Aliases de compatibilidad
  const logout = signOut;

  const hasPermission = (requiredRoles: Role[]): boolean => {
    if (!user) return false;
    return requiredRoles.includes(user.role);
  };

  const isMasterAdmin = user?.systemRole === 'master_admin';

  const clearPasswordRecovery = async (): Promise<void> => {
    setIsPasswordRecovery(false);
    await supabase.auth.signOut();
  };

  const sendPasswordResetEmail = async (email: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        activeOrganizationId,
        activeOrganization,
        memberships,
        signIn,
        signUp,
        signOut,
        setActiveOrganization,
        logout,
        hasPermission,
        reloadUserData,
        isMasterAdmin,
        isPasswordRecovery,
        clearPasswordRecovery,
        sendPasswordResetEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
