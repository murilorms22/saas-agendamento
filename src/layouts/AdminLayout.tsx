import { Outlet, Link } from "react-router-dom";
import { Calendar, Users, Settings, LayoutDashboard, LogOut, Stethoscope } from "lucide-react";
import { useEffect } from "react";

export default function AdminLayout() {
  // Force dark mode for admin
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  return (
    <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/20 bg-card/50 flex flex-col relative z-10 backdrop-blur-md">
        <div className="p-8 border-b border-border/20">
          <div className="font-display font-bold text-xl tracking-tight flex items-center gap-2 text-primary">
            <Stethoscope size={24} />
            Nox Admin
          </div>
          <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mt-2">Control Panel</div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <Link to="/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-body font-semibold text-sm transition-all">
            <Calendar size={18} />
            Agenda Hoje
          </Link>
          <Link to="/admin/history" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground font-body font-medium text-sm transition-all">
            <Users size={18} />
            Histórico
          </Link>
          <Link to="/admin/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground font-body font-medium text-sm transition-all">
            <Settings size={18} />
            Configurações
          </Link>
        </nav>

        <div className="p-6 border-t border-border/20">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-semibold text-sm transition-all">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 overflow-y-auto bg-background/95">
        <div className="max-w-6xl mx-auto p-8 md:p-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
