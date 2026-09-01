import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";

interface AuthGuardProps {
  children?: ReactNode;
}

/**
 * AuthGuard — Proteção rigorosa de rotas administrativas.
 *
 * Tratamento de Vazamento:
 * Enquanto a sessão estiver em verificação (isLoading === true),
 * absolutamente nenhum componente filho (painel, agenda, dados de clientes)
 * é instanciado na árvore do React, bloqueando qualquer trigger de query
 * ao banco de dados Supabase antes da confirmação do token de autenticação.
 *
 * Se a verificação terminar e não houver usuário autenticado,
 * redireciona instantaneamente para /login preservando o destino original.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // 1. Tela de carregamento segura durante a verificação de token pelo Supabase
  if (isLoading) {
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
              Verificando autenticação
            </h3>
          </div>

          <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-xs">
            Validando suas credenciais de segurança antes de liberar o acesso à sua agenda.
          </p>
        </motion.div>
      </div>
    );
  }

  // 2. Não autenticado: Redireciona imediatamente para a tela de login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Autenticado com sucesso: Renderiza os componentes protegidos
  return <>{children}</>;
}
