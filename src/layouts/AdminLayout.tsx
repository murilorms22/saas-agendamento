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
import { motion, AnimatePresence } from "framer-motion";
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

  // ── Estado da Sidebar: Retraída (apenas ícones) vs Expandida (Overlay com títulos) ──
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  // Fecha a expansão da sidebar ao pressionar a tecla ESC
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

  // Título da tela ativa para o cabeçalho superior
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
    <div className="h-[100dvh] w-full flex bg-gradient-to-br from-background via-background to-primary/5 text-foreground overflow-hidden relative">

      {/* ── 1. Backdrop com blur escurecido quando a sidebar expandir em Overlay ── */}
      <AnimatePresence>
        {sidebarAberta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarAberta(false)}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] cursor-pointer"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ── 2. Sidebar Sempre Visível: Retraída (Ícones) vs Expandida (Overlay com Títulos) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-card/95 backdrop-blur-2xl border-r border-border/70 shadow-2xl transition-all duration-300 ease-in-out ${
          sidebarAberta ? "w-72 sm:w-80" : "w-16 sm:w-20"
        }`}
        aria-label="Menu de Navegação Lateral"
      >
        {/* Cabeçalho da Sidebar */}
        <div
          onClick={() => {
            if (!sidebarAberta) setSidebarAberta(true);
          }}
          className={`bg-gradient-to-br from-primary via-primary to-primary/85 relative overflow-hidden text-white flex items-center transition-all duration-300 cursor-pointer ${
            sidebarAberta ? "p-5 justify-between" : "p-3.5 sm:p-4 justify-center"
          }`}
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

          {/* Logo / Ícone da Clínica */}
          <div className="relative z-10 flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 p-1 flex items-center justify-center shrink-0 border border-white/25 shadow-xs">
              {isLoading ? (
                <Loader2 size={20} className="animate-spin opacity-80" />
              ) : profissional?.logoUrl ? (
                <img
                  src={profissional.logoUrl}
                  alt={nomeClinica}
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <CalendarCheck size={20} className="text-white" />
              )}
            </div>

            {/* Informações detalhadas visíveis quando expandida */}
            {sidebarAberta && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="min-w-0 flex-1"
              >
                <h2 className="font-display font-bold text-sm tracking-tight text-white leading-tight truncate">
                  {nomeClinica}
                </h2>
                <p className="text-white/75 text-[10px] font-semibold uppercase tracking-wider mt-0.5 truncate">
                  {profissao ? `${profissao} — Painel` : "Painel"}
                </p>
              </motion.div>
            )}
          </div>

          {/* Botão com Chevron Animado para Alternar Expansão */}
          {sidebarAberta && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarAberta(false);
              }}
              className="relative z-10 w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Recolher barra lateral"
              aria-label="Recolher barra lateral"
            >
              <ChevronRight size={18} className="rotate-180 stroke-[3] transition-transform duration-300" />
            </button>
          )}
        </div>

        {/* Botão de Toggle Chevron visível no modo retraído */}
        {!sidebarAberta && (
          <div className="py-2 flex justify-center border-b border-border/30">
            <button
              type="button"
              onClick={() => setSidebarAberta(true)}
              className="w-9 h-9 rounded-xl bg-secondary/80 hover:bg-primary/15 text-muted-foreground hover:text-primary flex items-center justify-center transition-all cursor-pointer group"
              title="Expandir menu lateral"
              aria-label="Expandir menu lateral"
            >
              <ChevronRight size={16} className="stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* Botão Novo Agendamento */}
        <div className={`py-3 transition-all duration-300 ${sidebarAberta ? "px-4" : "px-2 sm:px-2.5 flex justify-center"}`}>
          <button
            type="button"
            onClick={() => {
              if (!sidebarAberta) {
                setSidebarAberta(true);
              }
              setModalAberto(true);
            }}
            title="Novo agendamento"
            className={`flex items-center rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer group ${
              sidebarAberta
                ? "w-full justify-center gap-2.5 px-4 py-3"
                : "w-11 h-11 sm:w-12 sm:h-12 justify-center"
            }`}
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:rotate-90 duration-200 shrink-0">
              <Plus size={14} className="stroke-[3]" />
            </div>
            {sidebarAberta && <span>Novo agendamento</span>}
          </button>
        </div>

        {/* Lista de Navegação */}
        <nav className={`flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden ${sidebarAberta ? "px-4 py-2" : "px-2 py-2 flex flex-col items-center"}`}>
          {navItems.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => {
                  if (!sidebarAberta) {
                    setSidebarAberta(true);
                  }
                }}
                title={!sidebarAberta ? label : undefined}
                className={`flex items-center rounded-xl font-body transition-all group ${
                  sidebarAberta
                    ? `gap-3.5 px-3.5 py-3 w-full text-sm font-semibold ${
                        active
                          ? "bg-primary text-primary-foreground shadow-soft font-bold"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      }`
                    : `w-11 h-11 sm:w-12 sm:h-12 justify-center ${
                        active
                          ? "bg-primary text-primary-foreground shadow-soft"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      }`
                }`}
              >
                <Icon size={19} className="shrink-0 stroke-[2.2]" />
                {sidebarAberta && <span className="truncate">{label}</span>}
              </Link>
            );
          })}

          {/* Link para visualização da Landing Page do Cliente */}
          <div className={`pt-2 w-full ${!sidebarAberta ? "flex justify-center" : ""}`}>
            <a
              href={`/${profissional?.slug || "studio-fisio"}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!sidebarAberta) setSidebarAberta(true);
              }}
              title={!sidebarAberta ? "Ver Página Pública" : undefined}
              className={`flex items-center rounded-xl font-body text-xs text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all border border-border/40 group ${
                sidebarAberta
                  ? "justify-between px-3.5 py-2.5 w-full font-semibold"
                  : "w-11 h-11 sm:w-12 sm:h-12 justify-center"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ExternalLink size={16} className="text-primary group-hover:scale-110 transition-transform shrink-0" />
                {sidebarAberta && <span>Ver Página Pública</span>}
              </div>
              {sidebarAberta && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary font-mono text-muted-foreground shrink-0">
                  Online
                </span>
              )}
            </a>
          </div>
        </nav>

        {/* Rodapé da Sidebar: Perfil + Botão Sair */}
        <div className={`border-t border-border/30 bg-card/60 transition-all duration-300 ${sidebarAberta ? "p-4 space-y-3" : "p-2 sm:p-2.5 flex flex-col items-center space-y-2"}`}>
          {user && (
            <div
              onClick={() => {
                if (!sidebarAberta) setSidebarAberta(true);
              }}
              className={`flex items-center rounded-xl bg-secondary/40 border border-border/30 cursor-pointer ${
                sidebarAberta ? "gap-2.5 px-3 py-2 w-full" : "w-11 h-11 sm:w-12 sm:h-12 justify-center p-1"
              }`}
              title={!sidebarAberta ? user.user_metadata?.full_name || user.email || "Perfil" : undefined}
            >
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

              {sidebarAberta && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-body font-bold text-foreground truncate">
                    {user.user_metadata?.full_name || "Profissional"}
                  </p>
                  <p className="text-[10px] font-body text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSair}
            title="Sair da Conta"
            className={`flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-semibold text-xs transition-all cursor-pointer ${
              sidebarAberta ? "w-full gap-2 px-4 py-2.5" : "w-11 h-11 sm:w-12 sm:h-12"
            }`}
          >
            <LogOut size={16} className="shrink-0" />
            {sidebarAberta && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* ── 3. Conteúdo Principal da Tela (Deslocado com pl-16 / pl-20 fixo sem espremer) ── */}
      <div className="flex-1 w-full h-[100dvh] flex flex-col pl-16 sm:pl-20 overflow-hidden">
        {/* Top Bar Superior */}
        <header className="w-full bg-card/80 backdrop-blur-xl border-b border-border/50 px-4 sm:px-8 py-3.5 flex items-center justify-between z-30 shrink-0 shadow-xs">
          {/* Identificação da Tela Atual */}
          <div className="flex items-center gap-2.5 text-foreground font-display font-bold text-base sm:text-lg">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <IconePagina size={18} className="stroke-[2.5]" />
            </div>
            <span>{tituloPagina}</span>
          </div>

          {/* Lado Direito: Ação Rápida + Identificação da Clínica */}
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

        {/* Área Útil de Trabalho (100% da largura útil sem espremer ou redimensionar) */}
        <main className="flex-1 w-full overflow-y-auto">
          <div className="h-0.5 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
          <div className="w-full max-w-7xl mx-auto p-4 sm:p-8 md:p-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── 4. Modal de Novo Agendamento ── */}
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
