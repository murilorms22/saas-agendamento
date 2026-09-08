import { useState, useEffect, useMemo } from "react";
import { format, parseISO, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  Calendar,
  Clock,
  Tag,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarDays,
  ExternalLink,
  MessageCircle,
  ChevronDown,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";

export interface AgendamentoPacienteItem {
  id: string;
  data: string; // "YYYY-MM-DD"
  horario: string; // "HH:MM"
  servico_nome?: string;
  servico?: string;
  valor?: string | number;
  status: "Pendente" | "Confirmado" | "Finalizado" | "Cancelado";
  empresa_id: string;
  cliente_id?: string;
  user_id?: string;
  created_at?: string;
}

interface ModalMeusAgendamentosProps {
  aberto: boolean;
  onFechar: () => void;
  empresaId: string;
  nomeClinica: string;
  telefoneClinica?: string;
  clienteId?: string;
  userId?: string;
  onToast: (mensagem: string, tipo?: "warning" | "error" | "info" | "success") => void;
}

const parseDataHora = (dataStr: string, horarioStr?: string): Date => {
  try {
    const [ano, mes, dia] = dataStr.split("-").map(Number);
    const [hora = 8, minuto = 0] = (horarioStr || "08:00").split(":").map(Number);
    return new Date(ano, mes - 1, dia, hora, minuto);
  } catch {
    return new Date(0);
  }
};

export function ModalMeusAgendamentos({
  aberto,
  onFechar,
  empresaId,
  nomeClinica,
  telefoneClinica,
  clienteId,
  userId,
  onToast,
}: ModalMeusAgendamentosProps) {
  const [agendamentos, setAgendamentos] = useState<AgendamentoPacienteItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [agendamentoParaCancelar, setAgendamentoParaCancelar] = useState<AgendamentoPacienteItem | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // Carrega agendamentos do cliente autenticado nesta clínica
  const carregarAgendamentos = async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      let query = supabase
        .from("agendamentos")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("data", { ascending: false })
        .order("horario", { ascending: false });

      if (userId && clienteId) {
        query = query.or(`user_id.eq.${userId},cliente_id.eq.${clienteId}`);
      } else if (userId) {
        query = query.eq("user_id", userId);
      } else if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[ModalMeusAgendamentos] Erro ao buscar agendamentos:", error);
        onToast("Não foi possível carregar seus agendamentos.", "error");
      } else {
        setAgendamentos((data as AgendamentoPacienteItem[]) || []);
      }
    } catch (err) {
      console.error("[ModalMeusAgendamentos] Erro inesperado:", err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (aberto) {
      carregarAgendamentos();
    }
  }, [aberto, empresaId, clienteId, userId]);

  // Separação dos Agendamentos: Ativos vs Histórico
  const { agendamentosAtivos, agendamentosHistorico } = useMemo(() => {
    const agora = new Date();
    const ativos: AgendamentoPacienteItem[] = [];
    const historico: AgendamentoPacienteItem[] = [];

    agendamentos.forEach((ag) => {
      const statusLimpo = (ag.status || "").trim().toLowerCase();
      const dataHora = parseDataHora(ag.data, ag.horario);
      const isCancelado = statusLimpo === "cancelado" || statusLimpo === "cancelada";
      const isPassado = dataHora.getTime() < agora.getTime();
      const isFinalizado = statusLimpo === "finalizado";

      if (!isCancelado && !isPassado && !isFinalizado) {
        ativos.push(ag);
      } else {
        historico.push(ag);
      }
    });

    // Ordena ativos: mais próximos primeiro (ordem cronológica crescente)
    ativos.sort((a, b) => parseDataHora(a.data, a.horario).getTime() - parseDataHora(b.data, b.horario).getTime());

    // Ordena histórico: mais recentes primeiro (ordem cronológica decrescente)
    historico.sort((a, b) => parseDataHora(b.data, b.horario).getTime() - parseDataHora(a.data, a.horario).getTime());

    return { agendamentosAtivos: ativos, agendamentosHistorico: historico };
  }, [agendamentos]);

  if (!aberto) return null;

  // Handler de Cancelamento
  const handleConfirmarCancelamento = async () => {
    if (!agendamentoParaCancelar) return;

    setCancelando(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "Cancelado" })
        .eq("id", agendamentoParaCancelar.id);

      if (error) {
        console.error("[ModalMeusAgendamentos] Erro ao cancelar agendamento:", error);
        onToast(error.message || "Erro ao cancelar agendamento. Tente novamente.", "error");
      } else {
        onToast("Agendamento cancelado com sucesso.", "success");
        setAgendamentos((prev) =>
          prev.map((item) =>
            item.id === agendamentoParaCancelar.id ? { ...item, status: "Cancelado" } : item
          )
        );
        setAgendamentoParaCancelar(null);
      }
    } catch (err) {
      console.error("[ModalMeusAgendamentos] Erro inesperado ao cancelar:", err);
      onToast("Erro de conexão ao cancelar agendamento.", "error");
    } finally {
      setCancelando(false);
    }
  };

  // Telefone da clínica limpo para WhatsApp
  const telLimpo = (telefoneClinica || "").replace(/\D/g, "");

  const getStatusBadge = (status: string, isHistorico = false) => {
    const statusNormalizado = (status || "Pendente").trim();

    if (statusNormalizado.toLowerCase() === "cancelado" || statusNormalizado.toLowerCase() === "cancelada") {
      return {
        bg: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400",
        label: "Cancelado",
        icone: <XCircle size={13} />,
      };
    }

    if (statusNormalizado.toLowerCase() === "finalizado" || isHistorico) {
      return {
        bg: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-400",
        label: "Concluído",
        icone: <CheckCircle2 size={13} />,
      };
    }

    if (statusNormalizado.toLowerCase() === "confirmado") {
      return {
        bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400",
        label: "Confirmado",
        icone: <CheckCircle2 size={13} />,
      };
    }

    return {
      bg: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400",
      label: "Pendente de Confirmação",
      icone: <Clock size={13} />,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onFechar}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Janela Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-card rounded-[2rem] p-6 sm:p-8 shadow-floating border border-border/60 flex flex-col overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shadow-inner">
              <CalendarDays size={20} />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg sm:text-xl text-foreground">
                Meus Agendamentos
              </h2>
              <p className="font-body text-xs text-muted-foreground">
                Consultas agendadas em <strong className="text-foreground font-semibold">{nomeClinica}</strong>
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onFechar}
            className="w-9 h-9 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Conteúdo Principal (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">
          {carregando ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="font-body text-xs font-semibold">Carregando seus agendamentos...</p>
            </div>
          ) : agendamentos.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-secondary/50 text-muted-foreground mx-auto flex items-center justify-center">
                <Calendar size={26} />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-foreground">
                  Nenhum agendamento encontrado
                </h3>
                <p className="font-body text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Você ainda não possui consultas agendadas nesta clínica.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ── SEÇÃO 1: AGENDAMENTOS ATIVOS (PRÓXIMAS CONSULTAS) ── */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Próximas Consultas ({agendamentosAtivos.length})
                  </h3>
                </div>

                {agendamentosAtivos.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-secondary/20 border border-border/50 text-center space-y-2">
                    <p className="font-body text-xs font-semibold text-foreground">
                      Você não possui consultas agendadas no momento.
                    </p>
                    <p className="font-body text-[11px] text-muted-foreground">
                      Quando você agendar uma nova consulta, ela aparecerá em destaque aqui.
                    </p>
                  </div>
                ) : (
                  agendamentosAtivos.map((ag) => {
                    const dataHoraCompleta = parseDataHora(ag.data, ag.horario);
                    const horasRestantes = differenceInHours(dataHoraCompleta, new Date());
                    const podeCancelar = horasRestantes >= 24;

                    const dataFormatada = (() => {
                      try {
                        return format(parseISO(ag.data), "EEEE, dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        });
                      } catch {
                        return ag.data;
                      }
                    })();

                    const statusInfo = getStatusBadge(ag.status);

                    const linkWhatsAppClinica = telLimpo
                      ? `https://wa.me/55${telLimpo}?text=${encodeURIComponent(
                          `Olá! Gostaria de falar sobre o agendamento de ${ag.servico_nome || ag.servico || "consulta"} do dia ${ag.data} às ${ag.horario}.`
                        )}`
                      : null;

                    return (
                      <div
                        key={ag.id}
                        className="p-4 sm:p-5 rounded-2xl bg-background border border-border/70 shadow-soft transition-all space-y-3.5"
                      >
                        {/* Topo do Card: Serviço e Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                              <Tag size={15} className="text-primary" />
                              {ag.servico_nome || ag.servico || "Consulta Especializada"}
                            </h4>
                            {ag.valor && (
                              <p className="font-body text-xs text-muted-foreground font-semibold mt-0.5">
                                {typeof ag.valor === "number"
                                  ? `R$ ${ag.valor.toFixed(2).replace(".", ",")}`
                                  : ag.valor}
                              </p>
                            )}
                          </div>

                          <div
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-body font-bold border self-start sm:self-center ${statusInfo.bg}`}
                          >
                            {statusInfo.icone}
                            <span>{statusInfo.label}</span>
                          </div>
                        </div>

                        {/* Informações de Data e Hora */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-body">
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/30 text-foreground capitalize">
                            <Calendar size={14} className="text-primary shrink-0" />
                            <span>{dataFormatada}</span>
                          </div>
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/30 text-foreground font-semibold">
                            <Clock size={14} className="text-primary shrink-0" />
                            <span>Horário: {ag.horario}</span>
                          </div>
                        </div>

                        {/* Área de Ações e Regra de Cancelamento de 24h */}
                        <div className="pt-2 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {podeCancelar ? (
                            <>
                              <span className="text-[11px] font-body text-muted-foreground">
                                Cancelamento online disponível até 24h antes do horário.
                              </span>
                              <button
                                type="button"
                                onClick={() => setAgendamentoParaCancelar(ag)}
                                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white font-body font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1.5"
                              >
                                <XCircle size={14} />
                                <span>Cancelar Agendamento</span>
                              </button>
                            </>
                          ) : (
                            <div className="w-full bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-body">
                              <div className="flex items-start gap-2">
                                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                                  Cancelamentos online são permitidos com até <strong>24h de antecedência</strong>. Para imprevistos de última hora, entre em contato diretamente com a clínica.
                                </p>
                              </div>

                              {linkWhatsAppClinica && (
                                <a
                                  href={linkWhatsAppClinica}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-body font-bold text-xs transition-colors shrink-0 shadow-sm cursor-pointer"
                                >
                                  <MessageCircle size={13} />
                                  <span>Falar no WhatsApp</span>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── SEÇÃO 2: HISTÓRICO / ANTERIORES E CANCELADOS (ACCORDION) ── */}
              {agendamentosHistorico.length > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-3">
                  <button
                    type="button"
                    onClick={() => setHistoricoAberto((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-secondary/30 hover:bg-secondary/50 border border-border/40 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-secondary/80 text-muted-foreground flex items-center justify-center group-hover:text-foreground transition-colors">
                        <History size={15} />
                      </div>
                      <div className="text-left">
                        <span className="font-display font-bold text-xs text-foreground block">
                          Histórico de agendamentos
                        </span>
                        <span className="font-body text-[11px] text-muted-foreground">
                          Consultas anteriores e canceladas
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-secondary text-[11px] font-body font-semibold text-muted-foreground">
                        {agendamentosHistorico.length} {agendamentosHistorico.length === 1 ? "registro" : "registros"}
                      </span>
                      <motion.div
                        animate={{ rotate: historicoAberto ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-muted-foreground group-hover:text-foreground"
                      >
                        <ChevronDown size={16} />
                      </motion.div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {historicoAberto && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="space-y-3 overflow-hidden"
                      >
                        {agendamentosHistorico.map((ag) => {
                          const dataFormatada = (() => {
                            try {
                              return format(parseISO(ag.data), "EEEE, dd 'de' MMMM 'de' yyyy", {
                                locale: ptBR,
                              });
                            } catch {
                              return ag.data;
                            }
                          })();

                          const statusInfo = getStatusBadge(ag.status, true);

                          return (
                            <div
                              key={ag.id}
                              className="p-3.5 sm:p-4 rounded-2xl bg-secondary/15 border border-border/40 opacity-75 dark:opacity-70 space-y-2.5 transition-all"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                <h4 className="font-display font-semibold text-sm text-foreground/90 flex items-center gap-2">
                                  <Tag size={13} className="text-muted-foreground" />
                                  {ag.servico_nome || ag.servico || "Consulta"}
                                </h4>

                                <div
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-body font-semibold border self-start sm:self-center ${statusInfo.bg}`}
                                >
                                  {statusInfo.icone}
                                  <span>{statusInfo.label}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-body text-muted-foreground">
                                <div className="flex items-center gap-1.5 capitalize">
                                  <Calendar size={13} className="shrink-0" />
                                  <span>{dataFormatada}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Clock size={13} className="shrink-0" />
                                  <span>Horário: {ag.horario}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="pt-4 border-t border-border/30 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-body font-bold text-xs transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>

      {/* Modal de Confirmação de Cancelamento */}
      <AnimatePresence>
        {agendamentoParaCancelar && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cancelando && setAgendamentoParaCancelar(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-sm bg-card rounded-3xl p-6 shadow-floating border border-rose-500/30 text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-500 mx-auto flex items-center justify-center">
                <AlertTriangle size={28} />
              </div>

              <div className="space-y-1">
                <h3 className="font-display font-bold text-lg text-foreground">
                  Cancelar este agendamento?
                </h3>
                <p className="font-body text-xs text-muted-foreground">
                  Você está prestes a cancelar sua consulta de{" "}
                  <strong className="text-foreground">
                    {agendamentoParaCancelar.servico_nome || agendamentoParaCancelar.servico || "Consulta"}
                  </strong>{" "}
                  marcada para <strong>{agendamentoParaCancelar.data}</strong> às{" "}
                  <strong>{agendamentoParaCancelar.horario}</strong>.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={cancelando}
                  onClick={() => setAgendamentoParaCancelar(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border/70 hover:bg-secondary text-xs font-body font-bold text-foreground transition-all cursor-pointer disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={cancelando}
                  onClick={handleConfirmarCancelamento}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-body font-bold shadow-soft transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {cancelando ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Cancelando...</span>
                    </>
                  ) : (
                    <span>Sim, Cancelar</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
