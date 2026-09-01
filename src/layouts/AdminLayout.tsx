import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Calendar, Users, Settings, LayoutDashboard, LogOut, CalendarCheck, Loader2, Plus, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { useProfessional } from "../store/useProfessional";
import { ModalNovoAgendamento, type AgendamentoItem } from "../components/ModalNovoAgendamento";
import { supabase } from "../lib/supabase";

const navItems = [
  { to: "/admin",              label: "Painel Inicial",           icon: LayoutDashboard, exact: true  },
  { to: "/admin/resumo",       label: "Resumo do Dia",            icon: CalendarDays,    exact: false },
  { to: "/admin/agenda",       label: "Minha Agenda",             icon: Calendar,        exact: false },
  { to: "/admin/historico",    label: "Histórico",                icon: Users,           exact: false },
  { to: "/admin/configuracoes",label: "Configurações",            icon: Settings,        exact: false },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profissional, isLoading } = useProfessional();
  const [modalAberto, setModalAberto] = useState(false);

  const nomeClinica = profissional?.nomeClinica ?? "Carregando...";
  const profissao   = profissional?.profissao   ?? "";

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

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

        {/* Botão Novo Agendamento: Primeira coisa na sidebar */}
        <div className="p-4 pb-2">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalAberto(true)}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:rotate-90 duration-200">
              <Plus size={14} className="stroke-[3]" />
            </div>
            <span>Novo agendamento</span>
          </motion.button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-4 py-3 space-y-1 overflow-y-auto">
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-body font-semibold text-sm transition-all
                    ${active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Sair */}
        <div className="p-6 border-t border-border/20">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-semibold text-sm transition-all cursor-pointer"
          >
            <LogOut size={18} />
            Sair
          </motion.button>
        </div>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 overflow-y-auto">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
        <div className="max-w-6xl mx-auto p-8 md:p-12">
          <Outlet />
        </div>
      </main>

      {/* Modal de Novo Agendamento disparado pela Sidebar */}
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
