/**
 * PageLoader — Estado de carregamento e erro reutilizável.
 * Usado pelas páginas enquanto o useProfessional busca dados do Supabase.
 */
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useProfessional } from "../store/useProfessional";

interface PageLoaderProps {
  /** Conteúdo a renderizar quando os dados estão prontos */
  children: React.ReactNode;
}

export function PageLoader({ children }: PageLoaderProps) {
  const { profissional, isLoading, error, refetch } = useProfessional();

  // ── Carregando ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 size={32} className="text-primary animate-spin" />
        </div>
        <p className="font-display font-bold text-foreground text-lg">Carregando...</p>
        <p className="font-body text-sm text-muted-foreground">
          Buscando dados da clínica
        </p>
      </div>
    );
  }

  // ── Erro ──────────────────────────────────────────────────────
  if (error || !profissional) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle size={32} className="text-destructive" />
        </div>
        <p className="font-display font-bold text-foreground text-lg">
          Erro ao carregar dados
        </p>
        <p className="font-body text-sm text-muted-foreground max-w-sm">
          {error ?? "Não foi possível conectar ao servidor. Verifique sua conexão."}
        </p>
        <button
          onClick={refetch}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-body font-semibold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all mt-2"
        >
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── Dados prontos ─────────────────────────────────────────────
  return <>{children}</>;
}
