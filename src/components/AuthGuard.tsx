import { useState, useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

interface AuthGuardProps {
  children?: ReactNode;
}

/**
 * AuthGuard — Proteção rigorosa de rotas administrativas.
 *
 * Tratamento de Vazamento e Blindagem por Perfil:
 * Enquanto a sessão estiver em verificação (isLoading === true ou isCheckingAdmin === true),
 * absolutamente nenhum componente filho (painel, agenda, dados de clientes)
 * é instanciado na árvore do React, bloqueando qualquer trigger de query
 * ao banco de dados Supabase antes da confirmação das credenciais.
 *
 * Se a verificação terminar e não houver usuário autenticado,
 * redireciona instantaneamente para /login preservando o destino original.
 *
 * Se o usuário for um paciente autenticado (sem registro em empresas),
 * bloqueia o acesso ao /admin e redireciona com aviso claro.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, signOut } = useAuth();
  const location = useLocation();
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function validarPerfilAdmin() {
      if (!user) {
        if (!cancelado) {
          setIsAdmin(false);
          setIsCheckingAdmin(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("empresas")
          .select("id")
          .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
          .maybeSingle();

        if (cancelado) return;

        if (error || !data) {
          console.warn("[AuthGuard] Usuário sem clínica associada tentou acessar /admin.");
          await signOut();
          setIsAdmin(false);
        } else {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error("[AuthGuard] Erro ao validar perfil de administrador:", err);
        if (!cancelado) setIsAdmin(false);
      } finally {
        if (!cancelado) setIsCheckingAdmin(false);
      }
    }

    if (!isLoading) {
      validarPerfilAdmin();
    }

    return () => {
      cancelado = true;
    };
  }, [user, isLoading, signOut]);

  // 1. Tela de carregamento segura durante a verificação de token e perfil administrativo
  if (isLoading || isCheckingAdmin) {
    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background px-4">
        {/* Glow de fundo sutil */}
        <div className="absolute w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 flex flex-col items-center text-center p-8 max-w-sm w-full"
        >
          {/* Ícone com pulso e spinner girando */}
          <div className="relative w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 shadow-soft">
            <ShieldCheck size={30} className="text-primary" />
            <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-ping opacity-25" />
          </div>

          <div className="flex items-center gap-2.5 mb-2">
            <Loader2 size={18} className="animate-spin text-primary shrink-0" />
            <h3 className="font-display font-bold text-lg text-foreground">
              Verificando permissões
            </h3>
          </div>

          <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-xs">
            Validando suas credenciais de gestor antes de liberar o acesso à sua agenda.
          </p>
        </motion.div>
      </div>
    );
  }

  // 2. Não autenticado ou Não é administrador: Redireciona para /login com mensagem explicativa
  if (!user || isAdmin === false) {
    return (
      <Navigate
        to="/login"
        state={{
          from: location,
          erro: !user
            ? undefined
            : "Esta conta não possui permissão administrativa. Apenas profissionais cadastrados podem acessar este painel.",
        }}
        replace
      />
    );
  }

  // 3. Autenticado como Administrador: Renderiza os componentes protegidos
  return <>{children}</>;
}
