import { useState, useEffect, useMemo } from "react";
import { format, isThisWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  X,
  Clock,
  CalendarDays,
  CheckCircle2,
  User,
  CalendarOff,
  Loader2,
  Search,
  Phone,
  ShieldCheck,
  XCircle,
  LayoutGrid,
  Table as TableIcon,
  MessageCircle,
  AlertTriangle,
  AlertCircle,
  Calendar as CalendarIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { ModalDetalhesAgendamento } from "../../components/ModalDetalhesAgendamento";
import { ModalNovoAgendamento, type AgendamentoItem } from "../../components/ModalNovoAgendamento";

export default function AdminDashboard() {
  return (
    <PageLoader>
      <DashboardConteudo />
    </PageLoader>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos & Status Válidos
// ─────────────────────────────────────────────────────────────────────────────

export type Status = "Pendente" | "Confirmado" | "Finalizado" | "Cancelado";

export type Agendamento = {
  id: string;
  nomeCliente: string;
  telefone?: string;
  servico: string;
  horario: string;
  data: string;
  status: Status;
};

interface ToastMsg {
  tipo: "success" | "error" | "warning" | "info";
  texto: string;
}

function mapearAgendamento(
  row: any,
  servicos: { id: number | string; nome: string }[]
): Agendamento {
  const servicoNome =
    row.servico_nome ??
    row.servico ??
    servicos.find((s) => String(s.id) === String(row.servico_id))?.nome ??
    "Consulta";

  let dataFinal = row.data ?? row.data_agendamento;
  if (!dataFinal && row.data_hora_agendamento) {
    dataFinal = String(row.data_hora_agendamento).split("T")[0];
  }
  if (!dataFinal) {
    dataFinal = format(new Date(), "yyyy-MM-dd");
  }

  let horarioFinal = row.horario ?? row.hora;
  if (!horarioFinal && row.data_hora_agendamento) {
    const parte = String(row.data_hora_agendamento).split("T")[1];
    if (parte) horarioFinal = parte.slice(0, 5);
  }
  if (!horarioFinal) {
    horarioFinal = "08:00";
  }

  // Validação estrita dos 4 status válidos
  let statusFinal: Status = "Pendente";
  if (
    row.status === "Confirmado" ||
    row.status === "Finalizado" ||
    row.status === "Cancelado"
  ) {
    statusFinal = row.status;
  }

  return {
    id: String(row.id),
    nomeCliente: row.nome_cliente ?? row.cliente_nome ?? row.nome ?? "Cliente",
    telefone:
      row.whatsapp_cliente ??
      row.cliente_telefone ??
      row.telefone ??
      row.whatsapp ??
      "",
    servico: servicoNome,
    horario: horarioFinal,
    data: dataFinal,
    status: statusFinal,
  };
}

const statusConfig: Record<
  Status,
  {
    corBorda: string;
    bgBadge: string;
    textoBadge: string;
    bordaBadge: string;
    icone: React.ReactNode;
    label: string;
  }
> = {
  Pendente: {
    corBorda: "border-l-amber-500",
    bgBadge: "bg-amber-500/10",
    textoBadge: "text-amber-700 dark:text-amber-300",
    bordaBadge: "border-amber-500/20",
    icone: <Clock size={14} />,
    label: "Pendente",
  },
  Confirmado: {
    corBorda: "border-l-blue-500",
    bgBadge: "bg-blue-500/10",
    textoBadge: "text-blue-700 dark:text-blue-300",
    bordaBadge: "border-blue-500/20",
    icone: <CheckCircle2 size={14} />,
    label: "Confirmado",
  },
  Finalizado: {
    corBorda: "border-l-emerald-500",
    bgBadge: "bg-emerald-500/10",
    textoBadge: "text-emerald-700 dark:text-emerald-300",
    bordaBadge: "border-emerald-500/20",
    icone: <ShieldCheck size={14} />,
    label: "Finalizado",
  },
  Cancelado: {
    corBorda: "border-l-rose-500",
    bgBadge: "bg-rose-500/10",
    textoBadge: "text-rose-700 dark:text-rose-300",
    bordaBadge: "border-rose-500/20",
    icone: <XCircle size={14} />,
    label: "Cancelado",
  },
};

function DashboardConteudo() {
  const { profissional: profissionalNullable } = useProfessional();
  const profissional = profissionalNullable!; // seguro: PageLoader garante não-null
  const servicos = profissional.servicos;

  // Estados dos agendamentos
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estado de loading individual por linha para evitar concorrência / duplo clique
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  // Filtros e controles visuais
  const [periodoFiltro, setPeriodoFiltro] = useState<"hoje" | "semana" | "todos">("hoje");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | Status>("todos");
  const [busca, setBusca] = useState("");
  const [modoVisualizacao, setModoVisualizacao] = useState<"cards" | "tabela">("cards");

  // Feedback com Toast
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const exibirToast = (
    texto: string,
    tipo: "success" | "error" | "warning" | "info" = "success"
  ) => {
    setToast({ texto, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Estados dos modais de detalhes e edição
  const [agendamentoDetalhes, setAgendamentoDetalhes] = useState<Agendamento | null>(null);
  const [agendamentoParaEditar, setAgendamentoParaEditar] = useState<Agendamento | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);

  const handleEditar = (ag: Agendamento) => {
    setAgendamentoDetalhes(null);
    setAgendamentoParaEditar(ag);
    setModalEditarAberto(true);
  };

  const handleExcluir = async (id: string) => {
    // 🛡️ Guard Clause Estrita
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao excluir agendamento.");
      return;
    }
    setAgendamentos((prev) => prev.filter((a) => a.id !== id));
    try {
      // 🛡️ Trava Dupla contra IDOR
      await supabase
        .from("agendamentos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", profissional.id);
      exibirToast("Agendamento removido com sucesso.", "info");
    } catch (err) {
      console.error("Erro ao excluir agendamento:", err);
      exibirToast("Erro ao remover agendamento.", "error");
    }
  };

  const handleSalvarEdicao = async (editado: AgendamentoItem) => {
    // 🛡️ Guard Clause Estrita
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao editar agendamento.");
      return;
    }
    setAgendamentos((prev) =>
      prev.map((a) => (a.id === editado.id ? { ...a, ...editado } : a))
    );
    try {
      // 🛡️ Trava Dupla contra IDOR
      await supabase
        .from("agendamentos")
        .update({
          nome_cliente: editado.nomeCliente,
          cliente_telefone: editado.telefone,
          servico_nome: editado.servico,
          data: editado.data,
          horario: editado.horario,
          status: editado.status,
        })
        .eq("id", editado.id)
        .eq("empresa_id", profissional.id);
      exibirToast("Agendamento atualizado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar edição de agendamento:", err);
      exibirToast("Falha ao salvar alterações.", "error");
    }
    setAgendamentoParaEditar(null);
    setModalEditarAberto(false);
  };

  // 🛡️ Listagem Segura com filtro estrito .eq('empresa_id', profissional.id)
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      // 🛡️ Guard Clause
      if (!profissional?.id) return;
      setCarregando(true);

      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("empresa_id", profissional.id)
          .order("data", { ascending: false })
          .order("horario", { ascending: true });

        if (!ativo) return;

        if (error) {
          console.error("Erro ao carregar agendamentos do profissional:", error);
          exibirToast("Erro ao sincronizar agendamentos.", "error");
        } else if (data) {
          const mapeados = data.map((r: any) => mapearAgendamento(r, servicos));
          setAgendamentos(mapeados);
        }
      } catch (err) {
        console.error("Erro inesperado ao carregar agendamentos:", err);
        if (ativo) exibirToast("Erro de conexão com o banco.", "error");
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregar();

    // Sincronização em tempo real via Supabase Realtime
    const channel = supabase
      .channel(`dashboard-realtime-${profissional?.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${profissional.id}`,
        },
        () => {
          carregar();
        }
      )
      .subscribe();

    const handleFocus = () => carregar();
    window.addEventListener("focus", handleFocus);

    return () => {
      ativo = false;
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [profissional?.id, servicos]);

  // 🛡️ Mutação de Status Segura com Trava Dupla contra IDOR e Guard Clause
  const handleStatus = async (id: string, novoStatus: Status) => {
    // 🛡️ 1. Guard Clause Estrita: Sanidade do contexto do profissional
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao atualizar status.");
      return;
    }

    // 🛡️ 2. Feedback Visual & Trava contra Duplo Clique / Concorrência
    if (statusLoadingId) return;
    setStatusLoadingId(id);

    const agendamentoAnterior = agendamentos.find((a) => a.id === id);

    // Atualização otimista imediata na UI
    setAgendamentos((prev) =>
      prev.map((ag) => (ag.id === id ? { ...ag, status: novoStatus } : ag))
    );

    try {
      // 🛡️ 3. Trava Dupla de Escopo contra IDOR: .eq('id', id).eq('empresa_id', profissional.id)
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: novoStatus })
        .eq("id", id)
        .eq("empresa_id", profissional.id);

      if (error) {
        console.error("Erro ao atualizar status do agendamento:", error);
        // Rollback se falhar
        if (agendamentoAnterior) {
          setAgendamentos((prev) =>
            prev.map((ag) => (ag.id === id ? agendamentoAnterior : ag))
          );
        }
        exibirToast("Erro ao alterar o status da consulta.", "error");
      } else {
        exibirToast(`Status alterado para "${novoStatus}" com sucesso!`, "success");
      }
    } catch (err) {
      console.error("Erro inesperado ao atualizar status:", err);
      if (agendamentoAnterior) {
        setAgendamentos((prev) =>
          prev.map((ag) => (ag.id === id ? agendamentoAnterior : ag))
        );
      }
      exibirToast("Falha de conexão ao atualizar status.", "error");
    } finally {
      setStatusLoadingId(null);
    }
  };

  // Filtros em Memória (Período + Status + Busca)
  const agendamentosFiltrados = useMemo(() => {
    const hojeStr = format(new Date(), "yyyy-MM-dd");

    return agendamentos.filter((ag) => {
      // 1. Filtro de Período
      if (periodoFiltro === "hoje") {
        if (ag.data !== hojeStr) return false;
      } else if (periodoFiltro === "semana") {
        try {
          const dataObj = parseISO(ag.data);
          if (!isThisWeek(dataObj, { weekStartsOn: 1 })) return false;
        } catch {
          return false;
        }
      }

      // 2. Filtro de Status
      if (statusFiltro !== "todos" && ag.status !== statusFiltro) {
        return false;
      }

      // 3. Filtro de Busca
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const matchNome = ag.nomeCliente.toLowerCase().includes(termo);
        const matchTel = (ag.telefone || "").includes(termo);
        const matchServ = ag.servico.toLowerCase().includes(termo);
        if (!matchNome && !matchTel && !matchServ) return false;
      }

      return true;
    });
  }, [agendamentos, periodoFiltro, statusFiltro, busca]);

  // Contadores dinâmicos de acordo com o período selecionado
  const contadores = useMemo(() => {
    const hojeStr = format(new Date(), "yyyy-MM-dd");
    const doPeriodo = agendamentos.filter((ag) => {
      if (periodoFiltro === "hoje") return ag.data === hojeStr;
      if (periodoFiltro === "semana") {
        try {
          return isThisWeek(parseISO(ag.data), { weekStartsOn: 1 });
        } catch {
          return false;
        }
      }
      return true;
    });

    return {
      total: doPeriodo.length,
      pendentes: doPeriodo.filter((a) => a.status === "Pendente").length,
      confirmados: doPeriodo.filter((a) => a.status === "Confirmado").length,
      finalizados: doPeriodo.filter((a) => a.status === "Finalizado").length,
      cancelados: doPeriodo.filter((a) => a.status === "Cancelado").length,
    };
  }, [agendamentos, periodoFiltro]);

  return (
    <div className="space-y-8 pb-14 relative">
      {/* ── Toast de Feedback ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-floating border backdrop-blur-md text-xs font-body font-semibold ${
              toast.tipo === "success"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                : toast.tipo === "error"
                ? "bg-rose-500/15 border-rose-500/30 text-rose-800 dark:text-rose-200"
                : toast.tipo === "warning"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-200"
                : "bg-card/90 border-border text-foreground"
            }`}
          >
            {toast.tipo === "success" && <CheckCircle2 size={16} className="text-emerald-500" />}
            {toast.tipo === "error" && <AlertCircle size={16} className="text-rose-500" />}
            {toast.tipo === "warning" && <AlertTriangle size={16} className="text-amber-500" />}
            <span>{toast.texto}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Detalhes do Agendamento */}
      <AnimatePresence>
        {agendamentoDetalhes && (
          <ModalDetalhesAgendamento
            agendamento={agendamentoDetalhes as any}
            onFechar={() => setAgendamentoDetalhes(null)}
            onEditar={(ag) => handleEditar(ag as Agendamento)}
            onExcluir={handleExcluir}
            onAtualizarStatus={handleStatus}
          />
        )}
      </AnimatePresence>

      {/* Modal de Edição */}
      <AnimatePresence>
        {modalEditarAberto && (
          <ModalNovoAgendamento
            aberto={modalEditarAberto}
            data={new Date()}
            agendamentoInicial={agendamentoParaEditar as any}
            empresaId={profissional?.id}
            onFechar={() => {
              setModalEditarAberto(false);
              setAgendamentoParaEditar(null);
            }}
            onSalvar={handleSalvarEdicao}
            servicos={servicos as any}
            horariosDisponiveis={
              profissional?.horariosDisponiveis ?? [
                "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
              ]
            }
          />
        )}
      </AnimatePresence>

      {/* ── Cabeçalho do Painel com Contadores Dinâmicos ── */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end border-b border-border/40 pb-7 gap-6">
        <div>
          <div className="flex items-center gap-2 text-primary font-body font-semibold text-xs mb-1.5 uppercase tracking-wider">
            <CalendarDays size={15} />
            <span>
              {periodoFiltro === "hoje"
                ? `Hoje • ${format(new Date(), "dd 'de' MMMM", { locale: ptBR })}`
                : periodoFiltro === "semana"
                ? "Agendamentos desta semana"
                : "Visão Geral de Agendamentos"}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
            Gestão de Agendamentos
          </h1>
          <p className="text-muted-foreground font-body text-xs sm:text-sm font-medium mt-1">
            Acompanhe, aprove e altere o status das consultas dos seus clientes em tempo real.
          </p>
        </div>

        {/* Cards de Métricas do Período */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
          {/* Pendentes */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Pendente" ? "todos" : "Pendente")}
            className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-3.5 shadow-soft cursor-pointer ${
              statusFiltro === "Pendente"
                ? "bg-amber-500/15 border-amber-500/40 ring-2 ring-amber-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground leading-none block">
                {contadores.pendentes}
              </span>
              <span className="text-[11px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Pendentes
              </span>
            </div>
          </button>

          {/* Confirmados */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Confirmado" ? "todos" : "Confirmado")}
            className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-3.5 shadow-soft cursor-pointer ${
              statusFiltro === "Confirmado"
                ? "bg-blue-500/15 border-blue-500/40 ring-2 ring-blue-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground leading-none block">
                {contadores.confirmados}
              </span>
              <span className="text-[11px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Confirmados
              </span>
            </div>
          </button>

          {/* Finalizados */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Finalizado" ? "todos" : "Finalizado")}
            className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-3.5 shadow-soft cursor-pointer ${
              statusFiltro === "Finalizado"
                ? "bg-emerald-500/15 border-emerald-500/40 ring-2 ring-emerald-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground leading-none block">
                {contadores.finalizados}
              </span>
              <span className="text-[11px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Finalizados
              </span>
            </div>
          </button>

          {/* Total do Período */}
          <button
            type="button"
            onClick={() => setStatusFiltro("todos")}
            className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-3.5 shadow-soft cursor-pointer ${
              statusFiltro === "todos"
                ? "bg-primary/10 border-primary/30 ring-2 ring-primary/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-foreground leading-none block">
                {contadores.total}
              </span>
              <span className="text-[11px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Total
              </span>
            </div>
          </button>
        </div>
      </header>

      {/* ── Barra de Controles: Filtros de Período, Busca e Modo de Visualização ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-card/60 p-4 rounded-2xl border border-border/40 shadow-soft">
        {/* Toggle de Período */}
        <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-xl border border-border/30 shrink-0">
          <button
            type="button"
            onClick={() => setPeriodoFiltro("hoje")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
              periodoFiltro === "hoje"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPeriodoFiltro("semana")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
              periodoFiltro === "semana"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Esta Semana
          </button>
          <button
            type="button"
            onClick={() => setPeriodoFiltro("todos")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
              periodoFiltro === "todos"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por paciente, telefone ou serviço..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-background border border-border/60 text-xs font-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted-foreground/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Alternador de Visualização: Cards vs Tabela */}
        <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-xl border border-border/30 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setModoVisualizacao("cards")}
            title="Visualização em Cards"
            className={`p-1.5 rounded-lg text-xs font-body transition-all cursor-pointer ${
              modoVisualizacao === "cards"
                ? "bg-background text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => setModoVisualizacao("tabela")}
            title="Visualização em Tabela"
            className={`p-1.5 rounded-lg text-xs font-body transition-all cursor-pointer ${
              modoVisualizacao === "tabela"
                ? "bg-background text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TableIcon size={16} />
          </button>
        </div>
      </div>

      {/* ── Conteúdo Principal: Cards ou Tabela ── */}
      <section>
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={36} className="animate-spin text-primary mb-3" />
            <p className="font-body text-sm font-semibold">Carregando consultas com segurança...</p>
          </div>
        ) : agendamentosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-card/40 rounded-3xl border border-border/30 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3.5">
              <CalendarOff size={28} />
            </div>
            <h3 className="font-display font-bold text-lg text-foreground">
              Nenhum agendamento encontrado
            </h3>
            <p className="font-body text-xs sm:text-sm text-muted-foreground max-w-md mt-1">
              {busca
                ? `Nenhum agendamento corresponde ao termo "${busca}".`
                : statusFiltro !== "todos"
                ? `Não há agendamentos com status "${statusFiltro}" no período selecionado.`
                : "Não há consultas registradas para este período."}
            </p>
          </div>
        ) : modoVisualizacao === "cards" ? (
          /* ── MODO 1: CARDS MODERNOS ── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {agendamentosFiltrados.map((ag) => {
                const config = statusConfig[ag.status];
                const estaCarregandoLinha = statusLoadingId === ag.id;

                return (
                  <motion.div
                    layout
                    key={ag.id}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.25 }}
                    className={`flex flex-col p-5 rounded-3xl bg-card border-l-4 ${config.corBorda} border border-border/50 shadow-floating relative transition-all`}
                  >
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-base shrink-0 shadow-inner">
                          {ag.nomeCliente.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3
                            onClick={() => setAgendamentoDetalhes(ag)}
                            className="font-display font-bold text-base text-foreground hover:text-primary transition-colors truncate cursor-pointer leading-snug"
                            title="Clique para ver detalhes"
                          >
                            {ag.nomeCliente}
                          </h3>
                          <p className="font-body text-xs text-muted-foreground font-semibold truncate">
                            {ag.servico}
                          </p>
                        </div>
                      </div>

                      {/* Badge do Status Atual */}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-body font-bold border shrink-0 ${config.bgBadge} ${config.textoBadge} ${config.bordaBadge}`}
                      >
                        {estaCarregandoLinha ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          config.icone
                        )}
                        <span>{config.label}</span>
                      </div>
                    </div>

                    {/* Informações: Data, Hora e Telefone */}
                    <div className="space-y-1.5 py-2 border-y border-border/25 my-1 text-xs font-body">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarIcon size={13} className="text-primary" />
                          <span>
                            {ag.data === format(new Date(), "yyyy-MM-dd")
                              ? "Hoje"
                              : format(parseISO(ag.data), "dd/MM/yyyy")}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 font-bold text-foreground bg-secondary/80 px-2 py-0.5 rounded-lg">
                          <Clock size={12} className="text-primary" />
                          {ag.horario}
                        </span>
                      </div>

                      {ag.telefone && (
                        <div className="flex items-center justify-between text-muted-foreground pt-0.5">
                          <span className="flex items-center gap-1.5">
                            <Phone size={13} />
                            <span>{ag.telefone}</span>
                          </span>
                          <a
                            href={`https://wa.me/55${ag.telefone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
                            title="Conversar no WhatsApp"
                          >
                            <MessageCircle size={12} />
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>

                    {/* 🛡️ Ações Rápidas de Alteração de Status (Trava Dupla IDOR) */}
                    <div className="pt-3 mt-auto flex flex-col gap-2">
                      <span className="text-[10px] font-body font-bold uppercase tracking-wider text-muted-foreground/80">
                        Alterar Status:
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {/* 1. Pendente */}
                        <button
                          type="button"
                          disabled={estaCarregandoLinha || ag.status === "Pendente"}
                          onClick={() => handleStatus(ag.id, "Pendente")}
                          title="Definir como Pendente"
                          className={`py-2 px-1 rounded-xl text-[11px] font-body font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
                            ag.status === "Pendente"
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-extrabold ring-1 ring-amber-500/40"
                              : "bg-secondary/60 hover:bg-amber-500/10 hover:text-amber-600 text-muted-foreground"
                          }`}
                        >
                          <Clock size={14} />
                          <span className="truncate text-[10px]">Pendente</span>
                        </button>

                        {/* 2. Confirmado */}
                        <button
                          type="button"
                          disabled={estaCarregandoLinha || ag.status === "Confirmado"}
                          onClick={() => handleStatus(ag.id, "Confirmado")}
                          title="Confirmar Agendamento"
                          className={`py-2 px-1 rounded-xl text-[11px] font-body font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
                            ag.status === "Confirmado"
                              ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 font-extrabold ring-1 ring-blue-500/40"
                              : "bg-secondary/60 hover:bg-blue-500/10 hover:text-blue-600 text-muted-foreground"
                          }`}
                        >
                          <Check size={14} />
                          <span className="truncate text-[10px]">Confirmar</span>
                        </button>

                        {/* 3. Finalizado */}
                        <button
                          type="button"
                          disabled={estaCarregandoLinha || ag.status === "Finalizado"}
                          onClick={() => handleStatus(ag.id, "Finalizado")}
                          title="Finalizar Consulta Realizada"
                          className={`py-2 px-1 rounded-xl text-[11px] font-body font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
                            ag.status === "Finalizado"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-extrabold ring-1 ring-emerald-500/40"
                              : "bg-secondary/60 hover:bg-emerald-500/10 hover:text-emerald-600 text-muted-foreground"
                          }`}
                        >
                          <ShieldCheck size={14} />
                          <span className="truncate text-[10px]">Finalizar</span>
                        </button>

                        {/* 4. Cancelado */}
                        <button
                          type="button"
                          disabled={estaCarregandoLinha || ag.status === "Cancelado"}
                          onClick={() => handleStatus(ag.id, "Cancelado")}
                          title="Cancelar Agendamento"
                          className={`py-2 px-1 rounded-xl text-[11px] font-body font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
                            ag.status === "Cancelado"
                              ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 font-extrabold ring-1 ring-rose-500/40"
                              : "bg-secondary/60 hover:bg-rose-500/10 hover:text-rose-600 text-muted-foreground"
                          }`}
                        >
                          <X size={14} />
                          <span className="truncate text-[10px]">Cancelar</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          /* ── MODO 2: TABELA GERENCIAL MODERNA ── */
          <div className="bg-card rounded-3xl border border-border/50 shadow-floating overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/30 text-[11px] font-body font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-4 px-5">Paciente</th>
                    <th className="py-4 px-4">Serviço</th>
                    <th className="py-4 px-4">Data & Horário</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Ações de Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25 font-body text-xs">
                  {agendamentosFiltrados.map((ag) => {
                    const config = statusConfig[ag.status];
                    const estaCarregandoLinha = statusLoadingId === ag.id;

                    return (
                      <tr
                        key={ag.id}
                        className="hover:bg-secondary/20 transition-colors group"
                      >
                        {/* Paciente */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-sm shrink-0">
                              {ag.nomeCliente.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => setAgendamentoDetalhes(ag)}
                                className="font-display font-bold text-foreground hover:text-primary transition-colors text-sm text-left block"
                              >
                                {ag.nomeCliente}
                              </button>
                              {ag.telefone && (
                                <span className="text-[11px] text-muted-foreground">
                                  {ag.telefone}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Serviço */}
                        <td className="py-3.5 px-4 font-semibold text-foreground">
                          {ag.servico}
                        </td>

                        {/* Data & Horário */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {ag.data === format(new Date(), "yyyy-MM-dd")
                                ? "Hoje"
                                : format(parseISO(ag.data), "dd/MM/yyyy")}
                            </span>
                            <span className="text-[11px] font-bold text-primary inline-flex items-center gap-1">
                              <Clock size={11} />
                              {ag.horario}
                            </span>
                          </div>
                        </td>

                        {/* Status Atual */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${config.bgBadge} ${config.textoBadge} ${config.bordaBadge}`}
                          >
                            {estaCarregandoLinha ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              config.icone
                            )}
                            <span>{config.label}</span>
                          </span>
                        </td>

                        {/* 🛡️ Ações Rápidas de Mudança de Status */}
                        <td className="py-3.5 px-5 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* Botão Confirmar */}
                            <button
                              type="button"
                              disabled={estaCarregandoLinha || ag.status === "Confirmado"}
                              onClick={() => handleStatus(ag.id, "Confirmado")}
                              title="Confirmar"
                              className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                ag.status === "Confirmado"
                                  ? "bg-blue-500/20 text-blue-700 ring-1 ring-blue-500/40"
                                  : "hover:bg-blue-500/15 text-muted-foreground hover:text-blue-600 bg-secondary/50"
                              }`}
                            >
                              <Check size={15} />
                            </button>

                            {/* Botão Finalizar */}
                            <button
                              type="button"
                              disabled={estaCarregandoLinha || ag.status === "Finalizado"}
                              onClick={() => handleStatus(ag.id, "Finalizado")}
                              title="Finalizar"
                              className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                ag.status === "Finalizado"
                                  ? "bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40"
                                  : "hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-600 bg-secondary/50"
                              }`}
                            >
                              <ShieldCheck size={15} />
                            </button>

                            {/* Botão Cancelar */}
                            <button
                              type="button"
                              disabled={estaCarregandoLinha || ag.status === "Cancelado"}
                              onClick={() => handleStatus(ag.id, "Cancelado")}
                              title="Cancelar"
                              className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                ag.status === "Cancelado"
                                  ? "bg-rose-500/20 text-rose-700 ring-1 ring-rose-500/40"
                                  : "hover:bg-rose-500/15 text-muted-foreground hover:text-rose-600 bg-secondary/50"
                              }`}
                            >
                              <X size={15} />
                            </button>

                            {/* Botão Voltar para Pendente */}
                            <button
                              type="button"
                              disabled={estaCarregandoLinha || ag.status === "Pendente"}
                              onClick={() => handleStatus(ag.id, "Pendente")}
                              title="Reabrir como Pendente"
                              className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                ag.status === "Pendente"
                                  ? "bg-amber-500/20 text-amber-700 ring-1 ring-amber-500/40"
                                  : "hover:bg-amber-500/15 text-muted-foreground hover:text-amber-600 bg-secondary/50"
                              }`}
                            >
                              <Clock size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
