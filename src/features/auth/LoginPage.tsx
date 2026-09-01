import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ArrowLeft, AlertCircle, Sparkles } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useProfessional } from "../../store/useProfessional";

export default function LoginPage() {
  const { user, isLoading: authLoading, signInWithGoogle } = useAuth();
  const { profissional } = useProfessional();
  const navigate = useNavigate();
  const location = useLocation();

  const [iniciandoLogin, setIniciandoLogin] = useState(false);
  const [erroLogin, setErroLogin] = useState<string | null>(null);

  // Redireciona se o usuário já estiver autenticado
  useEffect(() => {
    if (!authLoading && user) {
      const destino = (location.state as any)?.from?.pathname || "/admin";
      navigate(destino, { replace: true });
    }
  }, [user, authLoading, navigate, location.state]);

  const handleLoginGoogle = async () => {
    setErroLogin(null);
    setIniciandoLogin(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setErroLogin(
          error.message ||
            "Não foi possível iniciar o login com o Google. Verifique a configuração do provedor no Supabase."
        );
        setIniciandoLogin(false);
      }
    } catch (err: any) {
      setErroLogin("Ocorreu uma falha ao conectar com o serviço do Google. Tente novamente.");
      setIniciandoLogin(false);
    }
  };

  const nomeClinica = profissional?.nomeClinica || "Plataforma de Agendamentos";
  const profissao = profissional?.profissao || "Profissional de Saúde";

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-center items-center p-4 sm:p-6 overflow-hidden">
      {/* Background Decorativo com Formas Orgânicas e Gradientes Suaves */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Botão de Retorno ao Início */}
      <div className="w-full max-w-md mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-body font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl hover:bg-secondary/60"
        >
          <ArrowLeft size={14} />
          Voltar para página de agendamentos
        </Link>
      </div>

      {/* Card Principal de Login */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-card/90 backdrop-blur-md rounded-3xl p-8 sm:p-10 shadow-floating border border-border/40 relative z-10"
      >
        {/* Topo: Ícone e Identidade */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4 shadow-soft border border-primary/20">
            <Shield size={26} className="stroke-[2.2]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-body font-bold uppercase tracking-wider mb-2.5">
            <Sparkles size={12} />
            Área Exclusiva do Profissional
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground tracking-tight">
            Bem-vindo de volta
          </h1>

          <p className="text-xs sm:text-sm font-body text-muted-foreground mt-2 leading-relaxed">
            Acesse seu painel para gerenciar consultas, configurar sua disponibilidade e acompanhar seus atendimentos em <strong className="text-foreground">{nomeClinica}</strong>.
          </p>
        </div>

        {/* Mensagem de Erro, se houver */}
        {erroLogin && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-body font-medium flex items-start gap-3"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span>{erroLogin}</span>
            </div>
          </motion.div>
        )}

        {/* Botão de Destaque Único: Entrar com Google */}
        <div className="space-y-4">
          <motion.button
            whileHover={iniciandoLogin ? {} : { scale: 1.02, y: -2 }}
            whileTap={iniciandoLogin ? {} : { scale: 0.98 }}
            onClick={handleLoginGoogle}
            disabled={iniciandoLogin}
            type="button"
            className="w-full flex items-center justify-center gap-3.5 py-4 px-5 rounded-2xl bg-white text-slate-700 hover:text-slate-900 font-body font-bold text-sm sm:text-base border border-slate-200/80 shadow-soft hover:shadow-soft-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {iniciandoLogin ? (
              <>
                <svg
                  className="animate-spin w-5 h-5 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>Conectando ao Google...</span>
              </>
            ) : (
              <>
                {/* Ícone Autêntico SVG do Google */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.37 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Entrar com Google</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Informações Adicionais / Selo de Segurança */}
        <div className="mt-8 pt-6 border-t border-border/20 text-center">
          <p className="text-[11px] font-body text-muted-foreground flex items-center justify-center gap-1.5">
            <Shield size={12} className="text-emerald-500" />
            Autenticação segura e criptografada via Supabase Auth
          </p>
        </div>
      </motion.div>

      {/* Rodapé institucional */}
      <footer className="mt-8 text-center text-xs font-body text-muted-foreground/80">
        <p>© {new Date().getFullYear()} {nomeClinica} • {profissao}</p>
      </footer>
    </div>
  );
}
