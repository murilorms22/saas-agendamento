import { Outlet, Link } from "react-router-dom";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useProfessional } from "../store/useProfessional";

export default function RootLayout() {
  const { profissional, isLoading } = useProfessional();

  const nomeClinica = profissional?.nomeClinica ?? "";
  const profissao   = profissional?.profissao   ?? "";

  return (
    <div className="h-[100dvh] flex flex-col bg-gradient-to-br from-background via-background to-primary/5 text-foreground overflow-hidden">
      {/* Cabeçalho */}
      <header className="py-4 px-6 flex justify-between items-center bg-card/80 backdrop-blur-sm shadow-sm z-50 border-b-2 border-primary/20">
        <div className="font-display font-bold text-xl tracking-tight flex items-center gap-2 text-primary">
          {isLoading ? (
            <Loader2 size={22} className="animate-spin opacity-60" />
          ) : (
            <CalendarCheck size={24} />
          )}
          <span className={isLoading ? "opacity-40" : ""}>
            {isLoading ? "Carregando..." : nomeClinica}
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            to="/admin"
            className="text-xs font-body font-semibold text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-primary/5"
          >
            Acesso Profissional
          </Link>
          <button className="bg-primary text-primary-foreground px-5 py-2 rounded-full font-body font-semibold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            Agendar Consulta
          </button>
        </nav>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>

      {/* Rodapé */}
      <footer className="border-t border-border py-2 px-6 bg-background text-foreground/50 text-center flex justify-between items-center text-xs">
        <div className="font-display font-bold tracking-tight text-primary">
          {nomeClinica}
        </div>
        <div className="flex items-center gap-4">
          <p className="font-body">{profissao}</p>
          <Link
            to="/admin"
            className="font-body text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            Área do Profissional
          </Link>
        </div>
      </footer>
    </div>
  );
}
