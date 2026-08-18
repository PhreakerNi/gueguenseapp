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
  DriverVerificationStatus,
  DriverAccountStatus,
} from "@gueguense/types";
import { getSupabaseClient } from "../supabase";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  identity: IdentityContext | null;
  isLoading: boolean;
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

  const fetchIdentity = useCallback(
    async (currentUser: User): Promise<IdentityContext | null> => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("platform_role, full_name, phone, avatar_url")
          .eq("id", currentUser.id)
          .single();

        const { data: driverData } = await supabase
          .from("drivers")
          .select("verification_status, account_status")
          .eq("id", currentUser.id)
          .maybeSingle();

        const driver = driverData
          ? {
              verificationStatus:
                driverData.verification_status as DriverVerificationStatus,
              accountStatus: driverData.account_status as DriverAccountStatus,
            }
          : null;

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
          businessMemberships: [],
          driver,
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
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone ?? "",
        },
      },
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIdentity(null);
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "gueguense-driver://(auth)/reset-password",
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password,
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        identity,
        isLoading,
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
