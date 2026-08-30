import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  Calendar,
  Phone,
  AlertTriangle,
  ExternalLink,
  Tag,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgendamentoItem, StatusAgendamento } from "./ModalNovoAgendamento";

interface ModalDetalhesAgendamentoProps {
  agendamento: AgendamentoItem | null;
  onFechar: () => void;
  onEditar: (ag: AgendamentoItem) => void;
  onExcluir: (id: string) => void;
  onAtualizarStatus?: (id: string, novoStatus: StatusAgendamento) => void;
}

export function ModalDetalhesAgendamento({
  agendamento,
  onFechar,
  onEditar,
  onExcluir,
  onAtualizarStatus,
}: ModalDetalhesAgendamentoProps) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  if (!agendamento) return null;

  // Data formatada
  let dataFormatada = agendamento.data;
  try {
    dataFormatada = format(parseISO(agendamento.data), "EEEE, dd 'de' MMMM 'de' yyyy", {
      locale: ptBR,
    });
  } catch {
    // fallback
  }

  // Telefone limpo para link do WhatsApp
  const telefoneNumeros = (agendamento.telefone || "").replace(/\D/g, "");
  const linkWhatsApp = telefoneNumeros ? `https://wa.me/55${telefoneNumeros}` : null;

  // Ícone e estilo de status (SOMENTE ÍCONE, sem texto por extenso)
  const statusConfig: Record<StatusAgendamento, { icone: React.ReactNode; cor: string; label: string }> = {
    Confirmado: {
      icone: <CheckCircle2 size={15} />,
      cor: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30",
      label: "Confirmado",
    },
    Pendente: {
      icone: <Clock size={15} />,
      cor: "bg-amber-500/15 text-amber-600 border border-amber-500/30",
      label: "Pendente",
    },
    Cancelado: {
      icone: <X size={15} />,
      cor: "bg-rose-500/15 text-rose-600 border border-rose-500/30",
      label: "Cancelado",
    },
  };

  const statusAtual = statusConfig[agendamento.status] ?? statusConfig.Pendente;

  const handleConfirmarExclusao = () => {
    onExcluir(agendamento.id);
    setConfirmandoExclusao(false);
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

      {/* Janela Principal do Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-md bg-card rounded-3xl p-6 md:p-8 shadow-floating border border-border/50 overflow-hidden"
      >
        {/* Topo: Título + Fechar */}
        <div className="flex items-center justify-between pb-4 border-b border-border/20 mb-5">
          <span className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wider">
            Detalhes da Consulta
          </span>
          <button
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Perfil do Paciente */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/30 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-black text-lg shadow-inner">
              {agendamento.nomeCliente.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-foreground leading-snug">
                {agendamento.nomeCliente}
              </h3>
              <p className="font-body text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Tag size={12} className="text-primary" />
                {agendamento.servico}
              </p>
            </div>
          </div>

          {/* Status SOMENTE ÍCONE (com tooltip acessível) */}
          <div
            title={`Status atual: ${statusAtual.label}`}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm cursor-help ${statusAtual.cor}`}
          >
            {statusAtual.icone}
          </div>
        </div>

        {/* Informações detalhadas da Consulta */}
        <div className="space-y-3 mb-6">
          {/* Data e Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-background border border-border/30">
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                <Calendar size={12} className="text-primary" /> Data
              </span>
              <p className="font-body font-semibold text-xs text-foreground capitalize">
                {dataFormatada}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-background border border-border/30">
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                <Clock size={12} className="text-primary" /> Horário
              </span>
              <p className="font-display font-bold text-sm text-foreground">
                {agendamento.horario}
              </p>
            </div>
          </div>

          {/* Telefone / WhatsApp com Ação Direta */}
          <div className="p-3.5 rounded-xl bg-background border border-border/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-0.5">
                <Phone size={12} className="text-primary" /> WhatsApp / Telefone
              </span>
              <p className="font-body font-semibold text-xs text-foreground">
                {agendamento.telefone || "Não informado"}
              </p>
            </div>

            {linkWhatsApp && (
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-600 hover:text-white font-body font-bold text-xs transition-colors shadow-sm cursor-pointer"
              >
                <span>WhatsApp</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* Ações: Confirmar rápida, Editar (Lápis bem visível) e Cancelar */}
        <div className="space-y-2.5 pt-4 border-t border-border/20">
          {/* Botão de Edição Principal com Lápis bem visível e intuitivo */}
          <button
            onClick={() => {
              onFechar();
              onEditar(agendamento);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
          >
            <Pencil size={16} className="transition-transform group-hover:rotate-12" />
            <span>Editar Agendamento</span>
          </button>

          {/* Botões secundários: Confirmar e Cancelar */}
          <div className="flex gap-2">
            {agendamento.status !== "Confirmado" && onAtualizarStatus && (
              <button
                onClick={() => {
                  onAtualizarStatus(agendamento.id, "Confirmado");
                  onFechar();
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white font-body font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>Confirmar</span>
              </button>
            )}

            <button
              onClick={() => setConfirmandoExclusao(true)}
              className="flex-1 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white font-body font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Cancelar Agendamento</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Modal / Dialog de Confirmação de Cancelamento e Exclusão */}
      <AnimatePresence>
        {confirmandoExclusao && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmandoExclusao(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-sm bg-card rounded-3xl p-6 shadow-floating border border-rose-500/30 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={24} />
              </div>
              <h4 className="text-lg font-display font-bold text-foreground">
                Cancelar e Excluir Agendamento?
              </h4>
              <p className="text-xs font-body text-muted-foreground mt-2 leading-relaxed">
                Tem certeza que deseja cancelar esta consulta? O agendamento de{" "}
                <strong className="text-foreground">{agendamento.nomeCliente}</strong> às{" "}
                <strong className="text-foreground">{agendamento.horario}</strong> será excluído da sua agenda.
              </p>
              <p className="text-[11px] font-body text-emerald-600 font-medium mt-2 bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                ✓ O cliente continuará cadastrado na sua base de contatos.
              </p>

              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusao}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-body font-bold text-xs shadow-soft transition-all cursor-pointer"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
