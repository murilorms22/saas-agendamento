import { useState, useEffect, useMemo } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  isPast,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CalendarCheck,
  Sparkles,
  UserCheck,
  LogOut,
  Mail,
  Lock,
  Loader2,
  Calendar as CalendarIcon,
  Receipt,
  RotateCcw,
  LogIn,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useSearchParams } from "react-router-dom";
import { useProfessional, extrairMinutos, type Servico } from "../../store/useProfessional";
import { useAuth } from "../../contexts/AuthContext";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { ModalAuthPaciente } from "../../components/ModalAuthPaciente";
import { ModalMeusAgendamentos } from "../../components/ModalMeusAgendamentos";

export default function LandingPage() {
  return (
    <PageLoader>
      <FluxoAgendamentoConteudo />
    </PageLoader>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos & Etapas do Stepper
// ─────────────────────────────────────────────────────────────────────────────

type EtapaFluxo = 1 | 2 | 3 | 4;

interface ClienteAutenticado {
  id: string;
  empresa_id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  cpf?: string | null;
  auth_user_id?: string | null;
}

const ETAPAS = [
  { numero: 1, label: "Serviço", icone: Sparkles, descricao: "Escolha o atendimento" },
  { numero: 2, label: "Data e Hora", icone: CalendarDays, descricao: "Escolha o melhor horário" },
  { numero: 3, label: "Identificação", icone: UserCheck, descricao: "Seus dados de contato" },
  { numero: 4, label: "Confirmação", icone: Receipt, descricao: "Revise e confirme" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Sanitização e Validação
// ─────────────────────────────────────────────────────────────────────────────

/** Validação estrita de CPF via Módulo 11 (dois dígitos verificadores) */
function validarCPF(cpf: string): boolean {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(10), 10)) return false;

  return true;
}

function mascararTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 2) return digitos ? `(${digitos}` : "";
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`;
}

function mascararCPF(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 3) return digitos;
  if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

function sanitizarTexto(valor: string): string {
  if (!valor) return "";
  let limpo = valor.replace(/<[^>]*>?/gm, "");
  limpo = limpo.replace(/^[=+\-@|;`]+/, "");
  limpo = limpo.replace(/[^\p{L}\s'’-]/gu, "");
  return limpo.replace(/\s+/g, " ").trim().slice(0, 80);
}

function sanitizarTelefone(valor: string): string {
  if (!valor) return "";
  return valor.replace(/\D/g, "").slice(0, 11);
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal de Conteúdo
// ─────────────────────────────────────────────────────────────────────────────

function FluxoAgendamentoConteudo() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const { profissional: profissionalNullable } = useProfessional();
  const profissional = profissionalNullable!; // seguro: PageLoader garante não-null
  const { user, signInWithGoogle, signOut } = useAuth();

  const slugAtivo = slug || searchParams.get("slug") || profissional.slug;

  // Atualiza o título da aba com o nome da clínica
  useEffect(() => {
    if (profissional?.nomeClinica) {
      document.title = `${profissional.nomeClinica} | Agendamento Online`;
    }
  }, [profissional?.nomeClinica, slugAtivo]);

  // ── Estados do Stepper ──
  const [passoAtual, setPassoAtual] = useState<EtapaFluxo>(1);
  const [servicoEscolhido, setServicoEscolhido] = useState<Servico | null>(null);

  // ── Etapa 2: Data e Horário ──
  const [mesAtual, setMesAtual] = useState<Date>(startOfMonth(new Date()));
  const [dataSelecionada, setDataSelecionada] = useState<Date>(new Date());
  const [horarioSelecionado, setHorarioSelecionado] = useState<string | null>(null);
  const [horariosOcupados, setHorariosOcupados] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);

  // ── Etapa 3: Identificação / Autenticação ──
  const [clienteLogado, setClienteLogado] = useState<ClienteAutenticado | null>(null);
  const [isContaGestor, setIsContaGestor] = useState(false);
  const [abaAuth, setAbaAuth] = useState<"login" | "cadastro">("cadastro");
  const [iniciandoGoogle, setIniciandoGoogle] = useState(false);

  // Formulário de Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");

  // Formulário de Cadastro
  const [cadNome, setCadNome] = useState("");
  const [cadWhatsapp, setCadWhatsapp] = useState("");
  const [cadCpf, setCadCpf] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadSenha, setCadSenha] = useState("");

  // Modais de Autenticação e Meus Agendamentos
  const [modalAuthAberto, setModalAuthAberto] = useState(false);
  const [modalMeusAgendamentosAberto, setModalMeusAgendamentosAberto] = useState(false);
  const [menuDropdownAberto, setMenuDropdownAberto] = useState(false);

  // ── Etapa 4: Confirmação & Submissão ──
  const [salvando, setSalvando] = useState(false);
  const [sucessoFinal, setSucessoFinal] = useState(false);

  // ── Toast de Feedback ──
  const [toast, setToast] = useState<{
    tipo: "warning" | "error" | "info" | "success";
    mensagem: string;
  } | null>(null);

  const exibirToast = (
    mensagem: string,
    tipo: "warning" | "error" | "info" | "success" = "warning"
  ) => {
    setToast({ tipo, mensagem });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Session Guard: Chaves e Métodos de Preservação no sessionStorage ──
  const STORAGE_KEYS = {
    SERVICO: "facil_servico",
    DATA: "facil_data",
    HORARIO: "facil_horario",
    PASSO: "facil_passo",
  };

  const salvarNoSession = (chave: string, valor: any) => {
    try {
      if (valor === null || valor === undefined) {
        sessionStorage.removeItem(chave);
      } else {
        sessionStorage.setItem(chave, JSON.stringify(valor));
      }
    } catch (e) {
      console.warn("[LandingPage] Erro ao gravar no sessionStorage:", e);
    }
  };

  const lerDoSession = (chave: string) => {
    try {
      const item = sessionStorage.getItem(chave);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  };

  const limparSessionGuard = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.SERVICO);
      sessionStorage.removeItem(STORAGE_KEYS.DATA);
      sessionStorage.removeItem(STORAGE_KEYS.HORARIO);
      sessionStorage.removeItem(STORAGE_KEYS.PASSO);
    } catch (e) {
      console.warn("[LandingPage] Erro ao limpar sessionStorage:", e);
    }
  };

  const navegarParaPasso = (novoPasso: EtapaFluxo) => {
    setPassoAtual(novoPasso);
    salvarNoSession(STORAGE_KEYS.PASSO, novoPasso);
  };

  const handleSelecionarServico = (servico: Servico) => {
    setServicoEscolhido(servico);
    salvarNoSession(STORAGE_KEYS.SERVICO, servico);
    navegarParaPasso(2);
  };

  const handleSelecionarData = (dia: Date) => {
    setDataSelecionada(dia);
    salvarNoSession(STORAGE_KEYS.DATA, dia.toISOString());
    setHorarioSelecionado(null);
    salvarNoSession(STORAGE_KEYS.HORARIO, null);
  };

  const handleSelecionarHorario = (slot: string) => {
    if (horariosOcupados.includes(slot)) {
      exibirToast("Este horário já está reservado por outro cliente. Por favor, escolha outro.", "warning");
      return;
    }
    if (isToday(dataSelecionada)) {
      const agora = new Date();
      const [h, m = 0] = slot.split(":").map(Number);
      if (h * 60 + m <= agora.getHours() * 60 + agora.getMinutes()) {
        exibirToast("Este horário já passou. Escolha um horário futuro para hoje.", "warning");
        return;
      }
    }
    setHorarioSelecionado(slot);
    salvarNoSession(STORAGE_KEYS.HORARIO, slot);
  };

  // ── Session Guard: Restauração no carregamento inicial da página ──
  useEffect(() => {
    try {
      const servicoSalvo = lerDoSession(STORAGE_KEYS.SERVICO);
      const dataSalva = lerDoSession(STORAGE_KEYS.DATA);
      const horarioSalvo = lerDoSession(STORAGE_KEYS.HORARIO);
      const passoSalvo = Number(lerDoSession(STORAGE_KEYS.PASSO) || 0);

      let temServico = false;
      if (servicoSalvo && servicoSalvo.id) {
        const encontrado = profissional.servicos.find((s) => s.id === servicoSalvo.id) || servicoSalvo;
        setServicoEscolhido(encontrado);
        temServico = true;
      }

      let temData = false;
      if (dataSalva) {
        const parsed = new Date(dataSalva);
        if (!isNaN(parsed.getTime())) {
          setDataSelecionada(parsed);
          setMesAtual(startOfMonth(parsed));
          temData = true;
        }
      }

      let temHorario = false;
      if (horarioSalvo && typeof horarioSalvo === "string") {
        setHorarioSelecionado(horarioSalvo);
        temHorario = true;
      }

      // Se temos serviço, data e horário restaurados:
      if (temServico && temData && temHorario) {
        const etapaDestino = (user?.id || clienteLogado) ? 4 : 3;
        setPassoAtual(passoSalvo >= 3 ? (passoSalvo as EtapaFluxo) : etapaDestino);
      } else if (temServico) {
        setPassoAtual(2);
      }
    } catch (err) {
      console.warn("[LandingPage] Erro ao restaurar session guard:", err);
    }
  }, [profissional?.servicos]);

  // ── Reconhecimento Automático de Sessão do Paciente ou Gestor ──
  useEffect(() => {
    let ativo = true;

    async function buscarPacienteAutenticado() {
      if (!user?.id || !profissional?.id) {
        if (ativo) {
          setClienteLogado(null);
          setIsContaGestor(false);
        }
        return;
      }

      try {
        // 1. Checa se o usuário autenticado é o dono da empresa / gestor administrativo
        const { data: empresaDono } = await supabase
          .from("empresas")
          .select("id")
          .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
          .maybeSingle();

        if (!ativo) return;

        if (empresaDono) {
          setIsContaGestor(true);
          setClienteLogado(null);
          return;
        }

        setIsContaGestor(false);

        // 2. Busca o registro de cliente vinculado ao auth_user_id nesta clínica
        let { data: cliente } = await supabase
          .from("clientes")
          .select("*")
          .eq("empresa_id", profissional.id)
          .eq("auth_user_id", user.id)
          .maybeSingle();

        // 3. Se não encontrou por auth_user_id, tenta vincular por e-mail caso já exista na base
        if (!cliente && user.email) {
          const { data: clienteEmail } = await supabase
            .from("clientes")
            .select("*")
            .eq("empresa_id", profissional.id)
            .eq("email", user.email)
            .maybeSingle();

          if (clienteEmail) {
            await supabase
              .from("clientes")
              .update({ auth_user_id: user.id })
              .eq("id", clienteEmail.id);
            cliente = { ...clienteEmail, auth_user_id: user.id };
          }
        }

        // 4. Se ainda não existir registro na tabela clientes, cria automaticamente para o paciente
        if (!cliente) {
          const nomeFallback =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Paciente";
          const telFallback =
            user.user_metadata?.telefone || user.user_metadata?.phone || "";

          const { data: novoCliente, error: errCriar } = await supabase
            .from("clientes")
            .insert({
              empresa_id: profissional.id,
              nome: nomeFallback,
              telefone: telFallback,
              email: user.email,
              auth_user_id: user.id,
            })
            .select()
            .maybeSingle();

          if (!errCriar && novoCliente) {
            cliente = novoCliente;
          }
        }

        if (!ativo) return;

        if (cliente) {
          setClienteLogado(cliente);
          setCadNome(cliente.nome);
          setCadWhatsapp(mascararTelefone(cliente.telefone));
          if (cliente.cpf) setCadCpf(mascararCPF(cliente.cpf));
          if (cliente.email) setCadEmail(cliente.email);
        } else {
          setClienteLogado({
            id: user.id,
            empresa_id: profissional.id,
            nome: user.user_metadata?.full_name || "Paciente",
            telefone: user.user_metadata?.telefone || "",
            email: user.email,
            auth_user_id: user.id,
          });
        }
      } catch (err) {
        console.error("[LandingPage] Erro ao buscar dados do paciente:", err);
      }
    }

    buscarPacienteAutenticado();

    return () => {
      ativo = false;
    };
  }, [user?.id, profissional?.id]);

  // ── Busca de Horários Ocupados do Banco para a Data Selecionada ──
  useEffect(() => {
    let ativo = true;

    async function buscarOcupados() {
      if (!dataSelecionada || !profissional?.id) return;
      setCarregandoHorarios(true);

      const dataStr = format(dataSelecionada, "yyyy-MM-dd");

      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("horario, status")
          .eq("empresa_id", profissional.id)
          .eq("data", dataStr)
          .neq("status", "Cancelado");

        if (!ativo) return;

        if (!error && data) {
          const ocupados = data
            .map((item: any) => item.horario?.slice(0, 5))
            .filter(Boolean);
          setHorariosOcupados(ocupados);
        } else {
          setHorariosOcupados([]);
        }
      } catch (err) {
        console.error("[LandingPage] Erro ao consultar horários ocupados:", err);
      } finally {
        if (ativo) setCarregandoHorarios(false);
      }
    }

    buscarOcupados();

    return () => {
      ativo = false;
    };
  }, [dataSelecionada, profissional?.id]);

  // ── Cálculo dos Slots Disponíveis do Dia com base na Disponibilidade ──
  const slotsDoDia = useMemo<{ slots: string[]; bloqueado: boolean; motivo?: string }>(() => {
    const dataStr = format(dataSelecionada, "yyyy-MM-dd");
    const hoje = isToday(dataSelecionada);
    const diaPassado = isPast(dataSelecionada) && !hoje;

    if (diaPassado) {
      return { slots: [], bloqueado: true, motivo: "Esta data já pertence ao passado." };
    }

    // 1. Checa se o dia é um bloqueio ou folga configurada
    const bloqueios = profissional.disponibilidade?.bloqueios as
      | Array<{ data: string; motivo: string }>
      | undefined;
    if (bloqueios) {
      const b = bloqueios.find((item) => item.data === dataStr);
      if (b) {
        return { slots: [], bloqueado: true, motivo: b.motivo || "Data indisponível" };
      }
    }

    // 2. Extrai intervalo em minutos (prioriza o serviço escolhido, depois configuração da clínica, com fallback 60 min)
    const intervaloMinutos = extrairMinutos(
      servicoEscolhido?.duracao ||
        profissional.disponibilidade?.duracaoAtendimento ||
        profissional.disponibilidade?.intervaloMinutos,
      60
    );

    // 3. Checa horários do dia da semana e remove intervalos
    const mapaDias: Array<"dom" | "seg" | "ter" | "qua" | "qui" | "sex" | "sab"> = [
      "dom",
      "seg",
      "ter",
      "qua",
      "qui",
      "sex",
      "sab",
    ];
    const diaSemana = mapaDias[dataSelecionada.getDay()];
    const configDia = profissional.disponibilidade?.horarios?.[diaSemana];

    let todosSlots: string[] = [];

    if (configDia) {
      if (!configDia.ativo) {
        return { slots: [], bloqueado: true, motivo: "Sem atendimento neste dia da semana" };
      }

      const [hIni, mIni = 0] = (configDia.inicio || "08:00").split(":").map(Number);
      const [hFim, mFim = 0] = (configDia.fim || "18:00").split(":").map(Number);

      const minInicio = hIni * 60 + mIni;
      const minFim = hFim * 60 + mFim;

      let minIntIni = -1;
      let minIntFim = -1;
      if (configDia.temIntervalo && configDia.intervaloInicio && configDia.intervaloFim) {
        const [hi, mi = 0] = configDia.intervaloInicio.split(":").map(Number);
        const [hf, mf = 0] = configDia.intervaloFim.split(":").map(Number);
        minIntIni = hi * 60 + mi;
        minIntFim = hf * 60 + mf;
      }

      for (let cur = minInicio; cur + intervaloMinutos <= minFim; cur += intervaloMinutos) {
        // Exclui os horários de almoço / intervalo configurados
        if (configDia.temIntervalo && cur >= minIntIni && cur < minIntFim) {
          continue;
        }
        const hh = Math.floor(cur / 60);
        const mm = cur % 60;
        todosSlots.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      }
    } else {
      // Fallback padrão
      todosSlots = [
        ...(profissional.horariosDisponiveis || [
          "08:00",
          "09:00",
          "10:00",
          "11:00",
          "13:00",
          "14:00",
          "15:00",
          "16:00",
          "17:00",
        ]),
      ];
    }

    // 4. Se a data for hoje, remove da lista de opções todos os horários que já passaram
    if (hoje) {
      const agora = new Date();
      const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
      todosSlots = todosSlots.filter((slot) => {
        const [h, m = 0] = slot.split(":").map(Number);
        return h * 60 + m > minutosAgora;
      });
    }

    return { slots: todosSlots, bloqueado: false };
  }, [dataSelecionada, profissional.disponibilidade, profissional.horariosDisponiveis, servicoEscolhido?.duracao]);

  // ── Auto-limpeza de Horário Inválido / Expirado ──
  useEffect(() => {
    if (horarioSelecionado) {
      const estaNosSlots = slotsDoDia.slots.includes(horarioSelecionado);
      const estaOcupado = horariosOcupados.includes(horarioSelecionado);
      if (!estaNosSlots || estaOcupado) {
        setHorarioSelecionado(null);
        try {
          sessionStorage.removeItem(STORAGE_KEYS.HORARIO);
        } catch (e) {}
      }
    }
  }, [slotsDoDia.slots, horariosOcupados, horarioSelecionado]);

  // ── Calendário: Helpers de Navegação ──
  const proximoMes = () => setMesAtual(addMonths(mesAtual, 1));
  const mesAnterior = () => setMesAtual(subMonths(mesAtual, 1));

  // ── Ações de Autenticação Inline (Etapa 3) ──

  const handleLoginInline = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLimpo = loginEmail.trim().toLowerCase();
    if (!emailLimpo || !loginSenha) {
      exibirToast("Informe seu e-mail e senha para entrar.", "warning");
      return;
    }

    setSalvando(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: loginSenha,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          exibirToast("E-mail ou senha incorretos.", "error");
        } else {
          exibirToast("Não foi possível realizar login. Verifique suas credenciais.", "error");
        }
        setSalvando(false);
        return;
      }

      // Busca cliente na tabela
      const { data: cliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("empresa_id", profissional.id)
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();

      const clienteFinal: ClienteAutenticado = cliente ?? {
        id: authData.user.id,
        empresa_id: profissional.id,
        nome: authData.user.user_metadata?.full_name || "Paciente",
        telefone: "",
        email: authData.user.email,
        auth_user_id: authData.user.id,
      };

      setClienteLogado(clienteFinal);
      exibirToast(`Login realizado com sucesso! Bem-vindo(a), ${clienteFinal.nome.split(" ")[0]}.`, "success");
      navegarParaPasso(4); // Avança magicamente direto para a confirmação
    } catch (err) {
      console.error("[LandingPage] Erro no login:", err);
      exibirToast("Erro de conexão ao autenticar.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const handleCadastroInline = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = sanitizarTexto(cadNome);
    const telefoneLimpo = sanitizarTelefone(cadWhatsapp);
    const cpfLimpo = cadCpf.replace(/\D/g, "");
    const emailLimpo = cadEmail.trim().toLowerCase();

    if (!nomeLimpo || nomeLimpo.length < 3) {
      exibirToast("Informe seu nome completo (pelo menos 3 letras).", "warning");
      return;
    }
    if (!telefoneLimpo || telefoneLimpo.length < 10) {
      exibirToast("Informe um número de WhatsApp válido com DDD.", "warning");
      return;
    }
    if (!validarCPF(cpfLimpo)) {
      exibirToast("O CPF informado é inválido. Verifique os números digitados.", "warning");
      return;
    }
    if (cadSenha.length < 6) {
      exibirToast("A senha deve conter no mínimo 6 caracteres.", "warning");
      return;
    }

    setSalvando(true);
    try {
      // 1. Supabase Auth SignUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailLimpo,
        password: cadSenha,
        options: {
          data: {
            full_name: nomeLimpo,
            telefone: telefoneLimpo,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          exibirToast("Este e-mail já possui cadastro. Use a aba 'Já tenho conta' para entrar.", "info");
          setAbaAuth("login");
          setLoginEmail(emailLimpo);
        } else if (authError.message.toLowerCase().includes("rate limit")) {
          exibirToast("Muitas tentativas recentes. Aguarde instantes antes de tentar novamente.", "warning");
        } else {
          exibirToast("Não foi possível concluir o cadastro. Verifique os dados informados.", "error");
        }
        setSalvando(false);
        return;
      }

      if (!authData.user) {
        exibirToast("Não foi possível criar sua conta. Tente novamente.", "error");
        setSalvando(false);
        return;
      }

      // 2. Grava na tabela clientes
      const { data: clienteCriado, error: errCliente } = await supabase
        .from("clientes")
        .insert({
          empresa_id: profissional.id,
          nome: nomeLimpo,
          telefone: telefoneLimpo,
          email: emailLimpo,
          cpf: cpfLimpo,
          auth_user_id: authData.user.id,
        })
        .select()
        .single();

      if (errCliente) {
        console.warn("[LandingPage] Aviso ao criar registro de cliente:", errCliente.message);
      }

      const clienteFinal: ClienteAutenticado = clienteCriado ?? {
        id: authData.user.id,
        empresa_id: profissional.id,
        nome: nomeLimpo,
        telefone: telefoneLimpo,
        email: emailLimpo,
        cpf: cpfLimpo,
        auth_user_id: authData.user.id,
      };

      setClienteLogado(clienteFinal);
      exibirToast(`Cadastro concluído com sucesso! Bem-vindo(a), ${clienteFinal.nome.split(" ")[0]}.`, "success");
      navegarParaPasso(4); // Avança magicamente direto para a confirmação
    } catch (err) {
      console.error("[LandingPage] Erro inesperado ao cadastrar:", err);
      exibirToast("Erro de conexão ao processar cadastro.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const handleSucessoAuthModal = (cliente: ClienteAutenticado) => {
    setClienteLogado(cliente);
    setModalAuthAberto(false);
    exibirToast(`Login realizado com sucesso! Bem-vindo(a), ${cliente.nome.split(" ")[0]}.`, "success");
  };

  const handleDeslogarCliente = async () => {
    try {
      setSalvando(true);
      await signOut();
      setClienteLogado(null);
      setIsContaGestor(false);
      setLoginEmail("");
      setLoginSenha("");
      setCadNome("");
      setCadWhatsapp("");
      setCadCpf("");
      setCadEmail("");
      setCadSenha("");
      exibirToast("Você saiu da sua conta com sucesso.", "info");
    } catch (e) {
      console.error("[LandingPage] Erro ao deslogar:", e);
      exibirToast("Erro ao encerrar sessão.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const handleLoginGoogle = async () => {
    salvarNoSession(STORAGE_KEYS.PASSO, 4);
    setIniciandoGoogle(true);
    try {
      const { error } = await signInWithGoogle(window.location.href);
      if (error) {
        exibirToast("Não foi possível iniciar o login com o Google. Tente novamente.", "error");
        setIniciandoGoogle(false);
      }
    } catch (err) {
      console.error("[LandingPage] Erro ao autenticar com Google:", err);
      exibirToast("Falha de conexão com o Google.", "error");
      setIniciandoGoogle(false);
    }
  };

  // ── Logout e Troca de Conta Preservando as Escolhas (Etapa 3) ──
  const handleTrocarConta = async () => {
    try {
      setSalvando(true);
      await signOut();
      setClienteLogado(null);
      setIsContaGestor(false);
      setLoginEmail("");
      setLoginSenha("");
      setCadNome("");
      setCadWhatsapp("");
      setCadCpf("");
      setCadEmail("");
      setCadSenha("");
      exibirToast("Você saiu da sua conta.", "info");
      // Permanece estritamente na Etapa 3 com as escolhas (serviço, data, hora) intactas
      navegarParaPasso(3);
    } catch (e) {
      console.error("[LandingPage] Erro ao trocar de conta:", e);
    } finally {
      setSalvando(false);
    }
  };

  // ── Etapa 4: Finalização Segura do Agendamento (Red Team Protected) ──
  const handleConfirmarAgendamento = async () => {
    if (isContaGestor) {
      exibirToast("Você está conectado como Administrador desta clínica. Troque de conta para agendar como paciente.", "warning");
      return;
    }

    if (!servicoEscolhido || !dataSelecionada || !horarioSelecionado) {
      exibirToast("Dados incompletos para confirmar o agendamento.", "error");
      navegarParaPasso(1);
      return;
    }

    // 🛡️ Red Team: Obtém o usuário autenticado atual diretamente do Supabase Auth
    // garantindo que cliente_id pertença estritamente ao usuário real autenticado na sessão
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      exibirToast("Sua sessão expirou. Identifique-se para confirmar sua consulta.", "warning");
      navegarParaPasso(3);
      return;
    }

    // Busca ou garante registro na tabela 'clientes' vinculado ao auth_user_id
    let clienteNome =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      clienteLogado?.nome ||
      "Paciente";
    let clienteTel =
      currentUser.user_metadata?.telefone ||
      currentUser.user_metadata?.phone ||
      clienteLogado?.telefone ||
      "";

    let { data: clienteBanco } = await supabase
      .from("clientes")
      .select("id, nome, telefone")
      .eq("empresa_id", profissional.id)
      .eq("auth_user_id", currentUser.id)
      .maybeSingle();

    if (!clienteBanco && currentUser.email) {
      const { data: clienteEmail } = await supabase
        .from("clientes")
        .select("id, nome, telefone")
        .eq("empresa_id", profissional.id)
        .eq("email", currentUser.email)
        .maybeSingle();

      if (clienteEmail) {
        await supabase
          .from("clientes")
          .update({ auth_user_id: currentUser.id })
          .eq("id", clienteEmail.id);
        clienteBanco = clienteEmail;
      }
    }

    if (!clienteBanco) {
      const { data: novoCliente, error: errNovo } = await supabase
        .from("clientes")
        .insert({
          empresa_id: profissional.id,
          nome: clienteNome,
          telefone: clienteTel,
          email: currentUser.email,
          auth_user_id: currentUser.id,
        })
        .select("id, nome, telefone")
        .maybeSingle();

      if (!errNovo && novoCliente) {
        clienteBanco = novoCliente;
      } else if (errNovo) {
        console.error("[LandingPage] Falha ao auto-provisionar cliente:", errNovo);
      }
    }

    if (clienteBanco) {
      if (clienteBanco.nome) clienteNome = clienteBanco.nome;
      if (clienteBanco.telefone) clienteTel = clienteBanco.telefone;
    }

    setSalvando(true);
    const dataStr = format(dataSelecionada, "yyyy-MM-dd");

    try {
      // 🛡️ 1. Trava de Concorrência (Race Condition Check): Checa se o horário já foi ocupado
      const { data: conflitos, error: errConflito } = await supabase
        .from("agendamentos")
        .select("id")
        .eq("empresa_id", profissional.id)
        .eq("data", dataStr)
        .or(`horario.eq.${horarioSelecionado},horario.eq.${horarioSelecionado}:00`)
        .neq("status", "Cancelado")
        .limit(1);

      if (!errConflito && conflitos && conflitos.length > 0) {
        // Interrompe o fluxo imediatamente e reseta o loading
        setSalvando(false);

        // Exibe Toast de aviso amigável (estilo Warning)
        exibirToast(
          "Ops! Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário disponível.",
          "warning"
        );

        // Adiciona à lista de ocupados para atualizar a grade visual
        setHorariosOcupados((prev) => [...prev, horarioSelecionado]);

        // Limpa o estado do horário anterior no React e no Session Guard
        setHorarioSelecionado(null);
        salvarNoSession(STORAGE_KEYS.HORARIO, null);

        // Retorna o usuário automaticamente para a Etapa 2 (Data e Hora)
        navegarParaPasso(2);

        return;
      }

      // 🛡️ 2. Inserção Segura do Agendamento usando cliente_id e user_id
      const dataHoraIso = `${dataStr}T${horarioSelecionado}:00Z`;

      const agendamentoPayload: Record<string, any> = {
        empresa_id: profissional.id,
        user_id: currentUser.id,
        nome_cliente: clienteNome,
        whatsapp_cliente: clienteTel,
        cliente_telefone: clienteTel,
        servico_id: servicoEscolhido.id,
        servico_nome: servicoEscolhido.nome,
        data: dataStr,
        horario: horarioSelecionado,
        data_hora_agendamento: dataHoraIso,
        status: "Pendente",
      };

      if (clienteBanco?.id) {
        agendamentoPayload.cliente_id = clienteBanco.id;
      }

      let { error: insertError } = await supabase.from("agendamentos").insert(agendamentoPayload);

      // Fallback de retrocompatibilidade: se a coluna user_id ainda não existir no schema do banco
      if (insertError && /user_id/i.test(insertError.message || insertError.details || "")) {
        console.warn("[LandingPage] Coluna user_id não encontrada, realizando retry sem user_id...", insertError);
        const { user_id: _uid, ...payloadSemUserId } = agendamentoPayload;
        const retry = await supabase.from("agendamentos").insert(payloadSemUserId);
        insertError = retry.error;
      }

      if (insertError) {
        console.error("[LandingPage] Erro ao gravar agendamento:", insertError);
        const textoErro = insertError.message || insertError.details || "";

        // 🛡️ Captura da Trigger de Limite de 3 Agendamentos
        if (/limite m[aá]ximo de 3 agendamentos/i.test(textoErro)) {
          exibirToast(
            "Você já possui 3 agendamentos ativos. Aguarde a finalização de uma consulta para agendar novamente.",
            "warning"
          );
        } else if (
          /unique constraint|duplicate key|idx_agendamentos_concorrencia|23505/i.test(
            textoErro
          )
        ) {
          // 🛡️ Trava Atômica do PostgreSQL contra Concorrência / Race Condition
          exibirToast(
            "Ops! Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário disponível.",
            "warning"
          );
          setHorariosOcupados((prev) => [...prev, horarioSelecionado]);
          setHorarioSelecionado(null);
          salvarNoSession(STORAGE_KEYS.HORARIO, null);
          navegarParaPasso(2);
        } else {
          exibirToast("Não foi possível registrar seu agendamento. Tente novamente.", "error");
        }
        setSalvando(false);
        return;
      }

      // Sucesso Total! Limpa o session guard
      limparSessionGuard();
      setSucessoFinal(true);
    } catch (err: any) {
      console.error("[LandingPage] Erro inesperado:", err);
      exibirToast("Erro de conexão ao consolidar agendamento.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const reiniciarFluxo = () => {
    limparSessionGuard();
    setPassoAtual(1);
    setServicoEscolhido(null);
    setHorarioSelecionado(null);
    setSucessoFinal(false);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 py-2 sm:py-4 px-3 sm:px-6 flex flex-col justify-start items-center relative overflow-y-auto">
      {/* ── Toast Flutuante de Alertas ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-floating border backdrop-blur-md text-xs font-body font-semibold max-w-md ${
              toast.tipo === "warning"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200"
                : toast.tipo === "error"
                ? "bg-rose-500/15 border-rose-500/30 text-rose-900 dark:text-rose-200"
                : toast.tipo === "success"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-card/90 border-border text-foreground"
            }`}
          >
            {toast.tipo === "warning" && <AlertTriangle size={16} className="text-amber-500 shrink-0" />}
            {toast.tipo === "error" && <AlertCircle size={16} className="text-rose-500 shrink-0" />}
            {toast.tipo === "success" && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
            <span className="leading-snug">{toast.mensagem}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Header Público da Clínica & Autenticação do Paciente ── */}
      <header className="w-full max-w-2xl mx-auto flex items-center justify-between py-1.5 px-2 mb-1 shrink-0">
        {/* Logo / Nome da Clínica */}
        <div className="flex items-center gap-2.5">
          {profissional.logoUrl ? (
            <img
              src={profissional.logoUrl}
              alt={profissional.nomeClinica}
              className="w-8 h-8 rounded-xl object-cover shadow-soft border border-border/50"
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-display font-extrabold text-xs border border-primary/20 shadow-soft">
              {profissional.nomeClinica.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-display font-bold text-xs sm:text-sm text-foreground leading-tight">
              {profissional.nomeClinica}
            </h2>
            <p className="font-body text-[10px] text-muted-foreground font-medium">
              {profissional.profissao || profissional.tagline || "Agendamento Online"}
            </p>
          </div>
        </div>

        {/* Área de Autenticação do Cliente */}
        <div className="relative">
          {user && clienteLogado ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuDropdownAberto(!menuDropdownAberto)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-card hover:bg-secondary/50 border border-border/80 shadow-soft transition-all text-foreground cursor-pointer text-xs"
              >
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-[11px] shadow-inner">
                  {clienteLogado.nome ? clienteLogado.nome.charAt(0).toUpperCase() : "P"}
                </div>
                <span className="font-body text-xs font-bold max-w-[120px] sm:max-w-[160px] truncate hidden sm:inline">
                  {clienteLogado.nome.split(" ")[0]}
                </span>
                <ChevronDown size={13} className="text-muted-foreground" />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {menuDropdownAberto && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuDropdownAberto(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-52 rounded-2xl bg-card border border-border shadow-floating z-50 p-1.5 space-y-0.5"
                    >
                      <div className="px-2.5 py-1.5 border-b border-border/40 mb-1">
                        <p className="font-display font-bold text-xs text-foreground truncate">
                          {clienteLogado.nome}
                        </p>
                        <p className="font-body text-[10px] text-muted-foreground truncate">
                          {clienteLogado.email || (clienteLogado.telefone ? mascararTelefone(clienteLogado.telefone) : user.email)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuDropdownAberto(false);
                          setModalMeusAgendamentosAberto(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-body font-semibold text-foreground hover:bg-secondary transition-colors cursor-pointer text-left"
                      >
                        <CalendarDays size={14} className="text-primary" />
                        <span>Meus Agendamentos</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          setMenuDropdownAberto(false);
                          await handleDeslogarCliente();
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-body font-semibold text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                      >
                        <LogOut size={14} />
                        <span>Sair da Conta</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setModalAuthAberto(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-secondary/70 border border-border/80 font-body font-bold text-xs text-foreground shadow-soft transition-all cursor-pointer"
            >
              <LogIn size={13} className="text-primary" />
              <span>Entrar / Cadastrar</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Stepper com Linha do Tempo Compacto ── */}
      {!sucessoFinal && (
        <div className="w-full max-w-md sm:max-w-lg mx-auto pt-1 pb-2.5 px-3 sm:px-6 shrink-0">
          <div className="flex items-center w-full">
            {ETAPAS.map((etapa, index) => {
              const concluida = etapa.numero < passoAtual;
              const ativa = etapa.numero === passoAtual;
              const Icone = etapa.icone;

              return (
                <div
                  key={etapa.numero}
                  className="flex items-center flex-1 last:flex-none"
                >
                  {/* Círculo com Label */}
                  <div className="relative flex flex-col items-center">
                    <motion.button
                      type="button"
                      animate={{ scale: ativa ? 1.08 : 1 }}
                      onClick={() => {
                        if (concluida) navegarParaPasso(etapa.numero as EtapaFluxo);
                      }}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-display font-bold text-[11px] sm:text-xs transition-all duration-300 shadow-soft shrink-0 ${
                        concluida
                          ? "bg-primary text-primary-foreground cursor-pointer"
                          : ativa
                          ? "bg-primary text-primary-foreground ring-2 ring-primary/25 shadow-soft-lg"
                          : "bg-card text-muted-foreground border border-border/70 cursor-default"
                      }`}
                      title={concluida ? `Voltar para etapa ${etapa.numero}` : etapa.label}
                    >
                      {concluida ? <Check size={13} className="stroke-[3]" /> : <Icone size={13} />}
                    </motion.button>

                    {/* Texto da Etapa */}
                    <span
                      className={`mt-1 font-body text-[10px] sm:text-[11px] whitespace-nowrap transition-colors select-none ${
                        ativa
                          ? "text-primary font-extrabold"
                          : concluida
                          ? "text-foreground font-semibold"
                          : "text-muted-foreground font-medium"
                      }`}
                    >
                      {etapa.numero}. {etapa.label}
                    </span>
                  </div>

                  {/* Linha conectora entre este círculo e o próximo */}
                  {index < ETAPAS.length - 1 && (
                    <div className="flex-1 h-0.5 bg-border/60 mx-1.5 sm:mx-2 rounded-full overflow-hidden relative">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={false}
                        animate={{
                          width: passoAtual > etapa.numero ? "100%" : "0%",
                        }}
                        transition={{ duration: 0.35, ease: "easeInOut" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Container Card Central com Glassmorphism ── */}
      <div className="w-full max-w-2xl bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-4 sm:p-6 shadow-floating flex flex-col transition-all">
        {/* Se já foi finalizado com sucesso, exibe tela de celebração compacta (sem scroll vertical) */}
        {sucessoFinal ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-2 sm:py-3 text-center space-y-3 max-w-sm sm:max-w-md mx-auto"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 mx-auto flex items-center justify-center ring-4 ring-emerald-500/10 shadow-soft">
              <CheckCircle2 size={26} />
            </div>

            <div className="space-y-0.5">
              <h2 className="text-lg sm:text-xl font-display font-extrabold text-foreground tracking-tight">
                Consulta Agendada!
              </h2>
              <p className="text-xs font-body text-muted-foreground">
                Seu agendamento foi registrado com sucesso. Aguardamos você!
              </p>
            </div>

            {/* Recibo Rápido do Sucesso Compacto */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-secondary/40 border border-border/60 text-left space-y-1.5 font-body text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Serviço:</span>
                <span className="font-bold text-foreground truncate max-w-[200px]">{servicoEscolhido?.nome}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Data & Horário:</span>
                <span className="font-bold text-primary capitalize">
                  {format(dataSelecionada, "dd 'de' MMMM", { locale: ptBR })} às {horarioSelecionado}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Paciente:</span>
                <span className="font-bold text-foreground truncate max-w-[200px]">{clienteLogado?.nome}</span>
              </div>
            </div>

            <div className="pt-1.5 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={reiniciarFluxo}
                className="flex-1 py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 font-body font-bold text-xs text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Agendar Outro</span>
              </button>
              <a
                href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                  `Consulta: ${servicoEscolhido?.nome} - ${profissional.nomeClinica}`
                )}&dates=${format(dataSelecionada, "yyyyMMdd")}T${horarioSelecionado?.replace(":", "")}00Z/${format(
                  dataSelecionada,
                  "yyyyMMdd"
                )}T${horarioSelecionado?.replace(":", "")}00Z&details=${encodeURIComponent(
                  `Profissional: ${profissional.nomeClinica}\nServiço: ${servicoEscolhido?.nome}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-3 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg transition-all flex items-center justify-center gap-2"
              >
                <CalendarIcon size={13} />
                <span>Google Agenda</span>
              </a>
            </div>
          </motion.div>
        ) : (
          <>
            {/* ── Tipografia Compacta da Etapa Atual ── */}
            <div className="text-center mb-2.5 sm:mb-3.5 max-w-md mx-auto space-y-0.5">
              <h1 className="text-base sm:text-lg lg:text-xl font-display font-extrabold text-primary tracking-tight leading-tight">
                {passoAtual === 1 && "Qual serviço você deseja agendar?"}
                {passoAtual === 2 && "Escolha o melhor dia e horário"}
                {passoAtual === 3 && "Como podemos te identificar?"}
                {passoAtual === 4 && "Confirme seu agendamento"}
              </h1>
              <p className="text-[11px] sm:text-xs font-body text-muted-foreground font-medium">
                {passoAtual === 1 && "Selecione um dos atendimentos disponíveis abaixo para continuar."}
                {passoAtual === 2 && "Selecione uma data no calendário e clique no horário mais conveniente."}
                {passoAtual === 3 && "Acesse sua conta ou informe seus dados para garantir a reserva."}
                {passoAtual === 4 && "Revise todas as informações antes de oficializar sua consulta."}
              </p>
            </div>

            {/* ── Conteúdo da Etapa Atual com AnimatePresence ── */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                {/* ── ETAPA 1: SERVIÇOS (Compacto) ── */}
                {passoAtual === 1 && (
                  <motion.div
                    key="passo-1"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.25 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 py-1.5 sm:py-2.5"
                  >
                    {profissional.servicos.map((servico) => {
                      const selecionado = servicoEscolhido?.id === servico.id;

                      return (
                        <div
                          key={servico.id}
                          onClick={() => handleSelecionarServico(servico)}
                          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 ${
                            selecionado
                              ? "bg-primary/10 border-primary ring-2 ring-primary/25"
                              : "bg-background/80 border-border/60 hover:border-primary/50"
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-display font-bold text-foreground text-sm leading-snug">
                                {servico.nome}
                              </h3>
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                                  selecionado
                                    ? "bg-primary border-primary text-white"
                                    : "border-border/80 text-transparent"
                                }`}
                              >
                                <Check size={12} className="stroke-[3]" />
                              </div>
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/80 text-muted-foreground font-body text-[11px] font-semibold">
                              <Clock size={11} className="text-primary" />
                              <span>{servico.duracao}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                            <span className="font-display font-bold text-foreground text-base">
                              {servico.preco}
                            </span>
                            <span className="font-body text-xs font-bold text-primary flex items-center gap-1">
                              {selecionado ? (
                                <span className="text-emerald-600 font-extrabold flex items-center gap-1 text-[11px]">
                                  <Check size={12} className="stroke-[3]" /> Selecionado
                                </span>
                              ) : (
                                <>
                                  Selecionar <ArrowRight size={12} />
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {/* ── ETAPA 2: DATA E HORÁRIO (Compacto) ── */}
                {passoAtual === 2 && (
                  <motion.div
                    key="passo-2"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.25 }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start"
                  >
                    {/* Coluna 1: Calendário Mensal */}
                    <div className="md:col-span-6 bg-background/90 p-3.5 sm:p-4 rounded-2xl border border-border/60 shadow-soft space-y-2.5">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/30">
                        <h3 className="font-display font-bold text-foreground text-sm capitalize">
                          {format(mesAtual, "MMMM yyyy", { locale: ptBR })}
                        </h3>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={mesAnterior}
                            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={proximoMes}
                            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Grade dos Dias */}
                      <div>
                        <div className="grid grid-cols-7 text-center mb-1">
                          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                            <span key={i} className="font-body text-[9px] font-bold text-muted-foreground uppercase">
                              {d}
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {(() => {
                            const inicioMes = startOfMonth(mesAtual);
                            const fimMes = endOfMonth(inicioMes);
                            const inicio = startOfWeek(inicioMes, { locale: ptBR });
                            const fim = endOfWeek(fimMes, { locale: ptBR });

                            const dias: React.ReactNode[] = [];
                            let d = inicio;

                            while (d <= fim) {
                              const diaLoop = d;
                              const noMes = isSameMonth(diaLoop, mesAtual);
                              const selecionado = isSameDay(diaLoop, dataSelecionada);
                              const passado = isPast(diaLoop) && !isToday(diaLoop);

                              dias.push(
                                <button
                                  key={diaLoop.toISOString()}
                                  disabled={passado || !noMes}
                                  onClick={() => handleSelecionarData(diaLoop)}
                                  className={`h-8 sm:h-9 rounded-lg font-body text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer disabled:cursor-not-allowed ${
                                    !noMes
                                      ? "opacity-20 text-muted-foreground"
                                      : passado
                                      ? "opacity-30 line-through text-muted-foreground"
                                      : selecionado
                                      ? "bg-primary text-primary-foreground shadow-soft"
                                      : "hover:bg-secondary text-foreground"
                                  }`}
                                >
                                  <span>{format(diaLoop, "d")}</span>
                                </button>
                              );
                              d = addDays(d, 1);
                            }
                            return dias;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: Horários do Dia Escolhido */}
                    <div className="md:col-span-6 bg-background/90 p-3.5 sm:p-4 rounded-2xl border border-border/60 shadow-soft space-y-2.5">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/30">
                        <div>
                          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">
                            Data selecionada:
                          </p>
                          <h3 className="font-display font-bold text-foreground text-xs sm:text-sm capitalize">
                            {format(dataSelecionada, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                          </h3>
                        </div>
                        <CalendarCheck size={16} className="text-primary" />
                      </div>

                      {slotsDoDia.bloqueado ? (
                        <div className="py-8 text-center text-muted-foreground space-y-1.5">
                          <AlertTriangle size={24} className="mx-auto text-amber-500 mb-1" />
                          <p className="font-display font-bold text-xs text-foreground">
                            Data sem atendimento
                          </p>
                          <p className="font-body text-[11px]">
                            {slotsDoDia.motivo || "Escolha outro dia no calendário."}
                          </p>
                        </div>
                      ) : carregandoHorarios ? (
                        <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-1.5">
                          <Loader2 size={20} className="animate-spin text-primary" />
                          <span className="font-body text-xs font-semibold">Buscando horários livres...</span>
                        </div>
                      ) : slotsDoDia.slots.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground space-y-1">
                          <p className="font-display font-bold text-xs text-foreground">
                            Nenhum horário disponível
                          </p>
                          <p className="font-body text-[11px]">Todos os horários desta data já foram preenchidos.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                          {slotsDoDia.slots.map((slot) => {
                            const ocupado = horariosOcupados.includes(slot);
                            const ativo = horarioSelecionado === slot;

                            return (
                              <button
                                key={slot}
                                disabled={ocupado}
                                onClick={() => handleSelecionarHorario(slot)}
                                className={`py-2 px-1.5 rounded-lg text-xs font-body font-bold transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:cursor-not-allowed ${
                                  ocupado
                                    ? "bg-secondary/40 border-border/30 text-muted-foreground/35 line-through opacity-50"
                                    : ativo
                                    ? "bg-primary text-primary-foreground border-primary shadow-soft"
                                    : "bg-card border-border/60 text-foreground hover:border-primary/40 hover:bg-secondary/40"
                                }`}
                              >
                                <span>{slot}</span>
                                <span className="text-[9px] font-normal opacity-75">
                                  {ocupado ? "Ocupado" : "Livre"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── ETAPA 3: IDENTIFICAÇÃO / AUTENTICAÇÃO (Compacto) ── */}
                {passoAtual === 3 && (
                  <motion.div
                    key="passo-3"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.25 }}
                    className="max-w-md mx-auto w-full space-y-3 py-1"
                  >
                    {/* Cenário A: Conta de Administrador detectada */}
                    {isContaGestor ? (
                      <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3 shadow-soft">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <span className="text-[10px] font-body uppercase font-bold text-amber-700 dark:text-amber-300 tracking-wider">
                            Perfil de Administrador
                          </span>
                          <h3 className="font-display font-bold text-base text-foreground mt-0.5">
                            Conta do Gestor Conectada
                          </h3>
                          <p className="font-body text-xs text-muted-foreground mt-1 leading-relaxed">
                            Você está conectado com a conta de gestor de <strong className="text-foreground">{profissional.nomeClinica}</strong>. Troque de conta para agendar como paciente.
                          </p>
                        </div>

                        <div className="pt-2 border-t border-amber-500/20">
                          <button
                            type="button"
                            onClick={handleTrocarConta}
                            disabled={salvando}
                            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-body font-bold text-xs shadow-soft transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <LogOut size={13} />
                            <span>Trocar de Conta</span>
                          </button>
                        </div>
                      </div>
                    ) : clienteLogado ? (
                      /* Cenário B: Paciente reconhecido */
                      <div className="p-4 sm:p-5 rounded-2xl bg-background border border-border shadow-soft text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary mx-auto flex items-center justify-center font-display font-extrabold text-xl shadow-inner">
                          {clienteLogado.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-[10px] font-body uppercase font-bold text-muted-foreground tracking-wider">
                            Agendando como
                          </span>
                          <h3 className="font-display font-bold text-base sm:text-lg text-foreground mt-0.5">
                            {clienteLogado.nome}
                          </h3>
                          <p className="font-body text-xs text-muted-foreground mt-0.5">
                            {clienteLogado.telefone ? mascararTelefone(clienteLogado.telefone) : clienteLogado.email}
                          </p>
                        </div>

                        <div className="pt-2.5 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                          <button
                            type="button"
                            onClick={handleTrocarConta}
                            disabled={salvando}
                            className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-border/70 hover:bg-secondary text-xs font-body font-bold text-muted-foreground hover:text-rose-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <LogOut size={13} />
                            Trocar de conta / Sair
                          </button>
                          <button
                            type="button"
                            onClick={() => navegarParaPasso(4)}
                            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <span>Continuar com esta conta</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Cenário C: Formulário e Google OAuth Unificado */
                      <div className="bg-background p-4 sm:p-5 rounded-2xl border border-border shadow-soft space-y-3">
                        {/* Botão de Destaque Google OAuth */}
                        <motion.button
                          whileHover={iniciandoGoogle ? {} : { scale: 1.01 }}
                          whileTap={iniciandoGoogle ? {} : { scale: 0.99 }}
                          onClick={handleLoginGoogle}
                          disabled={iniciandoGoogle || salvando}
                          type="button"
                          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white text-slate-700 hover:text-slate-900 font-body font-bold text-xs border border-slate-200/80 shadow-soft transition-all cursor-pointer disabled:opacity-60"
                        >
                          {iniciandoGoogle ? (
                            <>
                              <Loader2 size={15} className="animate-spin text-primary" />
                              <span>Conectando ao Google...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.37 24 12 24z" />
                                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z" />
                                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                              </svg>
                              <span>Continuar com Google</span>
                            </>
                          )}
                        </motion.button>

                        <div className="relative flex items-center justify-center">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border/50" />
                          </div>
                          <span className="relative bg-background px-2.5 text-[10px] font-body font-semibold uppercase tracking-wider text-muted-foreground/70">
                            ou com e-mail
                          </span>
                        </div>

                        {/* Toggle de Abas */}
                        <div className="grid grid-cols-2 p-1 bg-secondary/60 rounded-xl border border-border/40 text-xs font-body font-bold">
                          <button
                            type="button"
                            onClick={() => setAbaAuth("cadastro")}
                            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                              abaAuth === "cadastro"
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Criar Conta
                          </button>
                          <button
                            type="button"
                            onClick={() => setAbaAuth("login")}
                            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                              abaAuth === "login"
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Já tenho conta
                          </button>
                        </div>

                        {abaAuth === "login" ? (
                          <form onSubmit={handleLoginInline} className="space-y-2.5">
                            <div className="space-y-1">
                              <label className="font-body text-[11px] font-bold text-muted-foreground uppercase">
                                E-mail
                              </label>
                              <div className="relative">
                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <input
                                  type="email"
                                  required
                                  value={loginEmail}
                                  onChange={(e) => setLoginEmail(e.target.value)}
                                  placeholder="seu@email.com"
                                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="font-body text-[11px] font-bold text-muted-foreground uppercase">
                                Senha
                              </label>
                              <div className="relative">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <input
                                  type="password"
                                  required
                                  value={loginSenha}
                                  onChange={(e) => setLoginSenha(e.target.value)}
                                  placeholder="Sua senha"
                                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={salvando}
                              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-1"
                            >
                              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                              Entrar e Continuar
                            </button>
                          </form>
                        ) : (
                          <form onSubmit={handleCadastroInline} className="space-y-2">
                            <div className="space-y-0.5">
                              <label className="font-body text-[10px] font-bold text-muted-foreground uppercase">
                                Nome Completo
                              </label>
                              <input
                                type="text"
                                required
                                value={cadNome}
                                onChange={(e) => setCadNome(e.target.value)}
                                placeholder="Seu nome completo"
                                className="w-full px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="font-body text-[10px] font-bold text-muted-foreground uppercase">
                                  WhatsApp
                                </label>
                                <input
                                  type="tel"
                                  required
                                  value={cadWhatsapp}
                                  onChange={(e) => setCadWhatsapp(mascararTelefone(e.target.value))}
                                  placeholder="(11) 99999-9999"
                                  className="w-full px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                />
                              </div>

                              <div className="space-y-0.5">
                                <label className="font-body text-[10px] font-bold text-muted-foreground uppercase">
                                  CPF
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={cadCpf}
                                  onChange={(e) => setCadCpf(mascararCPF(e.target.value))}
                                  placeholder="000.000.000-00"
                                  className="w-full px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                />
                              </div>
                            </div>

                            <div className="space-y-0.5">
                              <label className="font-body text-[10px] font-bold text-muted-foreground uppercase">
                                E-mail
                              </label>
                              <input
                                type="email"
                                required
                                value={cadEmail}
                                onChange={(e) => setCadEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className="w-full px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                              />
                            </div>

                            <div className="space-y-0.5">
                              <label className="font-body text-[10px] font-bold text-muted-foreground uppercase">
                                Senha
                              </label>
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={cadSenha}
                                onChange={(e) => setCadSenha(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                className="w-full px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={salvando}
                              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-1"
                            >
                              {salvando ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                              Cadastrar e Continuar
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── ETAPA 4: CONFIRMAÇÃO & RECIBO (Compacto) ── */}
                {passoAtual === 4 && (
                  <motion.div
                    key="passo-4"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.25 }}
                    className="max-w-md mx-auto w-full space-y-3 py-1"
                  >
                    {/* Card Recibo Compacto */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-background border border-border/80 shadow-soft space-y-2.5">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <div className="flex items-center gap-2">
                          <Receipt size={16} className="text-primary" />
                          <h3 className="font-display font-bold text-foreground text-sm sm:text-base">
                            Recibo do Agendamento
                          </h3>
                        </div>
                        <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 border border-amber-500/30 uppercase">
                          Pendente
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs font-body">
                        <div className="flex items-center justify-between py-0.5 border-b border-border/20">
                          <span className="text-muted-foreground font-semibold">Serviço:</span>
                          <span className="font-display font-bold text-foreground truncate max-w-[200px]">
                            {servicoEscolhido?.nome}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5 border-b border-border/20">
                          <span className="text-muted-foreground font-semibold">Valor & Duração:</span>
                          <span className="font-bold text-foreground">
                            {servicoEscolhido?.preco} • {servicoEscolhido?.duracao}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5 border-b border-border/20">
                          <span className="text-muted-foreground font-semibold">Data & Horário:</span>
                          <span className="font-bold text-primary capitalize">
                            {format(dataSelecionada, "EEEE, dd 'de' MMMM", { locale: ptBR })} às {horarioSelecionado}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5 border-b border-border/20">
                          <span className="text-muted-foreground font-semibold">Paciente:</span>
                          <span className="font-bold text-foreground truncate max-w-[200px]">{clienteLogado?.nome}</span>
                        </div>

                        {clienteLogado?.telefone && (
                          <div className="flex items-center justify-between py-0.5 border-b border-border/20">
                            <span className="text-muted-foreground font-semibold">WhatsApp:</span>
                            <span className="font-bold text-foreground">
                              {mascararTelefone(clienteLogado.telefone)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-muted-foreground font-semibold">Clínica:</span>
                          <span className="font-bold text-foreground truncate max-w-[200px]">{profissional.nomeClinica}</span>
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-primary/5 border border-primary/15 text-[10px] font-body text-muted-foreground leading-snug">
                        Ao confirmar, sua solicitação será enviada diretamente à agenda da clínica e você receberá confirmação por WhatsApp.
                      </div>

                      <button
                        type="button"
                        disabled={salvando}
                        onClick={handleConfirmarAgendamento}
                        className="w-full py-2.5 sm:py-3 rounded-xl bg-primary text-primary-foreground font-body font-bold text-xs sm:text-sm shadow-soft hover:shadow-soft-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {salvando ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Finalizando Agendamento...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            Confirmar Agendamento Agora
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Barra de Navegação Inferior (Voltar / Avançar) ── */}
            <div className="pt-2.5 mt-2.5 border-t border-border/30 flex items-center justify-between gap-3">
              {passoAtual > 1 ? (
                <button
                  type="button"
                  onClick={() => navegarParaPasso((passoAtual - 1) as EtapaFluxo)}
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-border/60 hover:bg-secondary text-xs font-body font-bold text-foreground transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  Voltar
                </button>
              ) : (
                <div />
              )}

              {passoAtual === 1 && (
                <button
                  type="button"
                  disabled={!servicoEscolhido}
                  onClick={() => navegarParaPasso(2)}
                  className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-primary text-primary-foreground text-xs font-body font-bold shadow-soft hover:shadow-soft-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar com este serviço
                  <ArrowRight size={14} />
                </button>
              )}

              {passoAtual === 2 && (
                <button
                  type="button"
                  disabled={!horarioSelecionado}
                  onClick={() => navegarParaPasso(3)}
                  className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-primary text-primary-foreground text-xs font-body font-bold shadow-soft hover:shadow-soft-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar com este horário
                  <ArrowRight size={14} />
                </button>
              )}

              {passoAtual === 3 && clienteLogado && (
                <button
                  type="button"
                  onClick={() => navegarParaPasso(4)}
                  className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-primary text-primary-foreground text-xs font-body font-bold shadow-soft hover:shadow-soft-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  Continuar para o Resumo
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modal de Autenticação do Paciente ── */}
      <ModalAuthPaciente
        aberto={modalAuthAberto}
        onFechar={() => setModalAuthAberto(false)}
        empresaId={profissional.id}
        nomeClinica={profissional.nomeClinica}
        onSucesso={handleSucessoAuthModal}
      />

      {/* ── Modal Meus Agendamentos com Regra de 24h ── */}
      <ModalMeusAgendamentos
        aberto={modalMeusAgendamentosAberto}
        onFechar={() => setModalMeusAgendamentosAberto(false)}
        empresaId={profissional.id}
        nomeClinica={profissional.nomeClinica}
        telefoneClinica={profissional.telefone}
        clienteId={clienteLogado?.id}
        userId={user?.id}
        onToast={exibirToast}
      />
    </div>
  );
}
