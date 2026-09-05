import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  signInWithGoogle: (redirectPath?: string) => Promise<{ error: AuthError | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    // 1. Obtém a sessão inicial persistida no Supabase
    async function getInitialSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[Auth] Erro ao verificar sessão inicial:", error.message);
        }
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[Auth] Falha inesperada ao obter sessão:", err);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    getInitialSession();

    // 2. Escuta alterações em tempo real no estado de autenticação (login, logout, refresh de token)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Inicia o fluxo de autenticação com o Google via OAuth no Supabase.
   * Suporta tanto login de profissional (/admin) quanto agendamento de paciente (landing page).
   */
  const signInWithGoogle = async (redirectPath?: string): Promise<{ error: AuthError | null }> => {
    try {
      let redirectUrl = `${window.location.origin}/admin`;
      if (redirectPath) {
        redirectUrl = redirectPath.startsWith("http")
          ? redirectPath
          : `${window.location.origin}${redirectPath.startsWith("/") ? "" : "/"}${redirectPath}`;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      return { error };
    } catch (err) {
      return { error: err as AuthError };
    }
  };

  /**
   * Autentica com e-mail e senha no Supabase Auth.
   */
  const signInWithPassword = async (
    email: string,
    password: string
  ): Promise<{ error: AuthError | null }> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setIsLoading(false);
        return { error };
      }
      setUser(data.user);
      setSession(data.session);
      setIsLoading(false);
      return { error: null };
    } catch (err) {
      setIsLoading(false);
      return { error: err as AuthError };
    }
  };

  /**
   * Encerra a sessão do profissional.
   */
  const signOut = async (): Promise<{ error: AuthError | null }> => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();
      if (!error) {
        setUser(null);
        setSession(null);
      }
      setIsLoading(false);
      return { error };
    } catch (err) {
      setIsLoading(false);
      return { error: err as AuthError };
    }
  };

  const accessToken = session?.access_token ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken,
        isLoading,
        signInWithGoogle,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um <AuthProvider />");
  }
  return context;
}
