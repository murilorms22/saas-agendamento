import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Users,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  MessageSquare,
  Lightbulb,
  ShieldCheck,
  CalendarDays,
  X,
  BellRing,
  Activity,
  Smile,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { ModalNovoAgendamento, type AgendamentoItem } from "../../components/ModalNovoAgendamento";

export default function PainelInicial() {
  return (
    <PageLoader>
      <PainelInicialConteudo />
    </PageLoader>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface NotificacaoItem {
  id: string;
  tipo: "urgente" | "sucesso" | "info" | "dica";
  titulo: string;
  descricao: string;
  horario?: string;
  data?: string;
  acaoTexto?: string;
  acaoLink?: string;
  acaoHandler?: () => void;
  lida: boolean;
}

function obterSaudacao(nomeProfissional: string) {
  const hora = new Date().getHours();
  let texto = "Olá";
  let icone = <Sun className="text-amber-500" size={24} />;

  if (hora >= 5 && hora < 12) {
    texto = "Bom dia";
    icone = <Sun className="text-amber-500" size={24} />;
  } else if (hora >= 12 && hora < 18) {
    texto = "Boa tarde";
    icone = <Sunset className="text-orange-500" size={24} />;
  } else {
    texto = "Boa noite";
    icone = <Moon className="text-indigo-400" size={24} />;
  }

  return {
    texto: `${texto}, ${nomeProfissional}!`,
    icone,
  };
}

function PainelInicialConteudo() {
  const { profissional } = useProfessional();
  const navigate = useNavigate();

  // Estados locais de dados
  const [agendamentosHoje, setAgendamentosHoje] = useState<any[]>([]);
  const [agendamentosPendentes, setAgendamentosPendentes] = useState<any[]>([]);
  const [totalClientes, setTotalClientes] = useState<number>(0);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [filtroAba, setFiltroAba] = useState<"todas" | "pendencias" | "dicas">("todas");
  const [notificacoesDispensadas, setNotificacoesDispensadas] = useState<string[]>([]);

  // Carrega agendamentos e clientes do Supabase
  useEffect(() => {
    async function carregarDados() {
      if (!profissional?.id) return;
      const hojeStr = format(new Date(), "yyyy-MM-dd");

      try {
        // 1. Busca agendamentos da empresa
        const { data: ags } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("empresa_id", profissional.id)
          .order("horario", { ascending: true });

        if (ags) {
          const deHoje = ags.filter((a: any) => a.data === hojeStr);
          const pendentes = ags.filter((a: any) => a.status === "Pendente");
          setAgendamentosHoje(deHoje);
          setAgendamentosPendentes(pendentes);
        }

        // 2. Busca contagem de clientes
        const { count } = await supabase
          .from("clientes")
          .select("*", { count: "exact", head: true })
          .eq("empresa_id", profissional.id);

        if (count !== null) {
          setTotalClientes(count);
        }
      } catch (err) {
        console.error("Erro ao carregar dados do Painel Inicial:", err);
      }
    }

    carregarDados();
  }, [profissional?.id]);

  const nomeProfissional = profissional?.nomeClinica ?? "Profissional";
  const saudacao = obterSaudacao(nomeProfissional);

  // Link da página pública do profissional
  const urlPublica = typeof window !== "undefined"
    ? `${window.location.origin}/`
    : "http://localhost:5173/";

  const handleCopiarLink = () => {
    navigator.clipboard.writeText(urlPublica);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2500);
  };

  const handleCriarAgendamento = (novo: AgendamentoItem) => {
    // Notifica sistema e leva para a agenda
    window.dispatchEvent(new CustomEvent("agendamento-criado", { detail: novo }));
    setModalNovoAberto(false);
  };

  // Próximo agendamento de hoje
  const proximoAgendamento = agendamentosHoje.find(
    (a) => a.status !== "Cancelado"
  );

  // Notificações Inteligentes
  const listaNotificacoes: NotificacaoItem[] = [];

  // 1. Aviso de consultas pendentes
  if (agendamentosPendentes.length > 0) {
    listaNotificacoes.push({
      id: "notif-pendentes",
      tipo: "urgente",
      titulo: `${agendamentosPendentes.length} consulta${agendamentosPendentes.length > 1 ? "s" : ""} aguardando sua confirmação`,
      descricao: `Há agendamentos de clientes que precisam ser aprovados ou confirmados na sua agenda.`,
      acaoTexto: "Revisar consultas",
      acaoLink: "/admin/resumo",
      lida: false,
    });
  }

  // 2. Aviso do próximo atendimento
  if (proximoAgendamento) {
    listaNotificacoes.push({
      id: "notif-proximo",
      tipo: "info",
      titulo: `Próximo atendimento: ${proximoAgendamento.nome_cliente ?? proximoAgendamento.nomeCliente}`,
      descricao: `Horário marcado para às ${proximoAgendamento.horario} (${proximoAgendamento.servico_nome ?? proximoAgendamento.servico ?? "Atendimento"}).`,
      acaoTexto: "Ver detalhes",
      acaoLink: "/admin/resumo",
      lida: false,
    });
  }

  // 3. Dica prática: Link do WhatsApp
  listaNotificacoes.push({
    id: "notif-dica-whatsapp",
    tipo: "dica",
    titulo: "Dica de ouro: Confirmação rápida por WhatsApp",
    descricao: "Pacientes que recebem um lembrete no dia anterior reduzem em 80% as chances de falta. Você pode enviar mensagens com um clique direto nos cards da agenda.",
    lida: false,
  });

  // 4. Dica prática: Bio do Instagram
  listaNotificacoes.push({
    id: "notif-dica-link",
    tipo: "dica",
    titulo: "Receba pacientes 24 horas por dia",
    descricao: "Compartilhe o seu link público de agendamento na bio do seu Instagram e no status do WhatsApp para que novos pacientes marquem consulta a qualquer hora.",
    acaoTexto: "Copiar meu link público",
    acaoHandler: handleCopiarLink,
    lida: false,
  });

  // 5. Sucesso de disponibilidade
  listaNotificacoes.push({
    id: "notif-disponibilidade",
    tipo: "sucesso",
    titulo: "Sua agenda está sincronizada",
    descricao: "Seus horários configurados estão disponíveis online. Para bloquear dias especiais ou alterar turnos de atendimento, acesse a aba de disponibilidade.",
    acaoTexto: "Configurar horários",
    acaoLink: "/admin/agenda",
    lida: false,
  });

  // Filtra as notificações ativas
  const notificacoesFiltradas = listaNotificacoes
    .filter((n) => !notificacoesDispensadas.includes(n.id))
    .filter((n) => {
      if (filtroAba === "pendencias") return n.tipo === "urgente";
      if (filtroAba === "dicas") return n.tipo === "dica";
      return true;
    });

  const dispensarNotificacao = (id: string) => {
    setNotificacoesDispensadas((prev) => [...prev, id]);
  };

  return (
    <div className="space-y-10 pb-16 max-w-6xl mx-auto">
      {/* Modal de Criação de Agendamento */}
      <AnimatePresence>
        {modalNovoAberto && (
          <ModalNovoAgendamento
            aberto={modalNovoAberto}
            data={new Date()}
            empresaId={profissional?.id}
            onFechar={() => setModalNovoAberto(false)}
            onSalvar={handleCriarAgendamento}
            servicos={profissional?.servicos ?? []}
            horariosDisponiveis={
              profissional?.horariosDisponiveis ?? [
                "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
              ]
            }
          />
        )}
      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* 1. Header de Boas-Vindas Receptivo & Saudação                 */}
      {/* ────────────────────────────────────────────────────────────── */}
      <header className="relative bg-gradient-to-br from-card via-card/80 to-primary/5 p-8 md:p-10 rounded-3xl border border-primary/15 shadow-soft overflow-hidden">
        {/* Elemento estético de fundo suave */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles size={14} />
              <span>Painel de Controle Principal</span>
            </div>

            <div className="flex items-center gap-3">
              {saudacao.icone}
              <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight text-foreground">
                {saudacao.texto}
              </h1>
            </div>

            <p className="text-muted-foreground font-body text-sm md:text-base max-w-2xl leading-relaxed">
              Que bom ter você aqui! Este é o seu espaço central para acompanhar avisos, novidades,
              lembretes úteis e acessar rapidamente as principais funções do seu sistema.
            </p>
          </div>

          {/* Data & Status */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-2xl bg-secondary/80 border border-border/40 font-body text-xs font-semibold text-foreground flex items-center gap-2 shadow-xs">
              <CalendarDays size={16} className="text-primary" />
              <span>{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 font-body text-xs font-bold text-emerald-600 flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sistema Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* 2. Botões das Principais Ações do Sistema (Atalhos Rápidos)   */}
      {/* ────────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            <span>Ações Rápidas do Dia</span>
          </h2>
          <span className="text-xs font-body text-muted-foreground">
            Acesso direto às ferramentas que você mais usa
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Ação 1: Novo Agendamento */}
          <motion.button
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalNovoAberto(true)}
            className="flex flex-col items-start p-5 rounded-2xl bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:rotate-90 transition-transform duration-300">
              <Plus size={20} className="stroke-[3]" />
            </div>
            <span className="font-display font-bold text-base">Novo Agendamento</span>
            <span className="font-body text-xs text-white/80 mt-1">
              Marque uma nova consulta rapidamente
            </span>
          </motion.button>

          {/* Ação 2: Minha Agenda */}
          <motion.button
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/admin/agenda")}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border/40 hover:border-primary/40 shadow-soft hover:shadow-soft-lg transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Calendar size={20} />
            </div>
            <span className="font-display font-bold text-base text-foreground group-hover:text-primary transition-colors">
              Minha Agenda
            </span>
            <span className="font-body text-xs text-muted-foreground mt-1">
              Visualização por Dia, Semana e Mês
            </span>
          </motion.button>

          {/* Ação 3: Resumo do Dia */}
          <motion.button
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/admin/resumo")}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border/40 hover:border-primary/40 shadow-soft hover:shadow-soft-lg transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Clock size={20} />
            </div>
            <span className="font-display font-bold text-base text-foreground group-hover:text-primary transition-colors">
              Resumo do Dia
            </span>
            <span className="font-body text-xs text-muted-foreground mt-1">
              Confirmar e gerenciar atendimentos de hoje
            </span>
          </motion.button>

          {/* Ação 4: Compartilhar Link Público */}
          <motion.button
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCopiarLink}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border/40 hover:border-primary/40 shadow-soft hover:shadow-soft-lg transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              {linkCopiado ? <Check size={20} className="text-emerald-600" /> : <Copy size={20} />}
            </div>
            <span className="font-display font-bold text-base text-foreground group-hover:text-primary transition-colors">
              {linkCopiado ? "Link Copiado! ✓" : "Copiar Meu Link"}
            </span>
            <span className="font-body text-xs text-muted-foreground mt-1">
              Envie para pacientes agendarem online
            </span>
          </motion.button>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* 3. Banner Destaque & Próximo Atendimento                      */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card do Próximo Paciente */}
        <div className="lg:col-span-2 bg-card rounded-3xl p-6 md:p-8 border border-border/40 shadow-soft flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-primary font-body text-xs font-bold uppercase tracking-wider">
              <Smile size={16} />
              <span>Atendimento em Foco</span>
            </div>
            <span className="text-xs text-muted-foreground font-body">
              {agendamentosHoje.length} agendamento{agendamentosHoje.length !== 1 ? "s" : ""} hoje
            </span>
          </div>

          {proximoAgendamento ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-black text-xl shrink-0 shadow-inner">
                  {(proximoAgendamento.nome_cliente ?? proximoAgendamento.nomeCliente ?? "C")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary font-body text-xs font-bold mb-1">
                    Próxima Consulta às {proximoAgendamento.horario}
                  </span>
                  <h3 className="font-display font-bold text-2xl text-foreground">
                    {proximoAgendamento.nome_cliente ?? proximoAgendamento.nomeCliente}
                  </h3>
                  <p className="font-body text-sm font-medium text-muted-foreground mt-0.5">
                    Serviço: {proximoAgendamento.servico_nome ?? proximoAgendamento.servico ?? "Consulta"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/20">
                <Link
                  to="/admin/resumo"
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-xs hover:opacity-95 transition-opacity inline-flex items-center gap-1.5"
                >
                  <span>Abrir no Resumo do Dia</span>
                  <ArrowRight size={14} />
                </Link>

                {proximoAgendamento.cliente_telefone && (
                  <a
                    href={`https://wa.me/55${proximoAgendamento.cliente_telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 font-body font-bold text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <MessageSquare size={14} />
                    <span>Mandar WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center lg:text-left space-y-2">
              <h3 className="font-display font-bold text-xl text-foreground">
                Tudo tranquilo por enquanto! 🌿
              </h3>
              <p className="font-body text-sm text-muted-foreground max-w-md">
                Você não possui consultas pendentes para este momento. Aproveite para planejar seus
                horários ou divulgar sua agenda para preencher os próximos dias.
              </p>
              <div className="pt-3">
                <button
                  onClick={() => setModalNovoAberto(true)}
                  className="px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-body font-bold text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Cadastrar paciente agora</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Métricas e Estatísticas Rápidas */}
        <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/40 shadow-soft flex flex-col justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users size={14} className="text-primary" />
              <span>Sua Base de Pacientes</span>
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-display font-extrabold text-foreground">
                {totalClientes}
              </span>
              <span className="text-xs font-body font-semibold text-muted-foreground">
                pacientes cadastrados
              </span>
            </div>
            <p className="font-body text-xs text-muted-foreground mt-2 leading-relaxed">
              Cada pessoa que agenda com você fica salva automaticamente com nome e telefone para
              busca rápida.
            </p>
          </div>

          <div className="pt-4 border-t border-border/20 flex flex-col gap-2">
            <Link
              to="/admin/agenda"
              className="text-xs font-body font-bold text-primary hover:underline flex items-center justify-between group"
            >
              <span>Ver agenda semanal</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/admin/resumo"
              className="text-xs font-body font-bold text-muted-foreground hover:text-foreground hover:underline flex items-center justify-between group"
            >
              <span>Gerenciar confirmações</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* 4. Central de Notificações & Avisos Interessantes             */}
      {/* ────────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <BellRing size={18} className="text-primary" />
              <span>Avisos, Notificações & Dicas Úteis</span>
            </h2>
            <p className="text-xs font-body text-muted-foreground mt-0.5">
              Informações selecionadas para manter seu atendimento organizado e eficiente
            </p>
          </div>

          {/* Abas de Filtro das Notificações */}
          <div className="flex items-center gap-1.5 p-1 bg-secondary/80 rounded-xl border border-border/40 self-start">
            <button
              onClick={() => setFiltroAba("todas")}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                filtroAba === "todas"
                  ? "bg-card text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas ({listaNotificacoes.length - notificacoesDispensadas.length})
            </button>
            <button
              onClick={() => setFiltroAba("pendencias")}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                filtroAba === "pendencias"
                  ? "bg-card text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Atenção
            </button>
            <button
              onClick={() => setFiltroAba("dicas")}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-bold transition-all cursor-pointer ${
                filtroAba === "dicas"
                  ? "bg-card text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dicas & Boas Práticas
            </button>
          </div>
        </div>

        {/* Lista de Cards de Notificações */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {notificacoesFiltradas.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 text-center bg-card rounded-2xl border border-border/30"
              >
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="font-display font-bold text-base text-foreground">
                  Tudo limpo por aqui!
                </p>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  Você visualizou ou dispensou todos os avisos desta categoria.
                </p>
              </motion.div>
            ) : (
              notificacoesFiltradas.map((notif) => {
                const configTipos = {
                  urgente: {
                    borda: "border-l-amber-500 bg-amber-500/5",
                    icone: <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />,
                    tag: "Ação Necessária",
                    tagCor: "bg-amber-500/15 text-amber-700",
                  },
                  sucesso: {
                    borda: "border-l-emerald-500 bg-emerald-500/5",
                    icone: <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />,
                    tag: "Sincronizado",
                    tagCor: "bg-emerald-500/15 text-emerald-700",
                  },
                  info: {
                    borda: "border-l-primary bg-primary/5",
                    icone: <Calendar size={20} className="text-primary shrink-0 mt-0.5" />,
                    tag: "Hoje",
                    tagCor: "bg-primary/15 text-primary",
                  },
                  dica: {
                    borda: "border-l-indigo-500 bg-indigo-500/5",
                    icone: <Lightbulb size={20} className="text-indigo-600 shrink-0 mt-0.5" />,
                    tag: "Dica Prática",
                    tagCor: "bg-indigo-500/15 text-indigo-700",
                  },
                };

                const conf = configTipos[notif.tipo];

                return (
                  <motion.div
                    key={notif.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`p-5 rounded-2xl border border-border/30 border-l-4 ${conf.borda} bg-card shadow-soft flex items-start justify-between gap-4 transition-all`}
                  >
                    <div className="flex items-start gap-3.5">
                      {conf.icone}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-body font-bold text-[10px] uppercase tracking-wider ${conf.tagCor}`}>
                            {conf.tag}
                          </span>
                          <h4 className="font-display font-bold text-sm text-foreground">
                            {notif.titulo}
                          </h4>
                        </div>
                        <p className="font-body text-xs text-muted-foreground leading-relaxed max-w-3xl">
                          {notif.descricao}
                        </p>

                        {/* Botões de Ação na Notificação */}
                        {(notif.acaoLink || notif.acaoHandler) && (
                          <div className="pt-2 flex items-center gap-2">
                            {notif.acaoLink ? (
                              <Link
                                to={notif.acaoLink}
                                className="text-xs font-body font-bold text-primary hover:underline inline-flex items-center gap-1"
                              >
                                <span>{notif.acaoTexto}</span>
                                <ArrowRight size={12} />
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={notif.acaoHandler}
                                className="text-xs font-body font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>{notif.acaoTexto}</span>
                                <ArrowRight size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botão de Dispensar Aviso */}
                    <button
                      type="button"
                      onClick={() => dispensarNotificacao(notif.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                      title="Dispensar aviso"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* 5. Dica de Segurança & Suporte                                */}
      {/* ────────────────────────────────────────────────────────────── */}
      <footer className="p-6 rounded-2xl bg-secondary/50 border border-border/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-body text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={18} className="text-primary shrink-0" />
          <span>
            Seus dados e consultas estão protegidos com criptografia e sincronização em nuvem pelo Supabase.
          </span>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline shrink-0"
        >
          <span>Visualizar minha página como cliente</span>
          <ExternalLink size={13} />
        </a>
      </footer>
    </div>
  );
}
