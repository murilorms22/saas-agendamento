import { Outlet, Link, useLocation } from "react-router-dom";
import { Calendar, Users, Settings, LayoutDashboard, LogOut, CalendarCheck, Loader2 } from "lucide-react";
import { useProfessional } from "../store/useProfessional";

const navItems = [
  { to: "/admin",              label: "Resumo do Dia",            icon: LayoutDashboard, exact: true  },
  { to: "/admin/agenda",       label: "Minha Agenda",             icon: Calendar,        exact: false },
  { to: "/admin/historico",    label: "Histórico",                icon: Users,           exact: false },
  { to: "/admin/configuracoes",label: "Configurações",            icon: Settings,        exact: false },
];

export default function AdminLayout() {
  const location = useLocation();
  const { profissional, isLoading } = useProfessional();

  const nomeClinica = profissional?.nomeClinica ?? "Carregando...";
  const profissao   = profissional?.profissao   ?? "";

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="h-[100dvh] flex bg-gradient-to-br from-background via-background to-primary/5 text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-primary/10 flex flex-col relative z-10 bg-card/60 backdrop-blur-md shadow-soft">

        {/* Cabeçalho colorido da sidebar */}
        <div className="p-8 bg-gradient-to-br from-primary to-primary/70 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
          <div className="relative z-10">
            <div className="font-display font-bold text-xl tracking-tight flex items-center gap-2 text-white">
              {isLoading
                ? <Loader2 size={22} className="animate-spin opacity-70" />
                : <CalendarCheck size={24} />
              }
              <span className={isLoading ? "opacity-60" : ""}>{nomeClinica}</span>
            </div>
            <div className="text-white/60 text-xs font-semibold uppercase tracking-wider mt-2">
              {profissao ? `${profissao} — Painel` : "Painel"}
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-body font-semibold text-sm transition-all
                  ${active
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sair */}
        <div className="p-6 border-t border-border/20">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-semibold text-sm transition-all">
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 overflow-y-auto">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
        <div className="max-w-6xl mx-auto p-8 md:p-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
