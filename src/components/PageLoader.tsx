import { Loader2, AlertTriangle, RefreshCw, Compass, Home, LogIn } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useProfessional } from "../store/useProfessional";

interface PageLoaderProps {
  /** Conteúdo a renderizar quando os dados estão prontos */
  children: React.ReactNode;
}

export function PageLoader({ children }: PageLoaderProps) {
  const { profissional, isLoading, error, refetch } = useProfessional();
  const navigate = useNavigate();

  // ── Carregando ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-soft">
          <Loader2 size={32} className="text-primary animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="font-display font-bold text-foreground text-lg">Carregando...</p>
          <p className="font-body text-sm text-muted-foreground">
            Buscando dados da clínica e serviços disponíveis
          </p>
        </div>
      </div>
    );
  }

  // ── 404: Profissional / Empresa Não Encontrada ──────────────────
  const isNotFound =
    (error && (error.includes("NOT_FOUND") || error.includes("não encontrada") || error.includes("reservada"))) ||
    (!error && !profissional);

  if (isNotFound) {
    const mensagemExibida = error?.replace(/^NOT_FOUND:\s*/, "") ||
      "O endereço acessado não corresponde a nenhuma clínica ou profissional ativo no momento.";

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center min-h-[70vh]">
        <div className="w-full max-w-md bg-card/80 backdrop-blur-md rounded-3xl p-8 border border-border shadow-floating flex flex-col items-center">
          <div className="w-20 h-20 rounded-3xl bg-secondary/80 border border-border flex items-center justify-center text-muted-foreground mb-5 shadow-inner">
            <Compass size={40} className="text-primary animate-pulse" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-body font-bold mb-3">
            404 • Página não encontrada
          </div>

          <h2 className="text-2xl font-display font-extrabold text-foreground tracking-tight mb-2">
            Profissional não encontrado
          </h2>

          <p className="font-body text-sm text-muted-foreground mb-6 leading-relaxed">
            {mensagemExibida}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                navigate("/");
                window.location.href = "/";
              }}
              className="flex-1 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home size={15} />
              <span>Página Inicial</span>
            </button>

            <Link
              to="/login"
              className="flex-1 w-full py-3 px-4 rounded-xl border border-border bg-background/80 hover:bg-secondary/60 text-foreground font-body font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <LogIn size={15} />
              <span>Painel Profissional</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Erro Geral de Conexão ou Servidor ───────────────────────────
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <AlertTriangle size={32} className="text-destructive" />
        </div>
        <div className="space-y-1 max-w-sm">
          <p className="font-display font-bold text-foreground text-lg">
            Erro ao carregar dados
          </p>
          <p className="font-body text-sm text-muted-foreground">
            {error}
          </p>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-body font-semibold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all mt-2 cursor-pointer"
        >
          <RefreshCw size={16} />
          <span>Tentar novamente</span>
        </button>
      </div>
    );
  }

  // ── Dados prontos ─────────────────────────────────────────────
  return <>{children}</>;
}
