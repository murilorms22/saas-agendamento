import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Settings,
  LayoutDashboard,
  LogOut,
  CalendarCheck,
  Loader2,
  Plus,
  CalendarDays,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { useProfessional } from "../store/useProfessional";
import { useAuth } from "../contexts/AuthContext";
import { ModalNovoAgendamento, type AgendamentoItem } from "../components/ModalNovoAgendamento";
import { supabase } from "../lib/supabase";

const navItems = [
  { to: "/admin",               label: "Painel Inicial",  icon: LayoutDashboard, exact: true  },
  { to: "/admin/resumo",        label: "Resumo do Dia",   icon: CalendarDays,    exact: false },
  { to: "/admin/agenda",        label: "Minha Agenda",    icon: Calendar,        exact: false },
  { to: "/admin/configuracoes", label: "Configurações",   icon: Settings,        exact: false },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profissional, isLoading } = useProfessional();
  const { user, signOut } = useAuth();

  // ── Estado da Barra Lateral Overlay (Abre/Fecha sem espremer o conteúdo) ──
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  // Fecha a sidebar ao pressionar a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarAberta) {
        setSidebarAberta(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarAberta]);

  const handleSair = async () => {
    await signOut();
    navigate("/login");
  };

  const nomeClinica = profissional?.nomeClinica ?? "Carregando...";
  const profissao   = profissional?.profissao   ?? "";

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  // Obtém o título da rota ativa para o cabeçalho superior
  const itemAtual = navItems.find((item) => isActive(item.to, item.exact));
  const tituloPagina = itemAtual?.label ?? "Painel Administrativo";
  const IconePagina = itemAtual?.icon ?? LayoutDashboard;

  const handleSalvarAgendamento = async (novo: AgendamentoItem) => {
    if (!profissional?.id) return;

    try {
      // Trava de segurança: checa conflito no banco
      const { data: conflitos } = await supabase
        .from("agendamentos")
        .select("id, nome_cliente")
        .eq("empresa_id", profissional.id)
        .eq("data", novo.data)
        .eq("horario", novo.horario)
        .neq("status", "Cancelado")
        .limit(1);

      if (conflitos && conflitos.length > 0) {
        alert(`Trava de segurança: O horário das ${novo.horario} em ${novo.data} já está reservado para ${conflitos[0].nome_cliente}!`);
        return;
      }

      const dataHoraIso = `${novo.data}T${novo.horario}:00Z`;
      const { data, error } = await supabase.from("agendamentos").insert({
        empresa_id: profissional.id,
        nome_cliente: novo.nomeCliente,
        whatsapp_cliente: novo.telefone || "",
        cliente_telefone: novo.telefone || "",
        servico_nome: novo.servico,
        data: novo.data,
        horario: novo.horario,
        data_hora_agendamento: dataHoraIso,
        status: novo.status,
      }).select().single();

      if (error) {
        console.error("Erro ao salvar agendamento no Supabase:", error);
      }

      const agCriado = {
        ...novo,
        id: data?.id ? String(data.id) : novo.id,
      };

      // Notifica componentes ativos para atualizar a lista na tela
      window.dispatchEvent(new CustomEvent("agendamento-criado", { detail: agCriado }));

      // Se não estiver na agenda, leva o profissional para a tela da agenda
      if (location.pathname !== "/admin/agenda") {
        navigate("/admin/agenda");
      }
    } catch (err) {
      console.error("Erro ao salvar agendamento criado pela sidebar:", err);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-gradient-to-br from-background via-background to-primary/5 text-foreground overflow-hidden relative">

      {/* ── 1. Top Bar Superior Fixa / Fluida ── */}
      <header className="w-full bg-card/80 backdrop-blur-xl border-b border-border/50 px-4 sm:px-8 py-3 flex items-center justify-between z-30 shrink-0 shadow-xs">
        {/* Lado Esquerdo: Botão de Alternância da Sidebar com Chevron Animado */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => setSidebarAberta((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/90 hover:bg-secondary/80 border border-border/70 text-foreground font-body font-bold text-xs shadow-xs hover:shadow-soft transition-all duration-300 cursor-pointer group"
            title={sidebarAberta ? "Recolher menu lateral (ESC)" : "Expandir menu lateral"}
            aria-label={sidebarAberta ? "Recolher menu lateral" : "Expandir menu lateral"}
            aria-expanded={sidebarAberta}
          >
            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <ChevronRight
                size={16}
                className={`stroke-[3] transition-transform duration-300 ease-in-out ${
                  sidebarAberta ? "rotate-180" : "rotate-0"
                }`}
              />
            </div>
            <span className="font-body font-semibold text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              Menu
            </span>
          </button>

          {/* Divisor vertical sutil */}
          <div className="h-5 w-px bg-border/60 hidden sm:block" />

          {/* Identificação da Tela Atual */}
          <div className="hidden sm:flex items-center gap-2 text-foreground font-display font-bold text-sm">
            <IconePagina size={17} className="text-primary stroke-[2.5]" />
            <span>{tituloPagina}</span>
          </div>
        </div>

        {/* Lado Direito: Logo / Nome da Clínica + Ação Rápida */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <Plus size={14} className="stroke-[3]" />
            <span>Novo Agendamento</span>
          </button>

          <div className="flex items-center gap-2.5 pl-2 sm:border-l sm:border-border/60">
            {isLoading ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : profissional?.logoUrl ? (
              <img
                src={profissional.logoUrl}
                alt={nomeClinica}
                className="w-8 h-8 rounded-lg object-contain bg-secondary/60 p-0.5 border border-border/40 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                <CalendarCheck size={16} />
              </div>
            )}
            <div className="text-left hidden md:block">
              <p className="font-display font-bold text-xs text-foreground leading-tight truncate max-w-[160px]">
                {nomeClinica}
              </p>
              <p className="text-[10px] font-body text-muted-foreground truncate max-w-[160px]">
                {profissao || "Painel"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Camada de Fundo Escurecido (Overlay Backdrop) ── */}
      {sidebarAberta && (
        <div
          onClick={() => setSidebarAberta(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 animate-in fade-in cursor-pointer"
          aria-hidden="true"
        />
      )}

      {/* ── 3. Barra Lateral Flexível do tipo Overlay (Sobreposição Total) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 sm:w-80 flex flex-col bg-card/95 backdrop-blur-2xl border-r border-border/70 shadow-2xl transition-transform duration-300 ease-in-out transform ${
          sidebarAberta ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu Lateral de Navegação"
      >
        {/* Cabeçalho estilizado da Sidebar */}
        <div className="p-6 bg-gradient-to-br from-primary via-primary to-primary/80 relative overflow-hidden text-white flex items-center justify-between">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

          <div className="relative z-10 flex-1 min-w-0 pr-2">
            <div className="font-display font-bold text-base tracking-tight flex items-center gap-2 truncate">
              {isLoading ? (
                <Loader2 size={20} className="animate-spin opacity-70 shrink-0" />
              ) : profissional?.logoUrl ? (
                <img
                  src={profissional.logoUrl}
                  alt={nomeClinica}
                  className="w-7 h-7 rounded-lg object-contain bg-white/20 p-0.5 shrink-0"
                />
              ) : (
                <CalendarCheck size={20} className="shrink-0" />
              )}
              <span className="truncate">{nomeClinica}</span>
            </div>
            <div className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mt-1 truncate">
              {profissao ? `${profissao} — Painel` : "Painel"}
            </div>
          </div>

          {/* Botão de Fechar a Sidebar com Chevron Rotacionado (180°) */}
          <button
            type="button"
            onClick={() => setSidebarAberta(false)}
            className="relative z-10 w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Recolher menu lateral"
            aria-label="Recolher menu lateral"
          >
            <ChevronRight size={18} className="rotate-180 stroke-[3]" />
          </button>
        </div>

        {/* Botão Novo Agendamento dentro da Sidebar */}
        <div className="p-4 pb-2">
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSidebarAberta(false);
              setModalAberto(true);
            }}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:rotate-90 duration-200">
              <Plus size={14} className="stroke-[3]" />
            </div>
            <span>Novo agendamento</span>
          </motion.button>
        </div>

        {/* Links de Navegação (Fecham a sidebar automaticamente ao clicar) */}
        <nav className="flex-1 px-4 py-3 space-y-1.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <motion.div
                key={to}
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link
                  to={to}
                  onClick={() => setSidebarAberta(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-body font-semibold text-sm transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-soft font-bold"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              </motion.div>
            );
          })}

          {/* Link para visualização da Landing Page do Cliente */}
          <div className="pt-2">
            <a
              href={`/${profissional?.slug || "studio-fisio"}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSidebarAberta(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl font-body font-semibold text-xs text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all border border-border/40 group"
            >
              <div className="flex items-center gap-2.5">
                <ExternalLink size={15} className="text-primary group-hover:scale-110 transition-transform" />
                <span>Ver Página Pública</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary font-mono text-muted-foreground">
                Online
              </span>
            </a>
          </div>
        </nav>

        {/* Perfil autenticado + Botão Sair */}
        <div className="p-4 border-t border-border/20 space-y-3 bg-card/40">
          {user && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-secondary/40 border border-border/30">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata?.full_name || "Usuário"}
                  className="w-7 h-7 rounded-full border border-border shrink-0 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {user.email?.charAt(0).toUpperCase() || "P"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-body font-bold text-foreground truncate">
                  {user.user_metadata?.full_name || "Profissional"}
                </p>
                <p className="text-[10px] font-body text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSidebarAberta(false);
              handleSair();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-semibold text-xs transition-all cursor-pointer"
          >
            <LogOut size={15} />
            Sair da Conta
          </motion.button>
        </div>
      </aside>

      {/* ── 4. Área Principal (Mantém 100% da largura útil w-full sem espremer) ── */}
      <main className="flex-1 w-full overflow-y-auto">
        <div className="h-0.5 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-8 md:p-10">
          <Outlet />
        </div>
      </main>

      {/* ── 5. Modal de Novo Agendamento ── */}
      <ModalNovoAgendamento
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onSalvar={handleSalvarAgendamento}
        servicos={profissional?.servicos ?? []}
        horariosDisponiveis={
          profissional?.horariosDisponiveis ?? [
            "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
          ]
        }
        empresaId={profissional?.id}
      />
    </div>
  );
}
