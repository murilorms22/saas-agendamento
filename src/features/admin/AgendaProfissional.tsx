/**
 * AgendaProfissional — Tela de gestão de agenda do profissional.
 *
 * Contém duas abas:
 *  1. Calendário Semanal — visualização dos agendamentos na semana
 *  2. Disponibilidade — configurar horários de atendimento e bloqueios
 */

import { useState, useEffect, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameDay,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Settings2,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  X,
  Lock,
  CalendarOff,
  LayoutGrid,
  Columns,
  CalendarDays,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { useAuth } from "../../contexts/AuthContext";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { ModalNovoAgendamento } from "../../components/ModalNovoAgendamento";
import { ModalDetalhesAgendamento } from "../../components/ModalDetalhesAgendamento";
import confetti from "canvas-confetti";

// ──────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────

type StatusAgendamento = "Pendente" | "Confirmado" | "Finalizado" | "Cancelado";

interface AgendamentoSemana {
  id: string;
  data: string; // ISO: "2026-09-01"
  horario: string;
  nomeCliente: string;
  telefone?: string;
  servico: string;
  status: StatusAgendamento;
}

interface HorarioDia {
  ativo: boolean;
  inicio: string;
  fim: string;
  temIntervalo?: boolean;
  intervaloInicio?: string;
  intervaloFim?: string;
}

interface Bloqueio {
  id: string;
  data: string; // ISO
  motivo: string;
}

type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

const DIAS: { chave: DiaSemana; label: string }[] = [
  { chave: "seg", label: "Segunda" },
  { chave: "ter", label: "Terça" },
  { chave: "qua", label: "Quarta" },
  { chave: "qui", label: "Quinta" },
  { chave: "sex", label: "Sexta" },
  { chave: "sab", label: "Sábado" },
  { chave: "dom", label: "Domingo" },
];

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function gerarDiasDoMes(mesAtual: Date): Date[] {
  const inicioMes = startOfMonth(mesAtual);
  const fimMes = endOfMonth(inicioMes);
  const inicioGrade = startOfWeek(inicioMes, { locale: ptBR });
  const fimGrade = endOfWeek(fimMes, { locale: ptBR });

  const dias: Date[] = [];
  let d = inicioGrade;
  while (d <= fimGrade) {
    dias.push(d);
    d = addDays(d, 1);
  }
  return dias;
}

// ──────────────────────────────────────────────────────────────
// Mapeador de Agendamento do Banco (Supabase)
// ──────────────────────────────────────────────────────────────

function mapearAgendamentoSemana(
  row: any,
  servicos: { id: number | string; nome: string }[]
): AgendamentoSemana {
  const servicoNome =
    row.servico_nome ??
    row.servico ??
    servicos.find((s) => String(s.id) === String(row.servico_id))?.nome ??
    "Consulta";

  // Extrai data: se row.data estiver nulo, extrai de data_hora_agendamento
  let dataFinal = row.data ?? row.data_agendamento;
  if (!dataFinal && row.data_hora_agendamento) {
    dataFinal = String(row.data_hora_agendamento).split("T")[0];
  }
  if (!dataFinal) {
    dataFinal = format(new Date(), "yyyy-MM-dd");
  }

  // Extrai horário: se row.horario estiver nulo, extrai de data_hora_agendamento
  let horarioFinal = row.horario ?? row.hora;
  if (!horarioFinal && row.data_hora_agendamento) {
    const parteHora = String(row.data_hora_agendamento).split("T")[1];
    if (parteHora) {
      horarioFinal = parteHora.slice(0, 5);
    }
  }
  if (!horarioFinal) {
    horarioFinal = "08:00";
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
    data: dataFinal,
    horario: horarioFinal,
    nomeCliente: nomeResolvido,
    telefone:
      row.whatsapp_cliente ??
      row.cliente_telefone ??
      row.telefone ??
      row.whatsapp ??
      cliTel ??
      "",
    servico: servicoNome,
    status: (row.status === "Confirmado" || row.status === "Finalizado" || row.status === "Cancelado"
      ? row.status
      : "Pendente") as StatusAgendamento,
  };
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Badge de Status (SOMENTE ÍCONE, com tooltip)
// ──────────────────────────────────────────────────────────────

function BadgeStatus({ status }: { status: StatusAgendamento }) {
  const estilos: Record<StatusAgendamento, { cor: string; icone: React.ReactNode; tooltip: string }> = {
    Pendente: { cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30", icone: <Clock size={12} />, tooltip: "Pendente" },
    Confirmado: { cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30", icone: <CheckCircle2 size={12} />, tooltip: "Confirmado" },
    Finalizado: { cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30", icone: <CheckCircle2 size={12} />, tooltip: "Finalizado" },
    Cancelado: { cor: "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/30", icone: <X size={12} />, tooltip: "Cancelado" },
  };
  const { cor, icone, tooltip } = estilos[status] ?? estilos.Pendente;
  return (
    <span
      title={`Status: ${tooltip}`}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cor} shrink-0 cursor-help transition-all shadow-xs`}
    >
      {icone}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Mini Animação de Puff / Fumaça ao excluir agendamento
// ──────────────────────────────────────────────────────────────

function EfeitoPuffFumaca() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30 overflow-visible">
      {/* 1. Pulso central de fumaça inicial */}
      <motion.div
        initial={{ scale: 0.1, opacity: 0.95 }}
        animate={{ scale: [0.1, 1.4, 2.2], opacity: [0.95, 0.6, 0] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-14 h-14 rounded-full bg-slate-300/90 dark:bg-slate-400/80 blur-[2px] absolute shadow-lg"
      />
      {/* 2. Círculo de expansão rápida / onda de choque */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0.8 }}
        animate={{ scale: [0.2, 1.8, 2.6], opacity: [0.8, 0.3, 0] }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-16 h-16 rounded-full border-2 border-slate-300 dark:border-slate-400 blur-[1px] absolute"
      />
      {/* 3. Partículas e nuvenzinhas em puff saindo radialmente */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const dist = 32 + (i % 2 === 0 ? 12 : 0);
        const x = Math.cos(rad) * dist;
        const y = Math.sin(rad) * dist;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0.6, opacity: 1 }}
            animate={{
              x,
              y,
              scale: [0.6, 1.3, 0],
              opacity: [1, 0.8, 0],
            }}
            transition={{
              duration: 0.52,
              ease: "easeOut",
              delay: 0.02 + (i % 3) * 0.015,
            }}
            className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-300 blur-[1px] absolute shadow-sm"
          />
        );
      })}
      {/* 4. Estrelinhas / sparkles mágicos de poof */}
      {[30, 110, 190, 260].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const dist = 38;
        const x = Math.cos(rad) * dist;
        const y = Math.sin(rad) * dist;
        return (
          <motion.div
            key={`sparkle-${i}`}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{
              x,
              y,
              scale: [0, 1.4, 0],
              opacity: [1, 0.9, 0],
              rotate: 180,
            }}
            transition={{ duration: 0.48, ease: "easeOut", delay: 0.04 }}
            className="absolute text-amber-400 font-black text-xs select-none"
          >
            ✦
          </motion.div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Card de Agendamento na grade semanal
// ──────────────────────────────────────────────────────────────

function CardAgendamento({
  ag,
  isExcluindo,
  onVerDetalhes,
}: {
  ag: AgendamentoSemana;
  isExcluindo?: boolean;
  onVerDetalhes: (ag: AgendamentoSemana) => void;
}) {
  const fundos: Record<StatusAgendamento, string> = {
    Confirmado: "bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50",
    Pendente: "bg-amber-500/10 border-amber-500/25 hover:border-amber-500/50",
    Finalizado: "bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50",
    Cancelado: "bg-rose-500/5 border-rose-500/15 opacity-50",
  };

  return (
    <motion.div
      layout
      id={`card-agendamento-${ag.id}`}
      onClick={() => !isExcluindo && onVerDetalhes(ag)}
      animate={
        isExcluindo
          ? {
              scale: [1, 1.06, 0.85, 0],
              opacity: [1, 1, 0.4, 0],
              filter: ["blur(0px)", "blur(1px)", "blur(6px)", "blur(12px)"],
              transition: { duration: 0.5, ease: "easeInOut" },
            }
          : { opacity: 1, scale: 1, filter: "blur(0px)" }
      }
      exit={{
        opacity: 0,
        scale: 0,
        height: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      transition={{
        layout: { type: "spring", stiffness: 350, damping: 26 },
      }}
      className={`w-full text-left p-2.5 rounded-xl border transition-colors text-xs cursor-pointer group hover:shadow-md hover:-translate-y-0.5 relative overflow-visible ${
        fundos[ag.status]
      }`}
      title="Clique para ver detalhes e editar este agendamento"
    >
      {isExcluindo && <EfeitoPuffFumaca />}
      <p className="font-display font-bold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
        {ag.nomeCliente}
      </p>
      <p className="font-body text-muted-foreground truncate mt-0.5 text-[11px]">{ag.servico}</p>
      <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-border/15">
        <span className="text-[10px] font-body text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          Detalhes →
        </span>
        {/* Em baixo na direita, ao lado do horário */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-body font-bold text-foreground flex items-center gap-1 text-[11px]">
            <Clock size={10} className="text-primary" /> {ag.horario}
          </span>
          <BadgeStatus status={ag.status} />
        </div>
      </div>
    </motion.div>
  );
}



// ──────────────────────────────────────────────────────────────
// Aba 1: Visualizador de Agenda (Dia, Semana & Mês)
// ──────────────────────────────────────────────────────────────

type ModoVisualizacao = "dia" | "semana" | "mes";

const HORAS_DIA = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
  "19:00", "20:00"
];

interface VisualizadorAgendaProps {
  agendamentos: AgendamentoSemana[];
  onAdicionarAgendamento?: (novo: AgendamentoSemana) => void;
  onAtualizarAgendamento?: (editado: AgendamentoSemana) => void;
  onExcluirAgendamento?: (id: string) => void;
  onAtualizarStatus?: (id: string, novoStatus: StatusAgendamento) => void;
}

function VisualizadorAgenda({
  agendamentos,
  onAdicionarAgendamento,
  onAtualizarAgendamento,
  onExcluirAgendamento,
  onAtualizarStatus,
}: VisualizadorAgendaProps) {
  const { profissional } = useProfessional();
  const hoje = new Date();
  const [modo, setModo] = useState<ModoVisualizacao>("semana");
  const [dataRef, setDataRef] = useState<Date>(hoje);
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje);
  const [direcao, setDirecao] = useState<1 | -1 | 0>(0);

  // ── Carrossel Contínuo da Visão Semanal (Embla Carousel) ──
  const DIAS_PASSADO = 60;
  const DIAS_FUTURO = 120;
  const listaDiasCarrossel = useMemo(() => {
    const inicio = subDays(hoje, DIAS_PASSADO);
    const total = DIAS_PASSADO + DIAS_FUTURO;
    return Array.from({ length: total }, (_, i) => addDays(inicio, i));
  }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    slidesToScroll: 1,
    containScroll: false,
    dragFree: false,
    startIndex: DIAS_PASSADO,
    duration: 22,
  });

  const [primeiroDiaVisivelIdx, setPrimeiroDiaVisivelIdx] = useState(DIAS_PASSADO);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setPrimeiroDiaVisivelIdx(idx);
      const d = listaDiasCarrossel[idx];
      if (d) {
        setDataRef(d);
      }
    };
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, listaDiasCarrossel]);

  const diasVisiveisSemana = useMemo(() => {
    return listaDiasCarrossel.slice(primeiroDiaVisivelIdx, primeiroDiaVisivelIdx + 5);
  }, [listaDiasCarrossel, primeiroDiaVisivelIdx]);

  // Variantes de transição suave para trocas de abas e navegações em Dia/Mês
  const variantesTransicao: Variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 36 : direction < 0 ? -36 : 0,
      opacity: 0,
      scale: 0.985,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 320, damping: 28 },
        opacity: { duration: 0.22, ease: "easeOut" },
        scale: { duration: 0.22, ease: "easeOut" },
      },
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -36 : direction < 0 ? 36 : 0,
      opacity: 0,
      scale: 0.985,
      transition: {
        x: { type: "spring" as const, stiffness: 320, damping: 28 },
        opacity: { duration: 0.16, ease: "easeIn" },
        scale: { duration: 0.16, ease: "easeIn" },
      },
    }),
  };

  // Estado do Modal de Detalhes
  const [agendamentoDetalhes, setAgendamentoDetalhes] = useState<AgendamentoSemana | null>(null);

  // Estado da animação de puff/exclusão
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Estado do Modal de Edição (reutiliza ModalNovoAgendamento)
  const [agendamentoParaEditar, setAgendamentoParaEditar] = useState<AgendamentoSemana | null>(null);

  // Estado do Modal de Novo Agendamento
  const [modalNovo, setModalNovo] = useState<{ aberto: boolean; data: Date }>({
    aberto: false,
    data: hoje,
  });

  const abrirNovoAgendamento = (dia: Date) => {
    setAgendamentoParaEditar(null);
    setModalNovo({ aberto: true, data: dia });
    setDiaSelecionado(dia);
  };

  const handleEditarAgendamento = (ag: AgendamentoSemana) => {
    setAgendamentoDetalhes(null);
    setAgendamentoParaEditar(ag);
    setModalNovo({ aberto: true, data: parseISO(ag.data) });
  };

  const handleExcluirAgendamento = async (id: string) => {
    // 1. Fecha o modal de detalhes para o usuário ver o card na agenda
    setAgendamentoDetalhes(null);

    // 2. Ativa o estado de exclusão com puff
    setExcluindoId(id);

    // 3. Dispara partículas canvas-confetti a partir da posição exata do card
    try {
      const el = document.getElementById(`card-agendamento-${id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;
        confetti({
          particleCount: 28,
          spread: 70,
          startVelocity: 13,
          ticks: 45,
          gravity: 0.85,
          origin: { x, y },
          colors: ["#94a3b8", "#cbd5e1", "#f1f5f9", "#e2e8f0", "#38bdf8", "#fbbf24"],
          shapes: ["circle"],
          scalar: 0.65,
        });
      }
    } catch (e) {
      console.warn("Erro ao disparar partículas de puff:", e);
    }

    // 4. Segura o tempo visual do puff
    await new Promise((res) => setTimeout(res, 520));

    // 5. Exclui o card (os próximos cards sobem suavemente com spring layout)
    if (onExcluirAgendamento) {
      onExcluirAgendamento(id);
    }
    setExcluindoId(null);
  };

  // Abre a visão detalhada de um dia específico hora a hora
  const abrirDiaDetalhado = (dia: Date) => {
    setDataRef(dia);
    setDiaSelecionado(dia);
    setModo("dia");
  };

  // ── Helpers de data ──────────────────────────────────────────
  const diasDoMes = gerarDiasDoMes(dataRef);

  const agsPorData = (data: Date) =>
    agendamentos
      .filter((ag) => isSameDay(parseISO(ag.data), data))
      .sort((a, b) => a.horario.localeCompare(b.horario));

  // Agendamentos no mês atual exibido
  const agsDoMes = agendamentos.filter((ag) =>
    isSameMonth(parseISO(ag.data), dataRef)
  );
  const confirmadosNoMes = agsDoMes.filter((a) => a.status === "Confirmado").length;
  const pendentesNoMes = agsDoMes.filter((a) => a.status === "Pendente").length;

  // Agendamentos do dia selecionado (para o modo dia e o painel de detalhes no modo mês)
  const agsDoDiaSelecionado = agsPorData(diaSelecionado);

  // ── Navegação (No modo semana avança 1 dia no carrossel de forma contínua) ──
  const navegarAnterior = () => {
    setDirecao(-1);
    if (modo === "dia") {
      const d = subDays(diaSelecionado, 1);
      setDataRef(d);
      setDiaSelecionado(d);
    } else if (modo === "semana") {
      if (emblaApi) {
        emblaApi.scrollPrev();
      }
    } else {
      setDataRef((d) => subMonths(d, 1));
    }
  };

  const navegarProximo = () => {
    setDirecao(1);
    if (modo === "dia") {
      const d = addDays(diaSelecionado, 1);
      setDataRef(d);
      setDiaSelecionado(d);
    } else if (modo === "semana") {
      if (emblaApi) {
        emblaApi.scrollNext();
      }
    } else {
      setDataRef((d) => addMonths(d, 1));
    }
  };

  const irParaHoje = () => {
    setDirecao(0);
    setDataRef(hoje);
    setDiaSelecionado(hoje);
    if (modo === "semana" && emblaApi) {
      const idxHoje = listaDiasCarrossel.findIndex((d) => isSameDay(d, hoje));
      if (idxHoje !== -1) {
        emblaApi.scrollTo(idxHoje);
      }
    }
  };

  const abrirDiaNaSemana = (dia: Date) => {
    setDirecao(0);
    setDataRef(dia);
    setDiaSelecionado(dia);
    setModo("semana");
    if (emblaApi) {
      const idx = listaDiasCarrossel.findIndex((d) => isSameDay(d, dia));
      if (idx !== -1) {
        setTimeout(() => emblaApi.scrollTo(idx, false), 50);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Modal de Detalhes do Agendamento (com lápis de edição e confirmação de exclusão) ── */}
      <AnimatePresence>
        {agendamentoDetalhes && (
          <ModalDetalhesAgendamento
            agendamento={agendamentoDetalhes}
            onFechar={() => setAgendamentoDetalhes(null)}
            onEditar={(ag) => handleEditarAgendamento(ag as AgendamentoSemana)}
            onExcluir={handleExcluirAgendamento}
            onAtualizarStatus={onAtualizarStatus}
          />
        )}
      </AnimatePresence>

      {/* ── Modal de Novo / Editar Agendamento ── */}
      <AnimatePresence>
        {modalNovo.aberto && (
          <ModalNovoAgendamento
            aberto={modalNovo.aberto}
            data={modalNovo.data}
            agendamentoInicial={agendamentoParaEditar}
            empresaId={profissional?.id}
            onFechar={() => {
              setModalNovo((prev) => ({ ...prev, aberto: false }));
              setAgendamentoParaEditar(null);
            }}
            onSalvar={(novo) => {
              if (agendamentoParaEditar && onAtualizarAgendamento) {
                onAtualizarAgendamento(novo);
              } else if (onAdicionarAgendamento) {
                onAdicionarAgendamento(novo);
              }
              setAgendamentoParaEditar(null);
              setDiaSelecionado(parseISO(novo.data));
            }}
            servicos={profissional?.servicos ?? []}
            horariosDisponiveis={
              profissional?.horariosDisponiveis ?? [
                "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
              ]
            }
          />
        )}
      </AnimatePresence>

      {/* ── Barra Superior: Título + Seletor de Modo + Navegação ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 p-4 rounded-2xl border border-border/30 shadow-soft">
        <div>
          {modo === "dia" ? (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground capitalize flex items-center gap-2">
                <Clock size={20} className="text-primary" />
                {format(diaSelecionado, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </h2>
              <div className="flex items-center gap-3 text-xs font-body text-muted-foreground mt-1">
                <span><strong>{agsDoDiaSelecionado.length}</strong> consulta(s) hoje</span>
                <span>•</span>
                <span className="text-emerald-500 font-semibold">
                  {agsDoDiaSelecionado.filter((a) => a.status === "Confirmado").length} confirmadas
                </span>
                <span>•</span>
                <span className="text-amber-500 font-semibold">
                  {agsDoDiaSelecionado.filter((a) => a.status === "Pendente").length} pendentes
                </span>
              </div>
            </div>
          ) : modo === "semana" ? (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">
                {diasVisiveisSemana.length > 0 ? (
                  <>
                    {format(diasVisiveisSemana[0], "dd 'de' MMMM", { locale: ptBR })}
                    {" "}a{" "}
                    {format(diasVisiveisSemana[diasVisiveisSemana.length - 1], "dd 'de' MMMM", { locale: ptBR })}
                  </>
                ) : (
                  "Semana"
                )}
              </h2>
              <p className="text-xs font-body text-muted-foreground mt-0.5">
                Exibindo 5 dias contínuos • Deslize ou use as setas para rolar dia a dia
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground capitalize flex items-center gap-2">
                <CalendarDays size={20} className="text-primary" />
                {format(dataRef, "MMMM 'de' yyyy", { locale: ptBR })}
              </h2>
              <div className="flex items-center gap-3 text-xs font-body text-muted-foreground mt-1">
                <span><strong>{agsDoMes.length}</strong> consultas no mês</span>
                <span>•</span>
                <span className="text-emerald-500 font-semibold">{confirmadosNoMes} confirmadas</span>
                <span>•</span>
                <span className="text-amber-500 font-semibold">{pendentesNoMes} pendentes</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          {/* Seletor Dia / Semana / Mês */}
          <div className="flex items-center bg-secondary/50 p-1 rounded-xl border border-border/30">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setDirecao(0);
                setModo("dia");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                modo === "dia"
                  ? "bg-card text-primary shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock size={14} />
              Dia (Hora a hora)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setDirecao(0);
                setModo("semana");
                if (emblaApi) {
                  const idx = listaDiasCarrossel.findIndex((d) => isSameDay(d, dataRef));
                  if (idx !== -1) {
                    setTimeout(() => emblaApi.scrollTo(idx, false), 50);
                  }
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                modo === "semana"
                  ? "bg-card text-primary shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns size={14} />
              Semana
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setDirecao(0);
                setModo("mes");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                modo === "mes"
                  ? "bg-card text-primary shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid size={14} />
              Mês
            </motion.button>
          </div>

          {/* Navegação Prev / Hoje / Next */}
          <div className="flex gap-1.5 items-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={navegarAnterior}
              aria-label="Anterior"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={irParaHoje}
              className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary font-body font-bold text-xs hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Hoje
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={navegarProximo}
              aria-label="Próximo"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── Conteúdo Conforme o Modo Ativo (com animação direcional fluida) ── */}
      <AnimatePresence mode="wait" custom={direcao}>
        {modo === "dia" ? (
          /* ── VISÃO DIÁRIA DETALHADA (Hora por Hora) ── */
          <motion.div
            key={`visao-dia-${format(diaSelecionado, "yyyy-MM-dd")}`}
            custom={direcao}
            variants={variantesTransicao}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-4"
          >
            {/* Barra de Ações Rápidas do Dia */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/80 p-4 rounded-2xl border border-border/30 shadow-soft">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setDirecao(0);
                    setModo("semana");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-body font-bold transition-all hover:-translate-x-0.5 cursor-pointer shadow-sm"
                >
                  <ChevronLeft size={14} />
                  Voltar para a Semana
                </button>
                <div className="h-4 w-[1px] bg-border/40" />
                <span className="font-body text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Clock size={13} className="text-primary" />
                  Grade de atendimento hora a hora
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => abrirNovoAgendamento(diaSelecionado)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  Novo agendamento neste dia
                </button>
              </div>
            </div>

            {/* Timeline Hora por Hora */}
            <div className="bg-card rounded-3xl border border-border/40 divide-y divide-border/20 shadow-floating overflow-hidden">
              {HORAS_DIA.map((hora) => {
                const horaPrefixo = hora.split(":")[0];
                const agsNestaHora = agsDoDiaSelecionado.filter((ag) => {
                  const agHora = ag.horario.split(":")[0];
                  return agHora === horaPrefixo;
                });

                return (
                  <div
                    key={hora}
                    className="flex flex-col sm:flex-row items-start sm:items-stretch group/linha hover:bg-secondary/15 transition-colors"
                  >
                    {/* Indicador de Horário */}
                    <div className="w-full sm:w-28 p-3 sm:p-4 bg-secondary/20 sm:border-r border-border/20 flex sm:flex-col items-center sm:items-start justify-between sm:justify-center shrink-0">
                      <span className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
                        <Clock size={14} className="text-primary" />
                        {hora}
                      </span>
                      <span className="text-[10px] font-body text-muted-foreground">
                        {agsNestaHora.length === 0
                          ? "Livre"
                          : `${agsNestaHora.length} consulta${agsNestaHora.length > 1 ? "s" : ""}`}
                      </span>
                    </div>

                    {/* Conteúdo do Horário */}
                    <div className="flex-1 p-3 sm:p-4 w-full">
                      {agsNestaHora.length > 0 ? (
                        <div className="space-y-2">
                          <AnimatePresence mode="popLayout">
                            {agsNestaHora.map((ag) => {
                              const fundos: Record<StatusAgendamento, string> = {
                                Confirmado: "bg-emerald-500/10 border-emerald-500/25",
                                Pendente: "bg-amber-500/10 border-amber-500/25",
                                Finalizado: "bg-emerald-500/10 border-emerald-500/25",
                                Cancelado: "bg-rose-500/10 border-rose-500/25 opacity-60",
                              };

                              return (
                                <motion.div
                                  layout
                                  key={ag.id}
                                  id={`card-agendamento-${ag.id}`}
                                  animate={
                                    excluindoId === ag.id
                                      ? {
                                          scale: [1, 1.05, 0.85, 0],
                                          opacity: [1, 1, 0.3, 0],
                                          filter: ["blur(0px)", "blur(2px)", "blur(8px)", "blur(14px)"],
                                          transition: { duration: 0.5, ease: "easeInOut" },
                                        }
                                      : { opacity: 1, scale: 1, filter: "blur(0px)" }
                                  }
                                  exit={{
                                    opacity: 0,
                                    scale: 0,
                                    height: 0,
                                    marginBottom: 0,
                                    paddingTop: 0,
                                    paddingBottom: 0,
                                    transition: { duration: 0.35, ease: "easeInOut" },
                                  }}
                                  transition={{
                                    layout: { type: "spring", stiffness: 350, damping: 26 },
                                  }}
                                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs relative overflow-visible ${
                                    fundos[ag.status as StatusAgendamento]
                                  }`}
                                >
                                  {excluindoId === ag.id && <EfeitoPuffFumaca />}
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-display font-bold text-sm text-foreground">
                                        {ag.nomeCliente}
                                      </span>
                                      <BadgeStatus status={ag.status} />
                                    </div>
                                    <p className="text-xs font-body text-muted-foreground flex items-center gap-2">
                                      <span>{ag.servico}</span>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-center">
                                    <button
                                        type="button"
                                        onClick={() => handleEditarAgendamento(ag)}
                                        className="text-[11px] font-body font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                                        title="Editar consulta"
                                      >
                                        <Pencil size={12} />
                                        <span>Editar</span>
                                      </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      ) : (
                        /* Slot de Horário Livre */
                        <div
                          onClick={() => abrirNovoAgendamento(diaSelecionado)}
                          className="w-full min-h-[46px] rounded-xl border border-dashed border-border/40 hover:border-primary/60 hover:bg-primary/5 flex items-center justify-between px-4 transition-all cursor-pointer group/slot"
                        >
                          <span className="font-body text-xs text-muted-foreground/50 group-hover/slot:text-primary transition-colors">
                            Horário livre para atendimento
                          </span>
                          <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center gap-1 text-xs font-body font-bold text-primary">
                            <Plus size={14} /> Agendar às {hora}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : modo === "semana" ? (
          /* ── VISÃO SEMANAL: CARROSSEL CONTÍNUO DIA A DIA (Embla Carousel) ── */
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl -mx-1 px-1 py-1" ref={emblaRef}>
              <div className="flex -ml-3.5 touch-pan-y">
                {listaDiasCarrossel.map((dia) => {
                  const ags = agsPorData(dia);
                  const ehHoje = isSameDay(dia, hoje);

                  return (
                    <div
                      key={format(dia, "yyyy-MM-dd")}
                      className="flex-[0_0_100%] sm:flex-[0_0_50%] md:flex-[0_0_33.333%] lg:flex-[0_0_20%] min-w-0 pl-3.5 select-none"
                    >
                      <div
                        onDoubleClick={() => abrirNovoAgendamento(dia)}
                        className="group relative flex flex-col gap-2 min-h-[220px] h-full bg-card/40 hover:bg-card/70 p-2.5 rounded-2xl border border-border/20 hover:border-primary/40 transition-all shadow-sm"
                        title="Clique no cabeçalho para abrir o dia ou dê duplo clique para agendar"
                      >
                        {/* Cabeçalho do Dia */}
                        <button
                          type="button"
                          onClick={() => abrirDiaDetalhado(dia)}
                          className={`text-center py-2 px-1 rounded-xl transition-all cursor-pointer group/header hover:scale-[1.03] hover:shadow-md ${
                            ehHoje
                              ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                              : "bg-secondary/40 text-foreground hover:bg-primary/10 hover:text-primary"
                          }`}
                          title="Clique para abrir a visão hora a hora deste dia"
                        >
                          <div className="font-body text-[10px] font-bold uppercase tracking-wider opacity-75 group-hover/header:opacity-100 flex items-center justify-center gap-0.5">
                            <span>{format(dia, "EEE", { locale: ptBR })}</span>
                            <ArrowRight size={10} className="opacity-0 group-hover/header:opacity-100 transition-opacity" />
                          </div>
                          <div className="font-display font-extrabold text-lg leading-none mt-0.5">
                            {format(dia, "d")}
                          </div>
                        </button>

                        {/* Botão Hover '+ Novo agendamento' na Semana */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirNovoAgendamento(dia);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1 w-full py-1.5 px-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-body font-bold text-[11px] shadow-sm cursor-pointer"
                        >
                          <Plus size={13} />
                          Novo agendamento
                        </button>

                        {/* Agendamentos do Dia */}
                        <div className="flex flex-col gap-2 flex-1">
                          {ags.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center py-4">
                              <span className="text-[11px] font-body text-muted-foreground/40 text-center">
                                Sem consultas
                              </span>
                            </div>
                          ) : (
                            <AnimatePresence mode="popLayout">
                              {ags.map((ag) => (
                                <CardAgendamento
                                  key={ag.id}
                                  ag={ag}
                                  isExcluindo={excluindoId === ag.id}
                                  onVerDetalhes={(selecionado) => setAgendamentoDetalhes(selecionado)}
                                />
                              ))}
                            </AnimatePresence>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ── VISÃO MENSAL EXPANDIDA (Grade Completa com Transição Fluida) ── */
          <motion.div
            key={`visao-mes-${format(dataRef, "yyyy-MM")}`}
            custom={direcao}
            variants={variantesTransicao}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-6"
          >
            <div className="bg-card rounded-3xl border border-border/40 p-4 md:p-6 shadow-floating">
              {/* Dias da Semana (Cabeçalho da Grade) */}
              <div className="grid grid-cols-7 mb-2 text-center">
                {["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map(
                  (d, i) => (
                    <div
                      key={i}
                      className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider py-2"
                    >
                      <span className="hidden md:inline">{d}</span>
                      <span className="md:hidden">{d.slice(0, 3)}</span>
                    </div>
                  )
                )}
              </div>

              {/* Grade de Dias do Mês */}
              <div className="grid grid-cols-7 gap-1.5 md:gap-2">
                {diasDoMes.map((dia) => {
                  const ags = agsPorData(dia);
                  const ehHoje = isSameDay(dia, hoje);
                  const ehSelecionado = isSameDay(dia, diaSelecionado);
                  const mesCorrente = isSameMonth(dia, dataRef);
                  const temAgendamentos = ags.length > 0;

                  return (
                    <div
                      key={dia.toString()}
                      onClick={() => setDiaSelecionado(dia)}
                      onDoubleClick={() => abrirNovoAgendamento(dia)}
                      className={`group min-h-[95px] md:min-h-[120px] p-2 rounded-2xl border text-left transition-all flex flex-col justify-between relative cursor-pointer ${
                        !mesCorrente ? "opacity-35 bg-secondary/20 border-transparent" : "bg-background/80"
                      } ${
                        ehSelecionado
                          ? "border-primary ring-2 ring-primary/40 shadow-sm bg-primary/5"
                          : "border-border/30 hover:border-primary/40 hover:bg-secondary/30"
                      }`}
                      title="Clique para ver detalhes ou duplo clique para agendar"
                    >
                      {/* Topo da Célula: Número do Dia + Badge de Qtd */}
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`inline-flex items-center justify-center text-xs font-display font-bold w-6 h-6 rounded-full transition-colors ${
                            ehHoje
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : ehSelecionado
                              ? "text-primary font-extrabold"
                              : "text-foreground"
                          }`}
                        >
                          {format(dia, "d")}
                        </span>

                        {temAgendamentos && (
                          <span className="text-[10px] font-body font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {ags.length}
                          </span>
                        )}
                      </div>

                      {/* Lista de Consultas resumidas no Dia */}
                      <div className="w-full space-y-1 my-1 overflow-hidden flex-1">
                        {ags.slice(0, 2).map((ag) => {
                          const dotCor =
                            ag.status === "Confirmado" || ag.status === "Finalizado"
                              ? "bg-emerald-500"
                              : ag.status === "Cancelado"
                              ? "bg-rose-500"
                              : "bg-amber-500";
                          return (
                            <div
                              key={ag.id}
                              className="text-[10px] font-body truncate px-1.5 py-0.5 rounded-md bg-secondary/60 text-foreground flex items-center gap-1 leading-tight"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCor}`} />
                              <span className="font-semibold">{ag.horario}</span>
                              <span className="truncate opacity-80">{ag.nomeCliente.split(" ")[0]}</span>
                            </div>
                          );
                        })}
                        {ags.length > 2 && (
                          <div className="text-[9px] font-body font-bold text-muted-foreground pl-1">
                            +{ags.length - 2} mais
                          </div>
                        )}
                      </div>

                      {/* Botão Hover '+ Novo agendamento' no Mês */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirNovoAgendamento(dia);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1 w-full py-1 px-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-body font-bold text-[10px] shadow-sm mt-auto cursor-pointer"
                        title="Novo agendamento para este dia"
                      >
                        <Plus size={11} />
                        Novo agendamento
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Painel de Detalhes do Dia Selecionado ── */}
            <div className="bg-card rounded-3xl border border-border/40 p-6 shadow-floating">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/20">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-primary" />
                    <h3 className="text-lg font-display font-bold text-foreground capitalize">
                      Consultas de {format(diaSelecionado, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h3>
                  </div>
                  <p className="text-xs font-body text-muted-foreground mt-0.5">
                    {agsDoDiaSelecionado.length === 0
                      ? "Nenhum agendamento marcado para esta data."
                      : `${agsDoDiaSelecionado.length} agendamento(s) encontrado(s)`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  <button
                    onClick={() => abrirDiaDetalhado(diaSelecionado)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-body font-bold text-xs transition-all shadow-sm cursor-pointer"
                  >
                    <Clock size={14} />
                    Ver hora por hora
                  </button>
                  <button
                    onClick={() => abrirNovoAgendamento(diaSelecionado)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-body font-bold text-xs transition-all shadow-soft cursor-pointer"
                  >
                    <Plus size={14} />
                    Novo agendamento
                  </button>
                  <button
                    onClick={() => abrirDiaNaSemana(diaSelecionado)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-body font-bold text-xs transition-all shadow-sm cursor-pointer"
                  >
                    Abrir na visão semanal
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Lista detalhada dos agendamentos do dia selecionado */}
              <div className="mt-4">
                {agsDoDiaSelecionado.length === 0 ? (
                  <div className="py-8 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground mb-2">
                      <CalendarOff size={22} />
                    </div>
                    <p className="font-body text-sm font-semibold text-foreground">
                      Dia livre de agendamentos
                    </p>
                    <p className="font-body text-xs text-muted-foreground mt-1 mb-4">
                      Nenhuma consulta agendada para {format(diaSelecionado, "dd/MM/yyyy")}.
                    </p>
                    <button
                      onClick={() => abrirNovoAgendamento(diaSelecionado)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-body font-bold text-xs transition-all cursor-pointer"
                    >
                      <Plus size={14} />
                      Agendar consulta neste dia
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {agsDoDiaSelecionado.map((ag) => {
                      const fundosMesCard: Record<StatusAgendamento, string> = {
                        Confirmado: "bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50",
                        Pendente: "bg-amber-500/10 border-amber-500/25 hover:border-amber-500/50",
                        Finalizado: "bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50",
                        Cancelado: "bg-rose-500/5 border-rose-500/15 opacity-50",
                      };
                      return (
                        <div
                          key={ag.id}
                          onClick={() => setAgendamentoDetalhes(ag)}
                          className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all cursor-pointer group ${
                            fundosMesCard[ag.status] ?? fundosMesCard.Pendente
                          }`}
                          title="Clique para ver detalhes completos e editar"
                        >
                        <div>
                          <p className="font-display font-bold text-foreground text-base group-hover:text-primary transition-colors">
                            {ag.nomeCliente}
                          </p>
                          <p className="font-body text-xs text-muted-foreground mt-0.5">
                            {ag.servico}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2.5 border-t border-border/20">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditarAgendamento(ag);
                              }}
                              className="text-[11px] font-body text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil size={11} /> Editar
                            </button>
                            <button
                              onClick={() => setAgendamentoDetalhes(ag)}
                              className="text-[11px] font-body text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>

                          {/* Em baixo na direita, ao lado do horário */}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <span className="font-display font-bold text-xs text-foreground flex items-center gap-1">
                              <Clock size={12} className="text-primary" />
                              {ag.horario}
                            </span>
                            <BadgeStatus status={ag.status} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legenda de Cores ── */}
      <div className="flex items-center gap-6 pt-4 border-t border-border/20">
        <span className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Legenda:
        </span>
        {(
          [
            ["Confirmado", "bg-emerald-500"],
            ["Pendente", "bg-amber-500"],
          ] as const
        ).map(([label, cor]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cor}`} />
            <span className="font-body text-xs font-semibold text-foreground/80">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Aba 2: Configurar Disponibilidade
// ──────────────────────────────────────────────────────────────

interface ConfigurarDisponibilidadeProps {
  onSalvo?: () => void;
}

function ConfigurarDisponibilidade({ onSalvo }: ConfigurarDisponibilidadeProps) {
  const { profissional, refetch } = useProfessional();
  const { user } = useAuth();

  const horariosPadrao: Record<DiaSemana, HorarioDia> = {
    seg: { ativo: true, inicio: "08:00", fim: "18:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    ter: { ativo: true, inicio: "08:00", fim: "18:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    qua: { ativo: true, inicio: "08:00", fim: "17:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    qui: { ativo: true, inicio: "08:00", fim: "18:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    sex: { ativo: true, inicio: "08:00", fim: "17:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    sab: { ativo: false, inicio: "09:00", fim: "13:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
    dom: { ativo: false, inicio: "09:00", fim: "12:00", temIntervalo: false, intervaloInicio: "12:00", intervaloFim: "13:00" },
  };

  const [horarios, setHorarios] = useState<Record<DiaSemana, HorarioDia>>(() => {
    if (profissional?.disponibilidade?.horarios) {
      return profissional.disponibilidade.horarios;
    }
    try {
      const cache = localStorage.getItem(`disponibilidade_${profissional?.id}`);
      if (cache) {
        const p = JSON.parse(cache);
        if (p.horarios) return p.horarios;
      }
    } catch (e) {}
    return horariosPadrao;
  });

  const [bloqueios, setBloqueios] = useState<Bloqueio[]>(() => {
    if (profissional?.disponibilidade?.bloqueios) {
      return profissional.disponibilidade.bloqueios;
    }
    try {
      const cache = localStorage.getItem(`disponibilidade_${profissional?.id}`);
      if (cache) {
        const p = JSON.parse(cache);
        if (p.bloqueios) return p.bloqueios;
      }
    } catch (e) {}
    return [];
  });

  // Sincroniza se a store carregar ou atualizar posteriormente
  useEffect(() => {
    if (profissional?.disponibilidade?.horarios) {
      setHorarios(profissional.disponibilidade.horarios);
    }
    if (profissional?.disponibilidade?.bloqueios) {
      setBloqueios(profissional.disponibilidade.bloqueios);
    }
  }, [profissional?.disponibilidade]);

  const [novoBloqueioData, setNovoBloqueioData] = useState("");
  const [novoBloqueioMotivo, setNovoBloqueioMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const toggleDia = (dia: DiaSemana) => {
    setHorarios((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], ativo: !prev[dia].ativo },
    }));
  };

  const atualizarHorario = (dia: DiaSemana, campo: "inicio" | "fim", valor: string) => {
    setHorarios((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], [campo]: valor },
    }));
  };

  const ativarIntervalo = (dia: DiaSemana) => {
    setHorarios((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        temIntervalo: true,
        intervaloInicio: prev[dia].intervaloInicio || "12:00",
        intervaloFim: prev[dia].intervaloFim || "13:00",
      },
    }));
  };

  const desativarIntervalo = (dia: DiaSemana) => {
    setHorarios((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        temIntervalo: false,
      },
    }));
  };

  const atualizarIntervalo = (dia: DiaSemana, campo: "intervaloInicio" | "intervaloFim", valor: string) => {
    setHorarios((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        [campo]: valor,
      },
    }));
  };

  const adicionarBloqueio = () => {
    if (!novoBloqueioData || !novoBloqueioMotivo.trim()) return;
    const novo: Bloqueio = {
      id: `b${Date.now()}`,
      data: novoBloqueioData,
      motivo: novoBloqueioMotivo.trim(),
    };
    setBloqueios((prev) => [...prev, novo].sort((a, b) => a.data.localeCompare(b.data)));
    setNovoBloqueioData("");
    setNovoBloqueioMotivo("");
  };

  const removerBloqueio = (id: string) => {
    setBloqueios((prev) => prev.filter((b) => b.id !== id));
  };

  const salvar = async () => {
    if (!profissional?.id) return;
    setSalvando(true);

    const payload = {
      horarios,
      bloqueios,
    };

    // 1. Salva em cache local imediatamente para persistência garantida
    try {
      localStorage.setItem(`disponibilidade_${profissional.id}`, JSON.stringify(payload));
    } catch (e) {
      console.warn("Erro ao salvar no localStorage:", e);
    }

    // 2. Salva no banco Supabase na tabela empresas
    try {
      let query = supabase
        .from("empresas")
        .update({
          disponibilidade: payload,
        })
        .eq("id", profissional.id);

      if (user?.id) {
        query = query.or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`);
      }

      const { error } = await query;
      if (error) {
        console.warn("[AgendaProfissional] Aviso ao salvar no banco:", error.message);
      } else {
        refetch();
      }
    } catch (err) {
      console.error("[AgendaProfissional] Erro inesperado ao salvar disponibilidade:", err);
    } finally {
      setSalvando(false);
      setSalvo(true);
      setTimeout(() => {
        setSalvo(false);
        onSalvo?.();
      }, 600);
    }
  };

  return (
    <div className="space-y-8">

      {/* ── Seção 1: Horários por Dia da Semana ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Clock size={16} />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Horários de Atendimento</h3>
            <p className="text-xs font-body text-muted-foreground">
              Defina os dias, horários e intervalos em que você atende
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {DIAS.map(({ chave, label }) => {
            const dia = horarios[chave];
            return (
              <div
                key={chave}
                className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border transition-all ${
                  dia.ativo
                    ? "bg-card border-border/30"
                    : "bg-secondary/20 border-border/10 opacity-60"
                }`}
              >
                {/* Toggle + Nome do Dia */}
                <div className="flex items-center gap-3 sm:w-36">
                  <button
                    onClick={() => toggleDia(chave)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                      dia.ativo ? "bg-primary" : "bg-secondary"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                        dia.ativo ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="font-body font-bold text-sm text-foreground">{label}</span>
                </div>

                {/* Inputs de Horário e Intervalo */}
                {dia.ativo ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="font-body text-xs text-muted-foreground">Das</label>
                        <input
                          type="time"
                          value={dia.inicio}
                          onChange={(e) => atualizarHorario(chave, "inicio", e.target.value)}
                          className="px-3 py-2 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="font-body text-xs text-muted-foreground">às</label>
                        <input
                          type="time"
                          value={dia.fim}
                          onChange={(e) => atualizarHorario(chave, "fim", e.target.value)}
                          className="px-3 py-2 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                        />
                      </div>

                      {/* Transição animada: botão desce e some -> intervalo surge vindo de cima */}
                      <AnimatePresence mode="wait">
                        {!dia.temIntervalo ? (
                          <motion.button
                            key={`btn-intervalo-${chave}`}
                            type="button"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
                            onClick={() => ativarIntervalo(chave)}
                            className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-body font-bold text-xs transition-all hover:underline cursor-pointer py-1.5 px-2.5 rounded-lg"
                          >
                            <Plus size={14} className="stroke-[2.5]" />
                            <span>Configurar intervalo</span>
                          </motion.button>
                        ) : (
                          <motion.div
                            key={`bloco-intervalo-${chave}`}
                            initial={{ opacity: 0, y: -14 }}
                            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                            exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
                            className="flex items-center gap-2.5"
                          >
                            <span className="text-border/80 font-light mx-0.5 hidden sm:inline select-none">|</span>
                            <label className="font-body text-xs font-bold text-muted-foreground whitespace-nowrap">
                              Intervalo:
                            </label>
                            <input
                              type="time"
                              value={dia.intervaloInicio ?? "12:00"}
                              onChange={(e) => atualizarIntervalo(chave, "intervaloInicio", e.target.value)}
                              className="px-2.5 py-2 rounded-xl bg-background border border-border font-body text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground shadow-2xs"
                            />
                            <span className="font-body text-xs text-muted-foreground">até</span>
                            <input
                              type="time"
                              value={dia.intervaloFim ?? "13:00"}
                              onChange={(e) => atualizarIntervalo(chave, "intervaloFim", e.target.value)}
                              className="px-2.5 py-2 rounded-xl bg-background border border-border font-body text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground shadow-2xs"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Na extremidade direita dessa mesma linha: botão para eliminar aquele intervalo */}
                    <AnimatePresence>
                      {dia.temIntervalo && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          type="button"
                          onClick={() => desativarIntervalo(chave)}
                          className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-auto cursor-pointer flex items-center gap-1.5 text-xs font-body font-semibold shrink-0"
                          title="Eliminar intervalo deste dia"
                        >
                          <Trash2 size={15} />
                          <span className="hidden md:inline">Eliminar intervalo</span>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <span className="font-body text-xs text-muted-foreground italic">
                    Sem atendimento
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Seção 2: Bloqueios de Data ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <CalendarOff size={16} />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Bloqueios e Folgas</h3>
            <p className="text-xs font-body text-muted-foreground">
              Datas em que você não atenderá (feriados, férias, eventos)
            </p>
          </div>
        </div>

        {/* Adicionar Novo Bloqueio */}
        <div className="bg-card rounded-2xl border border-border/30 p-5 mb-4">
          <p className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
            Adicionar Bloqueio
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={novoBloqueioData}
              onChange={(e) => setNovoBloqueioData(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
              className="px-4 py-3 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
            />
            <input
              type="text"
              placeholder="Motivo (ex: Feriado, Férias...)"
              value={novoBloqueioMotivo}
              onChange={(e) => setNovoBloqueioMotivo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionarBloqueio()}
              className="flex-1 px-4 py-3 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground"
            />
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={adicionarBloqueio}
              disabled={!novoBloqueioData || !novoBloqueioMotivo.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none shrink-0 cursor-pointer"
            >
              <Plus size={16} />
              Adicionar
            </motion.button>
          </div>
        </div>

        {/* Lista de Bloqueios */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {bloqueios.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-10 text-center"
              >
                <Lock size={32} className="text-muted-foreground/30 mb-3" />
                <p className="font-body text-sm text-muted-foreground">
                  Nenhum bloqueio cadastrado
                </p>
              </motion.div>
            ) : (
              bloqueios.map((bloqueio) => (
                <motion.div
                  key={bloqueio.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                      <CalendarOff size={16} className="text-rose-500" />
                    </div>
                    <div>
                      <p className="font-body font-bold text-sm text-foreground capitalize">
                        {format(parseISO(bloqueio.data), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                      <p className="font-body text-xs text-muted-foreground mt-0.5">
                        {bloqueio.motivo}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removerBloqueio(bloqueio.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Botão Salvar ── */}
      <div className="sticky bottom-0 pt-4 pb-2 border-t border-border/20 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <p className="font-body text-xs text-muted-foreground">
            As alterações serão aplicadas imediatamente após salvar.
          </p>
          <motion.button
            whileHover={salvando ? {} : { scale: 1.03, y: -2 }}
            whileTap={salvando ? {} : { scale: 0.97 }}
            onClick={salvar}
            disabled={salvando}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-body font-bold text-sm shadow-soft hover:shadow-soft-lg transition-all cursor-pointer
              ${salvo
                ? "bg-emerald-500 text-white"
                : "bg-primary text-primary-foreground"
              }
              ${salvando ? "opacity-70 cursor-not-allowed transform-none shadow-none" : ""}`}
          >
            {salvando && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {salvo && <CheckCircle2 size={16} />}
            {salvando ? "Salvando..." : salvo ? "Salvo com sucesso!" : "Salvar Configurações"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Componente Principal
// ──────────────────────────────────────────────────────────────

type Aba = "calendario" | "disponibilidade";

export default function AgendaProfissional() {
  return <PageLoader><AgendaConteudo /></PageLoader>;
}

function AgendaConteudo() {
  const { profissional } = useProfessional();
  const [abaAtiva, setAbaAtiva] = useState<Aba>("calendario");
  const [agendamentos, setAgendamentos] = useState<AgendamentoSemana[]>([]);

  // Busca agendamentos reais do Supabase e escuta alterações em tempo real
  useEffect(() => {
    if (!profissional?.id) return;
    const profId = profissional.id;
    const profServicos = profissional.servicos;

    async function carregar() {
      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*, clientes(nome, telefone)")
          .eq("empresa_id", profId);

        if (!error && data) {
          const mapeados = data.map((r: any) =>
            mapearAgendamentoSemana(r, profServicos)
          );
          setAgendamentos(mapeados);
        }
      } catch (err) {
        console.error("Erro ao carregar agendamentos do Supabase:", err);
      }
    }

    carregar();

    // 1. Re-carrega automaticamente quando o usuário volta para a aba
    const handleFocus = () => {
      carregar();
    };
    window.addEventListener("focus", handleFocus);

    // 2. Sincronização em tempo real via Supabase Realtime (escopo estrito da empresa)
    const channel = supabase
      .channel(`agenda-mudancas-realtime-${profId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${profId}`,
        },
        () => {
          carregar();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [profissional?.id, profissional?.servicos]);

  // Ouve eventos de agendamentos criados localmente (ex: pelo botão da sidebar ou modal)
  useEffect(() => {
    const handleAgendamentoCriado = (e: any) => {
      if (e.detail) {
        setAgendamentos((prev) => {
          if (prev.some((a) => a.id === e.detail.id)) return prev;
          const mapeado = mapearAgendamentoSemana(e.detail, profissional?.servicos ?? []);
          return [...prev, mapeado];
        });
      }
    };
    window.addEventListener("agendamento-criado", handleAgendamentoCriado);
    return () => window.removeEventListener("agendamento-criado", handleAgendamentoCriado);
  }, [profissional?.servicos]);

  const handleAdicionarAgendamento = async (novo: AgendamentoSemana) => {
    // Trava de segurança: verifica se já existe agendamento ativo nesse horário
    const conflitoExistente = agendamentos.find(
      (a) => a.data === novo.data && a.horario === novo.horario && a.id !== novo.id && a.status !== "Cancelado"
    );

    if (conflitoExistente) {
      alert(`Trava de segurança: O horário das ${novo.horario} em ${novo.data} já está reservado para ${conflitoExistente.nomeCliente}!`);
      return;
    }

    // Atualização otimista
    setAgendamentos((prev) => [...prev, novo]);

    if (!profissional?.id) return;

    try {
      const dataHoraIso = `${novo.data}T${novo.horario}:00Z`;
      const { data, error } = await supabase
        .from("agendamentos")
        .insert({
          empresa_id: profissional.id,
          nome_cliente: novo.nomeCliente,
          whatsapp_cliente: novo.telefone || "",
          cliente_telefone: novo.telefone || "",
          servico_nome: novo.servico,
          data: novo.data,
          horario: novo.horario,
          data_hora_agendamento: dataHoraIso,
          status: novo.status,
        })
        .select()
        .single();

      if (!error && data) {
        setAgendamentos((prev) =>
          prev.map((a) => (a.id === novo.id ? { ...a, id: String(data.id) } : a))
        );
      }
    } catch (err) {
      console.error("Erro ao salvar agendamento no Supabase:", err);
    }
  };

  const handleAtualizarAgendamento = async (editado: AgendamentoSemana) => {
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao atualizar agendamento.");
      return;
    }

    // Trava de segurança: verifica se a alteração de horário colide com outro agendamento
    const conflitoExistente = agendamentos.find(
      (a) => a.data === editado.data && a.horario === editado.horario && a.id !== editado.id && a.status !== "Cancelado"
    );

    if (conflitoExistente) {
      alert(`Trava de segurança: O horário das ${editado.horario} em ${editado.data} já está reservado para ${conflitoExistente.nomeCliente}!`);
      return;
    }

    // Atualização otimista
    setAgendamentos((prev) =>
      prev.map((a) => (a.id === editado.id ? editado : a))
    );

    // Persiste no Supabase com trava de escopo
    try {
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
        })
        .eq("id", editado.id)
        .eq("empresa_id", profissional.id);
    } catch (err) {
      console.error("Erro ao atualizar agendamento no Supabase:", err);
    }
  };

  const handleExcluirAgendamento = async (id: string) => {
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao excluir agendamento.");
      return;
    }

    // Atualização otimista (remove da agenda)
    setAgendamentos((prev) => prev.filter((a) => a.id !== id));

    // Exclui da tabela agendamentos com trava de escopo
    try {
      await supabase
        .from("agendamentos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", profissional.id);
    } catch (err) {
      console.error("Erro ao excluir agendamento do Supabase:", err);
    }
  };

  const handleAtualizarStatus = async (id: string, novoStatus: StatusAgendamento) => {
    if (!profissional?.id) {
      console.error("[Segurança] Contexto da empresa ausente ao atualizar status.");
      return;
    }

    // Atualização otimista
    setAgendamentos((prev) =>
      prev.map((ag) => (ag.id === id ? { ...ag, status: novoStatus } : ag))
    );

    // Persiste no Supabase com trava de escopo
    try {
      await supabase
        .from("agendamentos")
        .update({ status: novoStatus })
        .eq("id", id)
        .eq("empresa_id", profissional.id);
    } catch (err) {
      console.error("Erro ao atualizar status no Supabase:", err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Cabeçalho da Página com ação na extrema direita */}
      <header className="border-b border-border/20 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={`header-title-${abaAtiva}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
          >
            <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
              {abaAtiva === "calendario" ? "Minha Agenda" : "Disponibilidade"}
            </h1>
            <p className="text-muted-foreground font-body text-sm font-medium mt-1">
              {abaAtiva === "calendario"
                ? "Visualize e gerencie seus agendamentos por semana ou mês"
                : "Defina seus horários de atendimento semanal e bloqueios de datas"}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Ação na extrema direita: animada igual ao intervalo (desce e some / surge vindo de cima) */}
        <AnimatePresence mode="wait">
          {abaAtiva === "calendario" ? (
            <motion.button
              key="btn-configurar-disponibilidade"
              type="button"
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
              exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAbaAtiva("disponibilidade")}
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-body font-bold text-sm transition-colors hover:underline self-start sm:self-center py-2 px-3 rounded-xl hover:bg-primary/5 cursor-pointer"
            >
              <Settings2 size={18} />
              <span>Configurar disponibilidade</span>
            </motion.button>
          ) : (
            <motion.button
              key="btn-minha-agenda"
              type="button"
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
              exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAbaAtiva("calendario")}
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-body font-bold text-sm transition-colors hover:underline self-start sm:self-center py-2 px-3 rounded-xl hover:bg-primary/5 cursor-pointer"
            >
              <Calendar size={18} />
              <span>Minha agenda</span>
            </motion.button>
          )}
        </AnimatePresence>
      </header>

      {/* Conteúdo da Aba */}
      <AnimatePresence mode="wait">
        {abaAtiva === "calendario" && (
          <motion.div
            key="calendario"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <VisualizadorAgenda
              agendamentos={agendamentos}
              onAdicionarAgendamento={handleAdicionarAgendamento}
              onAtualizarAgendamento={handleAtualizarAgendamento}
              onExcluirAgendamento={handleExcluirAgendamento}
              onAtualizarStatus={handleAtualizarStatus}
            />
          </motion.div>
        )}

        {abaAtiva === "disponibilidade" && (
          <motion.div
            key="disponibilidade"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <ConfigurarDisponibilidade onSalvo={() => setAbaAtiva("calendario")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
