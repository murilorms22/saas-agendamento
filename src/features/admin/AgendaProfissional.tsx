/**
 * AgendaProfissional — Tela de gestão de agenda do profissional.
 *
 * Contém duas abas:
 *  1. Calendário Semanal — visualização dos agendamentos na semana
 *  2. Disponibilidade — configurar horários de atendimento e bloqueios
 */

import { useState, useEffect } from "react";
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
  addWeeks,
  subWeeks,
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
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";

// ──────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────

type StatusAgendamento = "Pendente" | "Confirmado" | "Cancelado";

interface AgendamentoSemana {
  id: string;
  data: string; // ISO: "2026-09-01"
  horario: string;
  nomeCliente: string;
  servico: string;
  status: StatusAgendamento;
}

interface HorarioDia {
  ativo: boolean;
  inicio: string;
  fim: string;
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

function gerarSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
}

function inicioSemana(data: Date): Date {
  return startOfWeek(data, { locale: ptBR });
}

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
  servicos: { id: number; nome: string }[]
): AgendamentoSemana {
  const servicoNome =
    row.servico_nome ??
    row.servico ??
    servicos.find((s) => String(s.id) === String(row.servico_id))?.nome ??
    "Consulta";

  return {
    id: String(row.id),
    data: row.data ?? row.data_agendamento ?? format(new Date(), "yyyy-MM-dd"),
    horario: row.horario ?? row.hora ?? "08:00",
    nomeCliente: row.nome_cliente ?? row.cliente_nome ?? row.nome ?? "Cliente",
    servico: servicoNome,
    status: (row.status === "Confirmado" || row.status === "Cancelado"
      ? row.status
      : "Pendente") as StatusAgendamento,
  };
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Badge de Status
// ──────────────────────────────────────────────────────────────

function BadgeStatus({ status }: { status: StatusAgendamento }) {
  const estilos: Record<StatusAgendamento, { cor: string; icone: React.ReactNode }> = {
    Pendente: { cor: "bg-amber-500/10 text-amber-500", icone: <Clock size={12} /> },
    Confirmado: { cor: "bg-emerald-500/10 text-emerald-500", icone: <CheckCircle2 size={12} /> },
    Cancelado: { cor: "bg-rose-500/10 text-rose-500", icone: <X size={12} /> },
  };
  const { cor, icone } = estilos[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cor}`}>
      {icone} {status}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Card de Agendamento na grade semanal
// ──────────────────────────────────────────────────────────────

function CardAgendamento({ ag }: { ag: AgendamentoSemana }) {
  const [expandido, setExpandido] = useState(false);

  const fundos: Record<StatusAgendamento, string> = {
    Confirmado: "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/50",
    Pendente: "bg-primary/10 border-primary/20 hover:border-primary/50",
    Cancelado: "bg-rose-500/5 border-rose-500/10 opacity-50",
  };

  return (
    <motion.button
      layout
      onClick={() => setExpandido(!expandido)}
      className={`w-full text-left p-3 rounded-xl border transition-all text-xs ${fundos[ag.status]}`}
    >
      <p className="font-display font-bold text-foreground truncate leading-tight">{ag.nomeCliente}</p>
      <p className="font-body text-muted-foreground truncate mt-0.5">{ag.servico}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="font-body font-bold text-foreground flex items-center gap-1">
          <Clock size={10} /> {ag.horario}
        </span>
        <BadgeStatus status={ag.status} />
      </div>
      <AnimatePresence>
        {expandido && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 mt-2 pt-2 flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground font-body font-bold text-[10px] hover:opacity-90 transition-opacity"
              >
                Confirmar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="flex-1 py-1.5 rounded-lg bg-secondary text-foreground font-body font-bold text-[10px] hover:bg-destructive hover:text-destructive-foreground transition-all"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componente: Modal de Novo Agendamento
// ──────────────────────────────────────────────────────────────

function mascararTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

interface ModalNovoAgendamentoProps {
  aberto: boolean;
  data: Date;
  onFechar: () => void;
  onSalvar: (novo: AgendamentoSemana) => void;
  servicos: { id: number; nome: string; preco: string; duracao: string }[];
  horariosDisponiveis: string[];
}

function ModalNovoAgendamento({
  aberto,
  data,
  onFechar,
  onSalvar,
  servicos,
  horariosDisponiveis,
}: ModalNovoAgendamentoProps) {
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [servicoNome, setServicoNome] = useState(servicos[0]?.nome ?? "Consulta");
  const [horario, setHorario] = useState(horariosDisponiveis[0] ?? "08:00");
  const [status, setStatus] = useState<StatusAgendamento>("Confirmado");

  useEffect(() => {
    if (aberto) {
      setNomeCliente("");
      setTelefone("");
      setServicoNome(servicos[0]?.nome ?? "Consulta");
      setHorario(horariosDisponiveis[0] ?? "08:00");
      setStatus("Confirmado");
    }
  }, [aberto, data, servicos, horariosDisponiveis]);

  if (!aberto) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCliente.trim()) return;

    const novo: AgendamentoSemana = {
      id: `ag_${Date.now()}`,
      data: format(data, "yyyy-MM-dd"),
      horario,
      nomeCliente: nomeCliente.trim(),
      servico: servicoNome,
      status,
    };

    onSalvar(novo);
    onFechar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onFechar}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Janela do Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-md bg-card rounded-3xl p-6 md:p-8 shadow-floating border border-border/50"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-display font-bold text-foreground">
              Novo Agendamento
            </h3>
            <p className="text-xs font-body text-primary font-semibold mt-0.5 capitalize">
              {format(data, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <button
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Nome do Paciente / Cliente
            </label>
            <input
              type="text"
              required
              autoFocus
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              placeholder="Ex: João da Silva"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              WhatsApp / Telefone
            </label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              placeholder="(11) 99999-9999"
              maxLength={15}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Serviço
              </label>
              <select
                value={servicoNome}
                onChange={(e) => setServicoNome(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {servicos.map((s) => (
                  <option key={s.id} value={s.nome}>
                    {s.nome} ({s.preco})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Horário
              </label>
              <select
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {horariosDisponiveis.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Status Inicial
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus("Confirmado")}
                className={`flex-1 py-2 rounded-xl text-xs font-body font-bold transition-all border cursor-pointer ${
                  status === "Confirmado"
                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/40 shadow-sm"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                Confirmado
              </button>
              <button
                type="button"
                onClick={() => setStatus("Pendente")}
                className={`flex-1 py-2 rounded-xl text-xs font-body font-bold transition-all border cursor-pointer ${
                  status === "Pendente"
                    ? "bg-amber-500/15 text-amber-600 border-amber-500/40 shadow-sm"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                Pendente
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/20 mt-6">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-body font-bold text-xs shadow-soft transition-all cursor-pointer"
            >
              Salvar Agendamento
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Aba 1: Visualizador de Agenda (Semana & Mês)
// ──────────────────────────────────────────────────────────────

type ModoVisualizacao = "semana" | "mes";

interface VisualizadorAgendaProps {
  agendamentos: AgendamentoSemana[];
  onAdicionarAgendamento?: (novo: AgendamentoSemana) => void;
  onAtualizarStatus?: (id: string, novoStatus: StatusAgendamento) => void;
}

function VisualizadorAgenda({
  agendamentos,
  onAdicionarAgendamento,
  onAtualizarStatus,
}: VisualizadorAgendaProps) {
  const { profissional } = useProfessional();
  const hoje = new Date();
  const [modo, setModo] = useState<ModoVisualizacao>("semana");
  const [dataRef, setDataRef] = useState<Date>(hoje);
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje);

  // Estado do Modal de Novo Agendamento
  const [modalNovo, setModalNovo] = useState<{ aberto: boolean; data: Date }>({
    aberto: false,
    data: hoje,
  });

  const abrirNovoAgendamento = (dia: Date) => {
    setModalNovo({ aberto: true, data: dia });
    setDiaSelecionado(dia);
  };

  // ── Helpers de data ──────────────────────────────────────────
  const semanaBase = inicioSemana(dataRef);
  const semana = gerarSemana(semanaBase);
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

  // Agendamentos do dia selecionado (para o painel de detalhes no modo mês)
  const agsDoDiaSelecionado = agsPorData(diaSelecionado);

  // ── Navegação ────────────────────────────────────────────────
  const navegarAnterior = () => {
    if (modo === "semana") {
      setDataRef((d) => subWeeks(d, 1));
    } else {
      setDataRef((d) => subMonths(d, 1));
    }
  };

  const navegarProximo = () => {
    if (modo === "semana") {
      setDataRef((d) => addWeeks(d, 1));
    } else {
      setDataRef((d) => addMonths(d, 1));
    }
  };

  const irParaHoje = () => {
    setDataRef(hoje);
    setDiaSelecionado(hoje);
  };

  const abrirDiaNaSemana = (dia: Date) => {
    setDataRef(dia);
    setDiaSelecionado(dia);
    setModo("semana");
  };

  return (
    <div className="space-y-6">
      {/* ── Modal de Novo Agendamento ── */}
      <AnimatePresence>
        {modalNovo.aberto && (
          <ModalNovoAgendamento
            aberto={modalNovo.aberto}
            data={modalNovo.data}
            onFechar={() => setModalNovo((prev) => ({ ...prev, aberto: false }))}
            onSalvar={(novo) => {
              if (onAdicionarAgendamento) {
                onAdicionarAgendamento(novo);
              }
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
          {modo === "semana" ? (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">
                Semana de {format(semana[0], "dd 'de' MMMM", { locale: ptBR })}
                {" "}a {format(semana[6], "dd 'de' MMMM", { locale: ptBR })}
              </h2>
              <p className="text-xs font-body text-muted-foreground mt-0.5">
                Passe o mouse sobre um dia ou dê duplo clique para agendar
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
          {/* Seletor Semana / Mês */}
          <div className="flex items-center bg-secondary/50 p-1 rounded-xl border border-border/30">
            <button
              onClick={() => setModo("semana")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                modo === "semana"
                  ? "bg-card text-primary shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns size={14} />
              Semana
            </button>
            <button
              onClick={() => setModo("mes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                modo === "mes"
                  ? "bg-card text-primary shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid size={14} />
              Mês (Geral)
            </button>
          </div>

          {/* Navegação Prev / Hoje / Next */}
          <div className="flex gap-1.5 items-center">
            <button
              onClick={navegarAnterior}
              aria-label="Anterior"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={irParaHoje}
              className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary font-body font-bold text-xs hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Hoje
            </button>
            <button
              onClick={navegarProximo}
              aria-label="Próximo"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Conteúdo Conforme o Modo Ativo ── */}
      <AnimatePresence mode="wait">
        {modo === "semana" ? (
          /* ── VISÃO SEMANAL (7 Colunas) ── */
          <motion.div
            key="visao-semana"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {semana.map((dia) => {
                const ags = agsPorData(dia);
                const ehHoje = isSameDay(dia, hoje);

                return (
                  <div
                    key={dia.toString()}
                    onDoubleClick={() => abrirNovoAgendamento(dia)}
                    className="group relative flex flex-col gap-2 min-h-[160px] bg-card/40 hover:bg-card/70 p-2.5 rounded-2xl border border-border/20 hover:border-primary/40 transition-all shadow-sm"
                    title="Duplo clique para criar novo agendamento neste dia"
                  >
                    {/* Cabeçalho do Dia */}
                    <div
                      className={`text-center py-2 px-1 rounded-xl transition-colors ${
                        ehHoje
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary/40 text-foreground"
                      }`}
                    >
                      <div className="font-body text-[10px] font-bold uppercase tracking-wider opacity-75">
                        {format(dia, "EEE", { locale: ptBR })}
                      </div>
                      <div className="font-display font-extrabold text-lg leading-none mt-0.5">
                        {format(dia, "d")}
                      </div>
                    </div>

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
                        ags.map((ag) => <CardAgendamento key={ag.id} ag={ag} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* ── VISÃO MENSAL EXPANDIDA (Grade Completa) ── */
          <motion.div
            key="visao-mes"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
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
                            ag.status === "Confirmado"
                              ? "bg-emerald-500"
                              : ag.status === "Cancelado"
                              ? "bg-rose-500"
                              : "bg-primary";
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

                <div className="flex items-center gap-2 self-start sm:self-center">
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
                    {agsDoDiaSelecionado.map((ag) => (
                      <div
                        key={ag.id}
                        className="p-4 rounded-2xl border border-border/30 bg-background flex flex-col justify-between gap-3 shadow-sm hover:border-primary/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-display font-bold text-sm text-primary flex items-center gap-1">
                              <Clock size={14} />
                              {ag.horario}
                            </span>
                            <BadgeStatus status={ag.status} />
                          </div>
                          <p className="font-display font-bold text-foreground text-base">
                            {ag.nomeCliente}
                          </p>
                          <p className="font-body text-xs text-muted-foreground mt-0.5">
                            {ag.servico}
                          </p>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border/20">
                          <button
                            onClick={() => onAtualizarStatus?.(ag.id, "Confirmado")}
                            className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground font-body font-bold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 size={12} /> Confirmar
                          </button>
                          <button
                            onClick={() => onAtualizarStatus?.(ag.id, "Cancelado")}
                            className="flex-1 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground font-body font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      </div>
                    ))}
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
            ["Pendente", "bg-primary"],
            ["Cancelado", "bg-rose-500"],
          ] as const
        ).map(([label, cor]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cor}`} />
            <span className="font-body text-xs text-muted-foreground">{label}</span>
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
  const [horarios, setHorarios] = useState<Record<DiaSemana, HorarioDia>>({
    seg: { ativo: true, inicio: "08:00", fim: "18:00" },
    ter: { ativo: true, inicio: "08:00", fim: "18:00" },
    qua: { ativo: true, inicio: "08:00", fim: "17:00" },
    qui: { ativo: true, inicio: "08:00", fim: "18:00" },
    sex: { ativo: true, inicio: "08:00", fim: "17:00" },
    sab: { ativo: false, inicio: "09:00", fim: "13:00" },
    dom: { ativo: false, inicio: "09:00", fim: "12:00" },
  });

  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([
    { id: "b1", data: format(addDays(new Date(), 5), "yyyy-MM-dd"), motivo: "Feriado Municipal" },
    { id: "b2", data: format(addDays(new Date(), 12), "yyyy-MM-dd"), motivo: "Congresso de Fisioterapia" },
  ]);

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
    setSalvando(true);
    // Futuramente: chamar API do Supabase aqui
    await new Promise((res) => setTimeout(res, 800));
    setSalvando(false);
    setSalvo(true);
    // Dá um breve feedback visual do ícone de sucesso e redireciona de volta para a agenda
    setTimeout(() => {
      setSalvo(false);
      onSalvo?.();
    }, 600);
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
              Defina os dias e horários em que você atende
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
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
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

                {/* Inputs de Horário */}
                {dia.ativo ? (
                  <div className="flex items-center gap-3 flex-1">
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
            <button
              onClick={adicionarBloqueio}
              disabled={!novoBloqueioData || !novoBloqueioMotivo.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none shrink-0"
            >
              <Plus size={16} />
              Adicionar
            </button>
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
          <button
            onClick={salvar}
            disabled={salvando}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all
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
          </button>
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
  const [carregando, setCarregando] = useState(true);

  // Busca agendamentos reais do Supabase
  useEffect(() => {
    async function carregar() {
      if (!profissional?.id) return;
      setCarregando(true);

      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("empresa_id", profissional.id);

        if (!error && data) {
          const mapeados = data.map((r: any) =>
            mapearAgendamentoSemana(r, profissional.servicos)
          );
          setAgendamentos(mapeados);
        }
      } catch (err) {
        console.error("Erro ao carregar agendamentos do Supabase:", err);
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [profissional?.id, profissional?.servicos]);

  const handleAdicionarAgendamento = async (novo: AgendamentoSemana) => {
    // Atualização otimista
    setAgendamentos((prev) => [...prev, novo]);

    if (!profissional?.id) return;

    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .insert({
          empresa_id: profissional.id,
          nome_cliente: novo.nomeCliente,
          servico_nome: novo.servico,
          data: novo.data,
          horario: novo.horario,
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

  const handleAtualizarStatus = async (id: string, novoStatus: StatusAgendamento) => {
    // Atualização otimista
    setAgendamentos((prev) =>
      prev.map((ag) => (ag.id === id ? { ...ag, status: novoStatus } : ag))
    );

    // Persiste no Supabase
    try {
      await supabase.from("agendamentos").update({ status: novoStatus }).eq("id", id);
    } catch (err) {
      console.error("Erro ao atualizar status no Supabase:", err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Cabeçalho da Página com ação na extrema direita */}
      <header className="border-b border-border/20 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            {abaAtiva === "calendario" ? "Minha Agenda" : "Disponibilidade"}
          </h1>
          <p className="text-muted-foreground font-body text-sm font-medium mt-1">
            {abaAtiva === "calendario"
              ? "Visualize e gerencie seus agendamentos por semana ou mês"
              : "Defina seus horários de atendimento semanal e bloqueios de datas"}
          </p>
        </div>

        {/* Ação na extrema direita: cor primária do profissional, sem fundo */}
        {abaAtiva === "calendario" ? (
          <button
            onClick={() => setAbaAtiva("disponibilidade")}
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-body font-bold text-sm transition-all hover:underline self-start sm:self-center py-2 cursor-pointer"
          >
            <Settings2 size={18} />
            Configurar disponibilidade
          </button>
        ) : (
          <button
            onClick={() => setAbaAtiva("calendario")}
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-body font-bold text-sm transition-all hover:underline self-start sm:self-center py-2 cursor-pointer"
          >
            <Calendar size={18} />
            Voltar para a agenda
          </button>
        )}
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
