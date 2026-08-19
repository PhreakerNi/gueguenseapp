import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type {
  IdentityContext,
  PlatformRole,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessAccountStatus,
} from "@gueguense/types";
import { normalizeAuthError, getAuthErrorMessage } from "@gueguense/domain";
import { getSupabaseClient } from "../supabase";

type RawMembership = {
  id: string;
  business_id: string;
  role: string;
  status: string;
  businesses: { account_status: string } | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  identity: IdentityContext | null;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  setRecoveryContext: (isRecovery: boolean) => void;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  refreshIdentity: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const fetchIdentity = useCallback(
    async (currentUser: User): Promise<IdentityContext | null> => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("platform_role, full_name, phone, avatar_url")
          .eq("id", currentUser.id)
          .single();

        const { data: rawMemberships } = await supabase
          .from("business_members")
          .select("id, business_id, role, status, businesses (account_status)")
          .eq("user_id", currentUser.id);

        const typedMemberships = (rawMemberships ??
          []) as unknown as RawMembership[];

        const businessMemberships = typedMemberships.map((m) => ({
          membershipId: m.id,
          businessId: m.business_id,
          role: m.role as BusinessMemberRole,
          status: m.status as BusinessMemberStatus,
          businessAccountStatus: m.businesses?.account_status as
            | BusinessAccountStatus
            | undefined,
        }));

        return {
          userId: currentUser.id,
          email: currentUser.email ?? null,
          profile: {
            platformRole:
              (profile?.platform_role as PlatformRole) ??
              ("none" as PlatformRole),
            fullName: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            avatarUrl: profile?.avatar_url ?? null,
          },
          businessMemberships,
          driver: null,
        };
      } catch {
        return null;
      }
    },
    [supabase],
  );

  const refreshIdentity = useCallback(async () => {
    if (user) {
      const idContext = await fetchIdentity(user);
      setIdentity(idContext);
    }
  }, [user, fetchIdentity]);

  const setRecoveryContext = useCallback((isRecovery: boolean) => {
    setIsPasswordRecovery(isRecovery);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session: currentSession } }) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) {
          const idContext = await fetchIdentity(currentSession.user);
          setIdentity(idContext);
        }
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }
      if (newSession?.user) {
        const idContext = await fetchIdentity(newSession.user);
        setIdentity(idContext);
      } else {
        setIdentity(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchIdentity]);

  const signIn = async (email: string, password: string) => {
    try {
      setIsPasswordRecovery(false);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        return { error: getAuthErrorMessage(normalizeAuthError(error)) };
      }
      setIsPasswordRecovery(false);
      return { error: null };
    } catch (err) {
      return { error: getAuthErrorMessage(normalizeAuthError(err)) };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ) => {
    try {
      setIsPasswordRecovery(false);
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: "gueguense-business://auth/callback",
          data: {
            full_name: fullName.trim(),
            phone: phone ? phone.trim() : "",
          },
        },
      });
      if (error) {
        return { error: getAuthErrorMessage(normalizeAuthError(error)) };
      }
      return { error: null };
    } catch (err) {
      return { error: getAuthErrorMessage(normalizeAuthError(err)) };
    }
  };

  const signOut = async () => {
    try {
      setIsPasswordRecovery(false);
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      setIdentity(null);
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo:
            "gueguense-business://auth/callback?next=/reset-password&type=recovery",
        },
      );
      if (error) {
        return { error: getAuthErrorMessage(normalizeAuthError(error)) };
      }
      return { error: null };
    } catch (err) {
      return { error: getAuthErrorMessage(normalizeAuthError(err)) };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });
      if (error) {
        return { error: getAuthErrorMessage(normalizeAuthError(error)) };
      }
      setIsPasswordRecovery(false);
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setIdentity(null);
      return { error: null };
    } catch (err) {
      return { error: getAuthErrorMessage(normalizeAuthError(err)) };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        identity,
        isLoading,
        isPasswordRecovery,
        setRecoveryContext,
        signIn,
        signUp,
        signOut,
        sendPasswordReset,
        updatePassword,
        refreshIdentity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
