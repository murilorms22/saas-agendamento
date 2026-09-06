import { useState, useEffect, useMemo } from "react";
import { format, isThisWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Clock,
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
  Pencil,
  ArrowUpDown,
  Filter,
  X,
  FileText,
  RotateCcw,
  CalendarDays,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import {
  ModalEdicaoAgendamento,
  type AgendamentoItem,
  type StatusAgendamento,
} from "../../components/ModalEdicaoAgendamento";

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

export type Status = StatusAgendamento;

export type Agendamento = {
  id: string;
  nomeCliente: string;
  telefone?: string;
  servico: string;
  horario: string;
  data: string;
  status: Status;
  observacoes?: string;
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

  // 🛡️ Auto-finalização de horários expirados
  if (statusFinal === "Confirmado") {
    try {
      const [ano, mesNum, diaNum] = dataFinal.split("-").map(Number);
      const [horaNum, minNum] = horarioFinal.split(":").map(Number);
      const dataHoraInicio = new Date(ano, mesNum - 1, diaNum, horaNum, minNum);
      if (dataHoraInicio < new Date()) {
        statusFinal = "Finalizado";
      }
    } catch (e) {}
  }

  const cliNome = Array.isArray((row as any).clientes)
    ? (row as any).clientes[0]?.nome
    : (row as any).clientes?.nome;
  const cliTel = Array.isArray((row as any).clientes)
    ? (row as any).clientes[0]?.telefone
    : (row as any).clientes?.telefone;

  const nomeResolvido =
    row.nome_cliente ||
    row.cliente_nome ||
    row.nome ||
    cliNome ||
    "Paciente";

  return {
    id: String(row.id),
    nomeCliente: nomeResolvido,
    telefone:
      row.whatsapp_cliente ??
      row.cliente_telefone ??
      row.telefone ??
      row.whatsapp ??
      cliTel ??
      "",
    servico: servicoNome,
    horario: horarioFinal,
    data: dataFinal,
    status: statusFinal,
    observacoes: row.observacoes ?? row.notas ?? row.notas_clinicas ?? row.descricao ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Configurações Visuais de Status
// ─────────────────────────────────────────────────────────────────────────────

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
    icone: <Clock size={13} />,
    label: "Pendente",
  },
  Confirmado: {
    corBorda: "border-l-blue-500",
    bgBadge: "bg-blue-500/10",
    textoBadge: "text-blue-700 dark:text-blue-300",
    bordaBadge: "border-blue-500/20",
    icone: <CheckCircle2 size={13} />,
    label: "Confirmado",
  },
  Finalizado: {
    corBorda: "border-l-emerald-500",
    bgBadge: "bg-emerald-500/10",
    textoBadge: "text-emerald-700 dark:text-emerald-300",
    bordaBadge: "border-emerald-500/20",
    icone: <ShieldCheck size={13} />,
    label: "Finalizado",
  },
  Cancelado: {
    corBorda: "border-l-rose-500",
    bgBadge: "bg-rose-500/10",
    textoBadge: "text-rose-700 dark:text-rose-300",
    bordaBadge: "border-rose-500/20",
    icone: <XCircle size={13} />,
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

  // Filtros e controles de ordenação
  const [periodoFiltro, setPeriodoFiltro] = useState<"todos" | "hoje" | "semana">("todos");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | Status>("todos");
  const [ordenacao, setOrdenacao] = useState<"recentes" | "antigos" | "nome">("recentes");
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

  // Estado do Modal Unificado de Edição
  const [agendamentoParaEditar, setAgendamentoParaEditar] = useState<Agendamento | null>(null);

  const handleAbrirEdicao = (ag: Agendamento) => {
    setAgendamentoParaEditar(ag);
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
    setAgendamentoParaEditar(null);
  };

  const handleSalvarEdicao = async (editado: AgendamentoItem) => {
    // 🛡️ Guard Clause Estrita
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao editar agendamento.");
      return;
    }
    setAgendamentos((prev) =>
      prev.map((a) => (a.id === editado.id ? ({ ...a, ...editado } as Agendamento) : a))
    );
    try {
      // 🛡️ Trava Dupla contra IDOR
      const dataHoraIso = `${editado.data}T${editado.horario}:00Z`;
      await supabase
        .from("agendamentos")
        .update({
          nome_cliente: editado.nomeCliente,
          whatsapp_cliente: editado.telefone || "",
          cliente_telefone: editado.telefone || "",
          servico_nome: editado.servico,
          data: editado.data,
          horario: editado.horario,
          data_hora_agendamento: dataHoraIso,
          status: editado.status,
          observacoes: editado.observacoes || null,
        })
        .eq("id", editado.id)
        .eq("empresa_id", profissional.id);
      exibirToast("Agendamento atualizado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar edição de agendamento:", err);
      exibirToast("Falha ao salvar alterações.", "error");
    }
    setAgendamentoParaEditar(null);
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
          .select("*, clientes(nome, telefone)")
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

  // Filtros em Memória (Período + Status + Busca) e Ordenação
  const agendamentosFiltrados = useMemo(() => {
    let lista = [...agendamentos];

    // 1. Filtro de Período
    if (periodoFiltro === "hoje") {
      const hojeStr = format(new Date(), "yyyy-MM-dd");
      lista = lista.filter((a) => a.data === hojeStr);
    } else if (periodoFiltro === "semana") {
      lista = lista.filter((a) => {
        try {
          return isThisWeek(parseISO(a.data), { weekStartsOn: 1 });
        } catch {
          return false;
        }
      });
    }

    // 2. Filtro de Status
    if (statusFiltro !== "todos") {
      lista = lista.filter((a) => a.status === statusFiltro);
    }

    // 3. Busca por Nome ou Telefone ou Serviço
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      const termoNum = busca.replace(/\D/g, "");
      lista = lista.filter((a) => {
        const matchNome = a.nomeCliente.toLowerCase().includes(termo);
        const matchServico = a.servico.toLowerCase().includes(termo);
        const matchTel = a.telefone
          ? a.telefone.replace(/\D/g, "").includes(termoNum)
          : false;
        return matchNome || matchServico || (termoNum.length > 0 && matchTel);
      });
    }

    // 4. Classificar por
    lista.sort((a, b) => {
      if (ordenacao === "nome") {
        return a.nomeCliente.localeCompare(b.nomeCliente, "pt-BR");
      }
      const dtA = `${a.data}T${a.horario}:00`;
      const dtB = `${b.data}T${b.horario}:00`;
      if (ordenacao === "antigos") {
        return dtA.localeCompare(dtB);
      }
      // "recentes" (Data decrescente)
      return dtB.localeCompare(dtA);
    });

    return lista;
  }, [agendamentos, periodoFiltro, statusFiltro, busca, ordenacao]);

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

  const limparFiltros = () => {
    setBusca("");
    setStatusFiltro("todos");
    setPeriodoFiltro("todos");
    setOrdenacao("recentes");
  };

  const temFiltroAtivo =
    busca.trim() !== "" ||
    statusFiltro !== "todos" ||
    periodoFiltro !== "todos" ||
    ordenacao !== "recentes";

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
              className="ml-2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Unificado de Edição de Agendamento ── */}
      <AnimatePresence>
        {agendamentoParaEditar && (
          <ModalEdicaoAgendamento
            aberto={Boolean(agendamentoParaEditar)}
            agendamento={agendamentoParaEditar}
            empresaId={profissional?.id}
            servicos={servicos as any}
            horariosDisponiveis={
              profissional?.horariosDisponiveis ?? [
                "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
              ]
            }
            onFechar={() => setAgendamentoParaEditar(null)}
            onSalvar={handleSalvarEdicao}
            onExcluir={handleExcluir}
          />
        )}
      </AnimatePresence>

      {/* ── Cabeçalho Principal com Métricas ── */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-body font-bold bg-primary/10 text-primary border border-primary/20">
              <CalendarDays size={13} />
              {periodoFiltro === "hoje"
                ? `Hoje • ${format(new Date(), "dd 'de' MMMM", { locale: ptBR })}`
                : periodoFiltro === "semana"
                ? "Agendamentos desta semana"
                : "Histórico Completo de Agendamentos"}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
            Gestão de Agendamentos
          </h1>
          <p className="text-muted-foreground font-body text-xs sm:text-sm font-medium mt-1">
            Histórico completo de consultas: pesquise, filtre e edite atendimentos com facilidade.
          </p>
        </div>

        {/* Cards de Métricas do Período */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
          {/* Pendentes */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Pendente" ? "todos" : "Pendente")}
            className={`p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 shadow-soft cursor-pointer ${
              statusFiltro === "Pendente"
                ? "bg-amber-500/15 border-amber-500/40 ring-2 ring-amber-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <span className="text-lg font-display font-bold text-foreground leading-none block">
                {contadores.pendentes}
              </span>
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Pendentes
              </span>
            </div>
          </button>

          {/* Confirmados */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Confirmado" ? "todos" : "Confirmado")}
            className={`p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 shadow-soft cursor-pointer ${
              statusFiltro === "Confirmado"
                ? "bg-blue-500/15 border-blue-500/40 ring-2 ring-blue-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <span className="text-lg font-display font-bold text-foreground leading-none block">
                {contadores.confirmados}
              </span>
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Confirmados
              </span>
            </div>
          </button>

          {/* Finalizados */}
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "Finalizado" ? "todos" : "Finalizado")}
            className={`p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 shadow-soft cursor-pointer ${
              statusFiltro === "Finalizado"
                ? "bg-emerald-500/15 border-emerald-500/40 ring-2 ring-emerald-500/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div>
              <span className="text-lg font-display font-bold text-foreground leading-none block">
                {contadores.finalizados}
              </span>
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Finalizados
              </span>
            </div>
          </button>

          {/* Total do Período */}
          <button
            type="button"
            onClick={() => setStatusFiltro("todos")}
            className={`p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 shadow-soft cursor-pointer ${
              statusFiltro === "todos"
                ? "bg-primary/10 border-primary/30 ring-2 ring-primary/20"
                : "bg-card/70 border-border/50 hover:bg-card"
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <User size={18} />
            </div>
            <div>
              <span className="text-lg font-display font-bold text-foreground leading-none block">
                {contadores.total}
              </span>
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider">
                Total
              </span>
            </div>
          </button>
        </div>
      </header>

      {/* ── Barra de Controle Superior: Busca, Filtro de Status, Ordenação e Período ── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 bg-card/70 p-4 rounded-3xl border border-border/50 shadow-soft backdrop-blur-sm">
        {/* 1. Input de Busca em Tempo Real */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome do paciente ou telefone..."
            className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-background border border-border text-xs sm:text-sm font-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted-foreground/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 2. Select Filtrar por Status */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[150px]">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as any)}
              className="w-full pl-8 pr-3 py-2.5 rounded-2xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer"
              title="Filtrar por Status"
            >
              <option value="todos">Todos os Status</option>
              <option value="Confirmado">Confirmados</option>
              <option value="Pendente">Pendentes</option>
              <option value="Finalizado">Finalizados</option>
              <option value="Cancelado">Cancelados</option>
            </select>
          </div>

          {/* 3. Select Classificar por (Ordenação) */}
          <div className="relative min-w-[180px]">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as any)}
              className="w-full pl-8 pr-3 py-2.5 rounded-2xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer"
              title="Classificar agendamentos"
            >
              <option value="recentes">Mais recentes primeiro</option>
              <option value="antigos">Mais antigos primeiro</option>
              <option value="nome">Nome do paciente (A-Z)</option>
            </select>
          </div>
        </div>

        {/* 4. Filtro Rápido de Período e Modo de Exibição */}
        <div className="flex items-center justify-between lg:justify-end gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/30">
          {/* Toggle de Período */}
          <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-2xl border border-border/40 shrink-0">
            <button
              type="button"
              onClick={() => setPeriodoFiltro("todos")}
              className={`px-3 py-1.5 rounded-xl text-xs font-body font-bold transition-all cursor-pointer ${
                periodoFiltro === "todos"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setPeriodoFiltro("hoje")}
              className={`px-3 py-1.5 rounded-xl text-xs font-body font-bold transition-all cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-body font-bold transition-all cursor-pointer ${
                periodoFiltro === "semana"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semana
            </button>
          </div>

          {/* Alternador de Modo: Cards vs Tabela */}
          <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-2xl border border-border/40 shrink-0">
            <button
              type="button"
              onClick={() => setModoVisualizacao("cards")}
              title="Visualização em Cards"
              className={`p-2 rounded-xl text-xs font-body transition-all cursor-pointer ${
                modoVisualizacao === "cards"
                  ? "bg-background text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setModoVisualizacao("tabela")}
              title="Visualização em Tabela"
              className={`p-2 rounded-xl text-xs font-body transition-all cursor-pointer ${
                modoVisualizacao === "tabela"
                  ? "bg-background text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TableIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Informação de Resultados Filtrados / Botão Limpar ── */}
      {temFiltroAtivo && (
        <div className="flex items-center justify-between text-xs font-body text-muted-foreground px-1">
          <span>
            Exibindo <strong>{agendamentosFiltrados.length}</strong> de{" "}
            <strong>{agendamentos.length}</strong> agendamentos
          </span>
          <button
            type="button"
            onClick={limparFiltros}
            className="text-primary hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={12} />
            Limpar filtros
          </button>
        </div>
      )}

      {/* ── Conteúdo Principal: Cards ou Tabela ── */}
      <section>
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={36} className="animate-spin text-primary mb-3" />
            <p className="font-body text-sm font-semibold">Carregando histórico de agendamentos...</p>
          </div>
        ) : agendamentosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-card/40 rounded-3xl border border-border/40 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3.5">
              <CalendarOff size={28} />
            </div>
            <h3 className="font-display font-bold text-lg text-foreground">
              Nenhum agendamento encontrado
            </h3>
            <p className="font-body text-xs sm:text-sm text-muted-foreground max-w-md mt-1 mb-4">
              {busca
                ? `Nenhum agendamento corresponde à pesquisa "${busca}".`
                : statusFiltro !== "todos"
                ? `Não há agendamentos com status "${statusFiltro}" no filtro atual.`
                : "Não há consultas registradas para este critério de busca."}
            </p>
            {temFiltroAtivo && (
              <button
                type="button"
                onClick={limparFiltros}
                className="px-4 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw size={13} />
                <span>Limpar todos os filtros</span>
              </button>
            )}
          </div>
        ) : modoVisualizacao === "cards" ? (
          /* ── MODO 1: CARDS HISTÓRICOS MODERNOS ── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {agendamentosFiltrados.map((ag) => {
                const config = statusConfig[ag.status];

                return (
                  <motion.div
                    layout
                    key={ag.id}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.25 }}
                    className={`flex flex-col p-5 rounded-3xl bg-card border-l-4 ${config.corBorda} border border-border/50 shadow-floating relative transition-all group hover:shadow-lg`}
                  >
                    {/* Topo do Card: Paciente e Badge de Status */}
                    <div className="flex items-start justify-between gap-3 mb-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-base shrink-0 shadow-inner">
                          {ag.nomeCliente.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3
                            onClick={() => handleAbrirEdicao(ag)}
                            className="font-display font-bold text-base text-foreground hover:text-primary transition-colors truncate cursor-pointer leading-snug"
                            title="Clique para editar agendamento"
                          >
                            {ag.nomeCliente}
                          </h3>
                          <p className="font-body text-xs text-muted-foreground font-semibold truncate">
                            {ag.servico}
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status */}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-body font-bold border shrink-0 ${config.bgBadge} ${config.textoBadge} ${config.bordaBadge}`}
                      >
                        {config.icone}
                        <span>{config.label}</span>
                      </div>
                    </div>

                    {/* Informações: Data, Hora e Telefone */}
                    <div className="space-y-2 py-2.5 border-y border-border/25 my-1 text-xs font-body">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarIcon size={13} className="text-primary" />
                          <span className="font-medium">
                            {ag.data === format(new Date(), "yyyy-MM-dd")
                              ? "Hoje"
                              : format(parseISO(ag.data), "dd/MM/yyyy")}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 font-bold text-foreground bg-secondary/80 px-2.5 py-0.5 rounded-lg">
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

                      {/* Observações Clínicas (se houver) */}
                      {ag.observacoes && (
                        <div className="pt-1 text-[11px] text-muted-foreground bg-secondary/30 p-2 rounded-xl border border-border/20 flex items-start gap-1.5">
                          <FileText size={12} className="text-primary shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{ag.observacoes}</span>
                        </div>
                      )}
                    </div>

                    {/* Botão de Ação Único e Elegante: Editar / Ver Detalhes */}
                    <div className="pt-3 mt-auto">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleAbrirEdicao(ag)}
                        className="w-full py-2.5 px-3 rounded-xl bg-secondary/80 hover:bg-primary hover:text-primary-foreground text-foreground font-body font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer group shadow-2xs"
                        title="Editar agendamento completo"
                      >
                        <Pencil size={13} className="text-primary group-hover:text-primary-foreground transition-colors" />
                        <span>Editar / Ver Detalhes</span>
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          /* ── MODO 2: TABELA HISTÓRICA MODERNA ── */
          <div className="bg-card rounded-3xl border border-border/50 shadow-floating overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/30 text-[11px] font-body font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-4 px-5">Paciente</th>
                    <th className="py-4 px-4">Serviço</th>
                    <th className="py-4 px-4">Data & Horário</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25 font-body text-xs">
                  {agendamentosFiltrados.map((ag) => {
                    const config = statusConfig[ag.status];

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
                                onClick={() => handleAbrirEdicao(ag)}
                                className="font-display font-bold text-foreground hover:text-primary transition-colors text-sm text-left block cursor-pointer"
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
                          <div>
                            <span>{ag.servico}</span>
                            {ag.observacoes && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {ag.observacoes}
                              </p>
                            )}
                          </div>
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
                            {config.icone}
                            <span>{config.label}</span>
                          </span>
                        </td>

                        {/* Ação Única: Botão Editar */}
                        <td className="py-3.5 px-5 text-right">
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleAbrirEdicao(ag)}
                            title="Editar consulta"
                            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-primary hover:text-primary-foreground text-foreground font-body font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                          >
                            <Pencil size={12} />
                            <span>Editar</span>
                          </motion.button>
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
