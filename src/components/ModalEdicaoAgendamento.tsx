import { useState, useEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import {
  X,
  Search,
  Phone,
  Pencil,
  AlertCircle,
  Lock,
  Trash2,
  AlertTriangle,
  FileText,
  Calendar,
  Clock,
  ExternalLink,
  Tag,
  CheckCircle2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";

export type StatusAgendamento = "Pendente" | "Confirmado" | "Finalizado" | "Cancelado";

export interface AgendamentoItem {
  id: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  nomeCliente: string;
  telefone?: string;
  servico: string;
  status: StatusAgendamento;
  observacoes?: string;
}

export interface ModalEdicaoAgendamentoProps {
  aberto: boolean;
  agendamento: AgendamentoItem | null;
  onFechar: () => void;
  onSalvar: (editado: AgendamentoItem) => void | Promise<void>;
  onExcluir?: (id: string) => void | Promise<void>;
  servicos: { id: number | string; nome: string; preco?: string; duracao?: string }[];
  horariosDisponiveis: string[];
  empresaId?: string;
}

// Máscara brasileira de telefone (DDD) 00000-0000 ou (DDD) 0000-0000
function mascararTelefone(valor: string): string {
  const apenasNumeros = valor.replace(/\D/g, "");
  if (apenasNumeros.length === 0) return "";
  if (apenasNumeros.length <= 2) return `(${apenasNumeros}`;
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`;
  }
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`;
}

export function ModalEdicaoAgendamento({
  aberto,
  agendamento,
  onFechar,
  onSalvar,
  onExcluir,
  servicos,
  horariosDisponiveis,
  empresaId,
}: ModalEdicaoAgendamentoProps) {
  const [dataSelecionada, setDataSelecionada] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [servicoNome, setServicoNome] = useState("");
  const [horario, setHorario] = useState("");
  const [status, setStatus] = useState<StatusAgendamento>("Pendente");

  // Estado de confirmação de exclusão
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Autocomplete de clientes cadastrados
  const [clientesCadastrados, setClientesCadastrados] = useState<{ id?: string; nome: string; telefone?: string }[]>([]);
  const [sugestoes, setSugestoes] = useState<{ id?: string; nome: string; telefone?: string }[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const containerSugestoesRef = useRef<HTMLDivElement>(null);

  // Trava de Segurança: agendamentos existentes no dia para evitar choque de horário
  const [agendamentosDoDia, setAgendamentosDoDia] = useState<
    { id: string; horario: string; nomeCliente: string }[]
  >([]);
  const [erroTrava, setErroTrava] = useState<string | null>(null);

  // Sincroniza dados iniciais ao abrir o modal
  useEffect(() => {
    if (aberto && agendamento) {
      setDataSelecionada(agendamento.data || format(new Date(), "yyyy-MM-dd"));
      setNomeCliente(agendamento.nomeCliente || "");
      setTelefone(agendamento.telefone ? mascararTelefone(agendamento.telefone) : "");
      setObservacoes(agendamento.observacoes || "");
      setServicoNome(agendamento.servico || (servicos[0]?.nome ?? "Consulta"));
      setHorario(agendamento.horario || (horariosDisponiveis[0] ?? "08:00"));
      setStatus(agendamento.status || "Pendente");
      setConfirmandoExclusao(false);
      setErroTrava(null);
      setSugestoes([]);
      setMostrarSugestoes(false);
    }
  }, [aberto, agendamento]);

  // Carrega clientes do banco de dados ao abrir o modal
  useEffect(() => {
    async function carregarClientes() {
      if (!empresaId || !aberto) return;
      try {
        const { data: lista, error } = await supabase
          .from("clientes")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("nome", { ascending: true });

        if (!error && lista) {
          setClientesCadastrados(lista);
        }
      } catch (err) {
        console.error("Erro ao carregar clientes cadastrados:", err);
      }
    }

    carregarClientes();
  }, [aberto, empresaId]);

  // Carrega agendamentos da data selecionada para travar conflitos
  useEffect(() => {
    async function carregarOcupados() {
      if (!empresaId || !dataSelecionada || !aberto) return;
      try {
        const { data: ags, error } = await supabase
          .from("agendamentos")
          .select("id, horario, data, data_hora_agendamento, nome_cliente, status, clientes(nome)")
          .eq("empresa_id", empresaId)
          .neq("status", "Cancelado");

        if (!error && ags) {
          const doDia = ags
            .filter((a: any) => {
              const d = a.data ?? (a.data_hora_agendamento ? a.data_hora_agendamento.split("T")[0] : "");
              return d === dataSelecionada;
            })
            .map((a: any) => {
              let h = a.horario;
              if (!h && a.data_hora_agendamento) {
                const parte = a.data_hora_agendamento.split("T")[1];
                if (parte) h = parte.slice(0, 5);
              }
              const cliNome = Array.isArray(a.clientes) ? a.clientes[0]?.nome : (a.clientes as any)?.nome;
              const nome = a.nome_cliente || a.cliente_nome || a.nome || cliNome || "Paciente";
              return {
                id: String(a.id),
                horario: h ?? "08:00",
                nomeCliente: nome,
              };
            });

          setAgendamentosDoDia(doDia);
        }
      } catch (err) {
        console.error("Erro ao verificar agendamentos do dia:", err);
      }
    }

    carregarOcupados();
  }, [empresaId, dataSelecionada, aberto]);

  // Fecha dropdown se clicar fora
  useEffect(() => {
    const handleClickFora = (e: MouseEvent) => {
      if (containerSugestoesRef.current && !containerSugestoesRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    };
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  if (!aberto || !agendamento) return null;

  const handleNomeChange = (valor: string) => {
    setNomeCliente(valor);
    const termo = valor.trim().toLowerCase();
    if (termo.length >= 1) {
      const matches = clientesCadastrados.filter((c) =>
        c.nome.toLowerCase().includes(termo)
      );
      setSugestoes(matches);
      setMostrarSugestoes(matches.length > 0);
    } else {
      setSugestoes([]);
      setMostrarSugestoes(false);
    }
  };

  const selecionarCliente = (c: { nome: string; telefone?: string }) => {
    setNomeCliente(c.nome);
    if (c.telefone) {
      setTelefone(mascararTelefone(c.telefone));
    }
    setMostrarSugestoes(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = nomeCliente.trim();
    if (!nomeLimpo) return;

    // 1. Trava de Segurança Local (caso o status não seja Cancelado)
    if (status !== "Cancelado") {
      const conflitoLocal = agendamentosDoDia.find(
        (a) => a.horario === horario && String(a.id) !== String(agendamento.id)
      );

      if (conflitoLocal) {
        setErroTrava(`Trava de segurança: O horário das ${horario} já está reservado para ${conflitoLocal.nomeCliente} nesta data!`);
        return;
      }
    }

    // 2. Trava de Segurança no Banco
    if (empresaId && status !== "Cancelado") {
      try {
        const { data: conflitosNoBanco } = await supabase
          .from("agendamentos")
          .select("id, nome_cliente, clientes(nome)")
          .eq("empresa_id", empresaId)
          .eq("data", dataSelecionada)
          .eq("horario", horario)
          .neq("status", "Cancelado");

        const conflitoReal = (conflitosNoBanco ?? []).find(
          (c: any) => String(c.id) !== String(agendamento.id)
        );

        if (conflitoReal) {
          const cliNome = Array.isArray((conflitoReal as any).clientes)
            ? (conflitoReal as any).clientes[0]?.nome
            : (conflitoReal as any).clientes?.nome;
          const nomeConflito = conflitoReal.nome_cliente || cliNome || "outro paciente";
          setErroTrava(`Trava de segurança: O horário das ${horario} já está reservado para ${nomeConflito} nesta data!`);
          return;
        }
      } catch (checkErr) {
        console.warn("Aviso ao checar conflito no banco:", checkErr);
      }
    }

    // 3. Atualiza ou cadastra cliente
    const telLimpo = telefone.trim();
    if (empresaId && telLimpo) {
      try {
        await supabase.from("clientes").upsert(
          {
            empresa_id: empresaId,
            nome: nomeLimpo,
            telefone: telLimpo,
          },
          { onConflict: "empresa_id,telefone" }
        );
      } catch (err) {
        console.warn("Aviso ao sincronizar cliente:", err);
      }
    }

    const itemAtualizado: AgendamentoItem = {
      id: agendamento.id,
      data: dataSelecionada,
      horario,
      nomeCliente: nomeLimpo,
      telefone: telLimpo,
      servico: servicoNome,
      status,
      observacoes: observacoes.trim(),
    };

    setSalvando(true);
    try {
      await onSalvar(itemAtualizado);
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!onExcluir) return;
    setSalvando(true);
    try {
      await onExcluir(agendamento.id);
      setConfirmandoExclusao(false);
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const telefoneNumeros = telefone.replace(/\D/g, "");
  const linkWhatsApp = telefoneNumeros ? `https://wa.me/55${telefoneNumeros}` : null;

  const conflitoAtual = agendamentosDoDia.find(
    (a) => a.horario === horario && String(a.id) !== String(agendamento.id) && status !== "Cancelado"
  );

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

      {/* Janela do Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto bg-card rounded-3xl p-6 md:p-8 shadow-floating border border-border/50"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-border/20 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold shadow-inner">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-foreground leading-snug">
                Editar Agendamento
              </h3>
              <p className="text-xs font-body text-muted-foreground font-medium">
                Atualize dados do paciente, horário e status da consulta
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Alerta de Conflito de Horário */}
        {erroTrava && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 font-body text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{erroTrava}</span>
            </div>
            <button
              type="button"
              onClick={() => setErroTrava(null)}
              className="p-1 hover:bg-rose-500/15 rounded-lg text-rose-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Nome do Paciente (com autocomplete) */}
          <div className="relative" ref={containerSugestoesRef}>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Nome do Paciente *</span>
              {clientesCadastrados.length > 0 && (
                <span className="text-[10px] text-primary font-normal">
                  {clientesCadastrados.length} na base
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={nomeCliente}
                onChange={(e) => handleNomeChange(e.target.value)}
                onFocus={() => {
                  if (nomeCliente.trim().length >= 1 && sugestoes.length > 0) {
                    setMostrarSugestoes(true);
                  }
                }}
                placeholder="Nome completo do paciente..."
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
                <Search size={16} />
              </div>
            </div>

            {/* Dropdown de Clientes Encontrados */}
            <AnimatePresence>
              {mostrarSugestoes && sugestoes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-primary/20 rounded-2xl shadow-floating overflow-hidden max-h-48 overflow-y-auto"
                >
                  <div className="p-1.5 space-y-0.5">
                    {sugestoes.map((c, i) => (
                      <button
                        key={c.id ?? i}
                        type="button"
                        onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-xs shrink-0">
                            {c.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-display font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                              {c.nome}
                            </p>
                          </div>
                        </div>
                        {c.telefone && (
                          <span className="font-body text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                            <Phone size={11} className="opacity-70" />
                            {mascararTelefone(c.telefone)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 2. WhatsApp / Telefone */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wider">
                WhatsApp / Telefone
              </label>
              {linkWhatsApp && (
                <a
                  href={linkWhatsApp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-body font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 hover:underline"
                  title="Abrir conversa no WhatsApp"
                >
                  <span>Abrir no WhatsApp</span>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
                <Phone size={15} />
              </div>
            </div>
          </div>

          {/* 3. Serviço Vinculado */}
          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Tag size={12} className="text-primary" />
              <span>Serviço Vinculado</span>
            </label>
            <select
              value={servicoNome}
              onChange={(e) => setServicoNome(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome} {s.preco ? `(${s.preco})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Data e Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Calendar size={12} className="text-primary" />
                <span>Data da Consulta</span>
              </label>
              <input
                type="date"
                required
                value={dataSelecionada}
                onChange={(e) => {
                  setDataSelecionada(e.target.value);
                  setErroTrava(null);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-primary" /> Horário
                </span>
                {conflitoAtual && (
                  <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                    <Lock size={10} /> Ocupado
                  </span>
                )}
              </label>
              <select
                value={horario}
                onChange={(e) => {
                  setHorario(e.target.value);
                  setErroTrava(null);
                }}
                className={`w-full px-3 py-2.5 rounded-xl border bg-background text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 transition-colors ${
                  conflitoAtual
                    ? "border-rose-500 focus:ring-rose-500/40 text-rose-700 bg-rose-500/5"
                    : "border-border focus:ring-primary/40"
                }`}
              >
                {horariosDisponiveis.map((h) => {
                  const ocupado = agendamentosDoDia.find(
                    (a) => a.horario === h && String(a.id) !== String(agendamento.id)
                  );
                  return (
                    <option key={h} value={h} disabled={Boolean(ocupado)}>
                      {h} {ocupado ? `— ⚠️ Ocupado (${ocupado.nomeCliente})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* 5. Status da Consulta (Select / Tabs Livres) */}
          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Status da Consulta
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {/* Pendente */}
              <button
                type="button"
                onClick={() => setStatus("Pendente")}
                className={`py-2 px-2 rounded-xl text-xs font-body font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                  status === "Pendente"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30"
                    : "border-border/60 text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <Clock size={13} />
                <span>Pendente</span>
              </button>

              {/* Confirmado */}
              <button
                type="button"
                onClick={() => setStatus("Confirmado")}
                className={`py-2 px-2 rounded-xl text-xs font-body font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                  status === "Confirmado"
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/50 shadow-sm ring-1 ring-blue-500/30"
                    : "border-border/60 text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <CheckCircle2 size={13} />
                <span>Confirmado</span>
              </button>

              {/* Finalizado */}
              <button
                type="button"
                onClick={() => setStatus("Finalizado")}
                className={`py-2 px-2 rounded-xl text-xs font-body font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                  status === "Finalizado"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30"
                    : "border-border/60 text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <ShieldCheck size={13} />
                <span>Finalizado</span>
              </button>

              {/* Cancelado */}
              <button
                type="button"
                onClick={() => setStatus("Cancelado")}
                className={`py-2 px-2 rounded-xl text-xs font-body font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                  status === "Cancelado"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/50 shadow-sm ring-1 ring-rose-500/30"
                    : "border-border/60 text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <XCircle size={13} />
                <span>Cancelado</span>
              </button>
            </div>
          </div>

          {/* 6. Observações e Notas Clínicas */}
          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={12} className="text-primary" />
              <span>Observações / Notas Clínicas</span>
            </label>
            <textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Primeira consulta, paciente preferencial, histórico de exames..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm font-body font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-4 border-t border-border/20">
            {onExcluir && (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={salvando}
                className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white font-body font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Excluir ou cancelar este agendamento"
              >
                <Trash2 size={14} />
                <span>Excluir</span>
              </button>
            )}

            <div className="flex-1 flex gap-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={onFechar}
                disabled={salvando}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Voltar
              </motion.button>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.98 }}
                disabled={salvando}
                className="flex-[1.5] py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-body font-bold text-xs shadow-soft transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Pencil size={14} />
                <span>{salvando ? "Salvando..." : "Salvar Alterações"}</span>
              </motion.button>
            </div>
          </div>
        </form>
      </motion.div>

      {/* Diálogo de Confirmação de Exclusão */}
      <AnimatePresence>
        {confirmandoExclusao && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmandoExclusao(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
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
                Excluir este Agendamento?
              </h4>
              <p className="text-xs font-body text-muted-foreground mt-2 leading-relaxed">
                Tem certeza que deseja excluir esta consulta? O agendamento de{" "}
                <strong className="text-foreground">{agendamento.nomeCliente}</strong> no dia{" "}
                <strong className="text-foreground">
                  {agendamento.data ? format(parseISO(agendamento.data), "dd/MM/yyyy") : ""}
                </strong>{" "}
                às <strong className="text-foreground">{agendamento.horario}</strong> será removido.
              </p>
              <p className="text-[11px] font-body text-emerald-600 font-medium mt-2 bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                ✓ O cliente continuará cadastrado na sua base de contatos.
              </p>

              <div className="flex gap-2.5 mt-5">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setConfirmandoExclusao(false)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmarExclusao}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-body font-bold text-xs shadow-soft transition-all cursor-pointer"
                >
                  Sim, Excluir
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
