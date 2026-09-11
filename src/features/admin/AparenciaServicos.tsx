import { useState, useEffect, useRef } from "react";
import {
  Palette,
  UploadCloud,
  Image as ImageIcon,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  X,
  Loader2,
  Sparkles,
  Trash2,
  CalendarCheck,
  Clock,
  Globe,
  ExternalLink,
  Plus,
  Pencil,
  Tag,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional, type Servico } from "../../store/useProfessional";
import { useAuth } from "../../contexts/AuthContext";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { isReservedSlug } from "../../constants/reservedSlugs";

export default function AparenciaServicos() {
  return (
    <PageLoader>
      <AparenciaServicosConteudo />
    </PageLoader>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes & Segurança
// ─────────────────────────────────────────────────────────────────────────────

const REGEX_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const EXTENSOES_PERMITIDAS = ["png", "jpg", "jpeg", "webp"];
const MIMES_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const TAMANHO_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const PALETAS_PRESET = [
  { nome: "Azul Clínico", hex: "#2563eb" },
  { nome: "Verde Saúde (Teal)", hex: "#0d9488" },
  { nome: "Esmeralda Médico", hex: "#059669" },
  { nome: "Índigo Moderno", hex: "#4f46e5" },
  { nome: "Violeta Sofisticado", hex: "#7c3aed" },
  { nome: "Ciano Confiança", hex: "#0284c7" },
  { nome: "Rosa Estética", hex: "#db2777" },
  { nome: "Terracota Bem-Estar", hex: "#ea580c" },
];

const DURACOES_PRESET = [15, 30, 45, 50, 60, 90, 120];

interface ToastMsg {
  tipo: "success" | "error" | "warning" | "info";
  texto: string;
}

interface ServicoFormState {
  id?: number | string;
  nome: string;
  preco: string;
  duracaoMinutos: number;
  descricao: string;
  ativo: boolean;
}

function extrairMinutos(duracaoStr: string): number {
  const match = duracaoStr.match(/\d+/);
  return match ? parseInt(match[0], 10) : 45;
}

function AparenciaServicosConteudo() {
  const { profissional: profissionalNullable, refetch } = useProfessional();
  const profissional = profissionalNullable!; // seguro: PageLoader garante não-null
  const { user } = useAuth();

  // ── Estados da Identidade Visual ──
  const [corHex, setCorHex] = useState(profissional.corPrimariaHex || "#0d9488");
  const [logoUrl, setLogoUrl] = useState(profissional.logoUrl || "");
  const [tagline, setTagline] = useState(profissional.tagline || "");
  const [descricao, setDescricao] = useState(profissional.descricao || "");
  const [slug, setSlug] = useState(profissional.slug || "");

  // ── Estados dos Serviços ──
  const [servicos, setServicos] = useState<Servico[]>(profissional.servicos || []);
  const [modalServicoAberto, setModalServicoAberto] = useState(false);
  const [servicoEmEdicao, setServicoEmEdicao] = useState<ServicoFormState | null>(null);
  const [servicoExcluindo, setServicoExcluindo] = useState<Servico | null>(null);
  const [salvandoServico, setSalvandoServico] = useState(false);

  // ── Estados de Controle & Feedback ──
  const [salvandoVisual, setSalvandoVisual] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Sincroniza dados com o profissional carregado
  useEffect(() => {
    if (profissional) {
      if (profissional.corPrimariaHex) setCorHex(profissional.corPrimariaHex);
      if (profissional.logoUrl !== undefined) setLogoUrl(profissional.logoUrl);
      if (profissional.tagline) setTagline(profissional.tagline);
      if (profissional.descricao) setDescricao(profissional.descricao);
      if (profissional.slug) setSlug(profissional.slug);
      if (profissional.servicos) setServicos(profissional.servicos);
    }
  }, [profissional]);

  const sanitizarSlug = (valor: string) =>
    valor
      .toLowerCase()
      .trim()
      .replace(/[^\w-]/g, "")
      .replace(/_/g, "-")
      .replace(/-+/g, "-");

  const corValida = REGEX_HEX.test(corHex.trim());

  // ─────────────────────────────────────────────────────────────────────────
  // Upload de Logo para o Supabase Storage
  // ─────────────────────────────────────────────────────────────────────────
  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > TAMANHO_MAX_BYTES) {
      exibirToast("O arquivo é muito grande. O tamanho máximo permitido é 2MB.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const partes = file.name.split(".");
    const ext = partes.pop()?.toLowerCase();
    if (!ext || !EXTENSOES_PERMITIDAS.includes(ext)) {
      exibirToast("Extensão inválida. Permite-se apenas .png, .jpg, .jpeg ou .webp.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!MIMES_PERMITIDOS.includes(file.type)) {
      exibirToast("Tipo de imagem não suportado. Envie um arquivo PNG, JPEG ou WebP válido.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setEnviandoLogo(true);
    try {
      const nomeSanitizado = `empresa_${profissional.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(nomeSanitizado, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("[Storage] Erro no upload:", uploadError);
        if (uploadError.message.toLowerCase().includes("bucket not found")) {
          exibirToast("Bucket 'logos' não encontrado no Supabase Storage.", "warning");
        } else {
          exibirToast("Não foi possível enviar a imagem. Tente novamente.", "error");
        }
        return;
      }

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(nomeSanitizado);

      if (urlData?.publicUrl) {
        setLogoUrl(urlData.publicUrl);
        exibirToast("Logo enviada! Clique em 'Salvar Aparência' para gravar.", "success");
      }
    } catch (err: any) {
      console.error("[Storage] Erro inesperado:", err);
      exibirToast("Erro de conexão ao enviar a imagem.", "error");
    } finally {
      setEnviandoLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Salvar Identidade Visual da Landing Page
  // ─────────────────────────────────────────────────────────────────────────
  const handleSalvarVisual = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profissional?.id || !user?.id) {
      exibirToast("Contexto do profissional ou usuário ausente.", "error");
      return;
    }

    const hexNormalizado = corHex.trim();
    if (!REGEX_HEX.test(hexNormalizado)) {
      exibirToast("Cor primária inválida! Informe um código Hexadecimal válido.", "error");
      return;
    }

    const slugLimpo = sanitizarSlug(slug);
    if (!slugLimpo || slugLimpo.length < 3) {
      exibirToast("O link público (slug) deve conter pelo menos 3 caracteres.", "error");
      return;
    }

    if (isReservedSlug(slugLimpo)) {
      exibirToast(`O link "/${slugLimpo}" é uma palavra reservada do sistema.`, "warning");
      return;
    }

    const logoUrlLimpa = logoUrl.trim();
    if (logoUrlLimpa && !/^https:\/\//i.test(logoUrlLimpa)) {
      exibirToast("A URL da logo deve começar com https://", "error");
      return;
    }

    setSalvandoVisual(true);
    try {
      // Checa se slug já está em uso por outra empresa
      const { data: slugEmUso } = await supabase
        .from("empresas")
        .select("id")
        .eq("slug", slugLimpo)
        .neq("id", profissional.id)
        .maybeSingle();

      if (slugEmUso) {
        exibirToast(`O link "/${slugLimpo}" já está em uso por outra clínica. Escolha outro.`, "warning");
        setSalvandoVisual(false);
        return;
      }

      const dispAtual = profissional.disponibilidade || {};
      const novoDisp = {
        ...dispAtual,
        perfil: {
          ...(dispAtual.perfil || {}),
          tagline: tagline.trim() || profissional.tagline,
          descricao: descricao.trim() || profissional.descricao,
        },
      };

      const { error: updateError } = await supabase
        .from("empresas")
        .update({
          slug: slugLimpo,
          cor_primaria: hexNormalizado,
          logo_url: logoUrlLimpa || null,
          tagline: tagline.trim() || null,
          descricao: descricao.trim() || null,
          disponibilidade: novoDisp,
        })
        .eq("id", profissional.id)
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`);

      if (updateError) {
        console.error("[Aparência] Erro ao salvar:", updateError);
        exibirToast("Não foi possível salvar a aparência da página.", "error");
        return;
      }

      exibirToast("Aparência da página de agendamentos salva com sucesso!", "success");
      refetch();
    } catch (err) {
      console.error("[Aparência] Erro inesperado:", err);
      exibirToast("Erro de conexão ao salvar.", "error");
    } finally {
      setSalvandoVisual(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CRUD de Serviços (Criar, Editar, Excluir, Alternar Ativo)
  // ─────────────────────────────────────────────────────────────────────────
  const abrirCriarServico = () => {
    setServicoEmEdicao({
      nome: "",
      preco: "R$ 100,00",
      duracaoMinutos: 45,
      descricao: "",
      ativo: true,
    });
    setModalServicoAberto(true);
  };

  const abrirEditarServico = (s: Servico) => {
    setServicoEmEdicao({
      id: s.id,
      nome: s.nome,
      preco: s.preco,
      duracaoMinutos: extrairMinutos(s.duracao),
      descricao: s.descricao || "",
      ativo: s.ativo !== false,
    });
    setModalServicoAberto(true);
  };

  const extrairValorNumerico = (precoStr: string | number | undefined | null): number => {
    if (typeof precoStr === "number") return precoStr;
    if (!precoStr) return 0;
    const limpo = String(precoStr)
      .replace(/[^\d,.]/g, "")
      .replace(/\.(?=\d{3})/g, "")
      .replace(",", ".");
    const val = parseFloat(limpo);
    return isNaN(val) ? 0 : val;
  };

  const handleSalvarServicoModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servicoEmEdicao || !profissional?.id) return;

    const nomeLimpo = servicoEmEdicao.nome.trim();
    if (!nomeLimpo) {
      exibirToast("O nome do serviço é obrigatório.", "warning");
      return;
    }

    setSalvandoServico(true);
    try {
      const valorNumerico = extrairValorNumerico(servicoEmEdicao.preco);
      const duracaoMin = Number(servicoEmEdicao.duracaoMinutos) || 45;

      const payloadServico: Record<string, any> = {
        empresa_id: profissional.id,
        nome_servico: nomeLimpo,
        valor: valorNumerico,
        duracao_minutos: duracaoMin,
      };

      if (servicoEmEdicao.id) {
        // UPDATE
        const { error } = await supabase
          .from("servicos")
          .update(payloadServico)
          .eq("id", servicoEmEdicao.id)
          .eq("empresa_id", profissional.id);

        if (error) {
          console.error("[Serviços] Erro Supabase UPDATE:", error);
          throw error;
        }
        exibirToast("Serviço atualizado com sucesso!", "success");
      } else {
        // INSERT
        const { error } = await supabase
          .from("servicos")
          .insert(payloadServico);

        if (error) {
          console.error("[Serviços] Erro Supabase INSERT:", error);
          throw error;
        }
        exibirToast("Novo serviço cadastrado com sucesso!", "success");
      }

      setModalServicoAberto(false);
      setServicoEmEdicao(null);
      refetch();
    } catch (err: any) {
      console.error("[Serviços] Erro ao salvar serviço:", err);
      const msg = err?.message ? `Erro ao salvar: ${err.message}` : "Erro ao salvar serviço. Tente novamente.";
      exibirToast(msg, "error");
    } finally {
      setSalvandoServico(false);
    }
  };

  const handleExcluirServicoConfirmado = async () => {
    if (!servicoExcluindo || !profissional?.id) return;
    setSalvandoServico(true);
    try {
      const { error } = await supabase
        .from("servicos")
        .delete()
        .eq("id", servicoExcluindo.id)
        .eq("empresa_id", profissional.id);

      if (error) throw error;

      exibirToast("Serviço removido com sucesso.", "info");
      setServicoExcluindo(null);
      refetch();
    } catch (err: any) {
      console.error("[Serviços] Erro ao excluir:", err);
      const msg = err?.message ? `Erro ao excluir: ${err.message}` : "Erro ao remover serviço.";
      exibirToast(msg, "error");
    } finally {
      setSalvandoServico(false);
    }
  };

  const handleToggleAtivoServico = async (s: Servico) => {
    if (!profissional?.id) return;
    const novoStatus = !(s.ativo !== false);

    // Otimista
    setServicos((prev) =>
      prev.map((item) => (item.id === s.id ? { ...item, ativo: novoStatus } : item))
    );

    try {
      const { error } = await supabase
        .from("servicos")
        .update({ ativo: novoStatus })
        .eq("id", s.id)
        .eq("empresa_id", profissional.id);

      if (error) {
        // Se a coluna 'ativo' não existir na tabela, apenas mantém o toggle visualmente
        console.warn("[Serviços] Nota ao atualizar coluna ativo (opcional no schema):", error);
      } else {
        exibirToast(
          novoStatus ? "Serviço ativado na página de agendamentos!" : "Serviço ocultado da página de agendamentos.",
          "success"
        );
      }
      refetch();
    } catch (err) {
      console.error("[Serviços] Erro ao alternar visibilidade:", err);
      refetch();
    }
  };

  const corPrevia = corValida ? corHex : "#0d9488";

  return (
    <div className="space-y-10 pb-16 relative max-w-7xl mx-auto">
      {/* ── Toast Flutuante ── */}
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

      {/* ── Cabeçalho Principal ── */}
      <header className="border-b border-border/40 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary font-body font-semibold text-xs mb-1.5 uppercase tracking-wider">
            <Palette size={15} />
            <span>Personalização & Vitrine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
            Aparência & Serviços
          </h1>
          <p className="text-muted-foreground font-body text-xs sm:text-sm font-medium mt-1">
            Gerencie o catálogo de serviços oferecidos e customize as cores, logotipo e textos da sua página pública.
          </p>
        </div>

        {profissional?.slug && (
          <a
            href={`/${profissional.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-body font-bold text-xs border border-border/60 transition-all shadow-xs self-start sm:self-center"
          >
            <Globe size={15} className="text-primary" />
            <span>Ver Página Pública</span>
            <ExternalLink size={12} className="text-muted-foreground" />
          </a>
        )}
      </header>

      {/* ── SEÇÃO 1: GERENCIADOR DE SERVIÇOS (CRUD COMPLETO) ── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <Tag size={20} className="text-primary" />
              <span>Catálogo de Serviços</span>
            </h2>
            <p className="text-xs font-body text-muted-foreground">
              Cadastre e gerencie os procedimentos e consultas que seus pacientes podem agendar.
            </p>
          </div>

          <button
            type="button"
            onClick={abrirCriarServico}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground font-body font-bold text-xs shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus size={15} className="stroke-[3]" />
            <span>Novo Serviço</span>
          </button>
        </div>

        {servicos.length === 0 ? (
          <div className="p-8 rounded-3xl bg-card border border-dashed border-border/70 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Tag size={24} />
            </div>
            <h3 className="font-display font-bold text-base text-foreground">
              Nenhum serviço cadastrado ainda
            </h3>
            <p className="text-xs font-body text-muted-foreground max-w-sm mt-1 mb-4">
              Adicione os serviços da sua clínica com valor e duração para disponibilizá-los aos pacientes.
            </p>
            <button
              type="button"
              onClick={abrirCriarServico}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-body font-bold shadow-xs cursor-pointer"
            >
              + Adicionar Primeiro Serviço
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servicos.map((s) => {
              const estaAtivo = s.ativo !== false;

              return (
                <div
                  key={s.id}
                  className={`p-5 rounded-3xl bg-card border transition-all flex flex-col justify-between gap-3 relative shadow-soft ${
                    estaAtivo
                      ? "border-border/60 hover:border-primary/40 hover:shadow-soft-lg"
                      : "border-border/30 opacity-60 bg-card/60"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-base text-foreground leading-snug">
                        {s.nome}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleToggleAtivoServico(s)}
                        title={estaAtivo ? "Desativar na página pública" : "Ativar na página pública"}
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      >
                        {estaAtivo ? (
                          <ToggleRight size={26} className="text-emerald-500" />
                        ) : (
                          <ToggleLeft size={26} className="text-muted-foreground/60" />
                        )}
                      </button>
                    </div>

                    {s.descricao && (
                      <p className="font-body text-xs text-muted-foreground line-clamp-2">
                        {s.descricao}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-border/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-display font-extrabold text-sm text-primary">
                        {s.preco}
                      </span>
                      <span className="text-[11px] font-body text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-lg flex items-center gap-1 font-semibold">
                        <Clock size={11} /> {s.duracao}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEditarServico(s)}
                        title="Editar serviço"
                        className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setServicoExcluindo(s)}
                        title="Excluir serviço"
                        className="p-1.5 rounded-xl hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── SEÇÃO 2: CUSTOMIZAÇÃO DA LANDING PAGE (CORES, LOGO, SLUG, TEXTOS) + LIVE PREVIEW ── */}
      <section className="space-y-4 pt-4 border-t border-border/30">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            <span>Identidade Visual & Textos da Página de Agendamentos</span>
          </h2>
          <p className="text-xs font-body text-muted-foreground">
            Personalize as cores, logotipo e informações apresentadas aos clientes na página pública de agendamento.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Formulário de Identidade Visual */}
          <form onSubmit={handleSalvarVisual} className="lg:col-span-7 space-y-6">
            {/* Card 1: Paleta de Cores */}
            <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4">
              <div className="flex items-center justify-between border-b border-border/30 pb-3">
                <div className="flex items-center gap-2 text-foreground font-display font-bold text-base">
                  <Palette size={18} className="text-primary" />
                  <span>Cor Primária da Marca</span>
                </div>
                <span
                  className="w-5 h-5 rounded-full border border-border shadow-xs"
                  style={{ backgroundColor: corPrevia }}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-border shadow-soft shrink-0 cursor-pointer">
                  <input
                    type="color"
                    value={corValida ? corHex : "#0d9488"}
                    onChange={(e) => setCorHex(e.target.value.toLowerCase())}
                    className="absolute -inset-2 w-16 h-16 cursor-pointer border-none bg-transparent"
                    title="Selecione a cor com o conta-gotas"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={corHex}
                    onChange={(e) => {
                      let val = e.target.value.trim();
                      if (!val.startsWith("#")) val = `#${val}`;
                      setCorHex(val.toLowerCase());
                    }}
                    placeholder="#2563eb"
                    maxLength={7}
                    className={`w-full px-4 py-2.5 rounded-xl bg-background border font-mono text-sm font-bold tracking-wider transition-all focus:outline-none focus:ring-2 ${
                      corValida
                        ? "border-border text-foreground focus:ring-primary/40 focus:border-primary"
                        : "border-rose-500 text-rose-600 focus:ring-rose-500/30"
                    }`}
                  />
                </div>
              </div>

              {/* Presets */}
              <div className="space-y-2 pt-2 border-t border-border/20">
                <span className="font-body text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Paletas Recomendadas:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PALETAS_PRESET.map((p) => {
                    const ativa = corHex.toLowerCase() === p.hex.toLowerCase();
                    return (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => setCorHex(p.hex)}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs font-body transition-all cursor-pointer ${
                          ativa
                            ? "bg-secondary border-primary/50 ring-2 ring-primary/20 shadow-xs"
                            : "bg-background border-border/50 hover:bg-secondary/40"
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: p.hex }}
                        />
                        <span className="truncate font-semibold text-foreground text-[11px]">
                          {p.nome.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 2: Logotipo */}
            <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4">
              <div className="flex items-center justify-between border-b border-border/30 pb-3">
                <div className="flex items-center gap-2 text-foreground font-display font-bold text-base">
                  <ImageIcon size={18} className="text-primary" />
                  <span>Logotipo da Clínica</span>
                </div>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl("")}
                    className="text-xs font-body font-bold text-muted-foreground hover:text-rose-500 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Remover
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleSelecionarArquivo}
                className="hidden"
              />

              {logoUrl ? (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/40 border border-border/60">
                  <div className="w-20 h-20 rounded-2xl bg-background border border-border flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-inner">
                    <img
                      src={logoUrl}
                      alt="Logo ativa"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <p className="font-display font-bold text-sm text-foreground">
                      Logotipo ativa
                    </p>
                    <button
                      type="button"
                      disabled={enviandoLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-body font-bold text-foreground hover:bg-secondary transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <UploadCloud size={14} />
                      Substituir Logo
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => !enviandoLogo && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    enviandoLogo
                      ? "border-primary/40 bg-primary/5 cursor-wait"
                      : "border-border/80 hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    {enviandoLogo ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <UploadCloud size={20} />
                    )}
                  </div>
                  <div>
                    <p className="font-display font-bold text-xs sm:text-sm text-foreground">
                      {enviandoLogo ? "Enviando logotipo..." : "Clique para enviar a logo"}
                    </p>
                    <p className="font-body text-[11px] text-muted-foreground mt-0.5">
                      PNG, JPG, JPEG ou WebP (máx. 2MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Link Público (Slug) & Textos */}
            <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4">
              <div className="flex items-center gap-2 text-foreground font-display font-bold text-base border-b border-border/30 pb-3">
                <Globe size={18} className="text-primary" />
                <span>Link Público & Textos de Apresentação</span>
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Link Público de Agendamento (Slug)
                </label>
                <div className="flex items-center rounded-xl bg-background border border-border focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all overflow-hidden">
                  <span className="px-3.5 py-2.5 bg-secondary/50 text-muted-foreground font-mono text-xs select-none border-r border-border/50 shrink-0">
                    {typeof window !== "undefined" ? window.location.host : "praxis.app"}/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(sanitizarSlug(e.target.value))}
                    placeholder="nome-da-sua-clinica"
                    className="w-full px-3 py-2.5 bg-transparent text-xs font-mono font-bold text-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Slogan */}
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Slogan de Destaque (Tagline)
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Ex: Agende seu horário com facilidade e rapidez"
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Descrição da Página / Apresentação
                </label>
                <textarea
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Atendimento personalizado com excelência e hora marcada."
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvandoVisual || enviandoLogo || !corValida}
              className={`w-full py-4 rounded-2xl font-body font-bold text-sm shadow-soft transition-all flex items-center justify-center gap-2 cursor-pointer ${
                salvandoVisual || enviandoLogo || !corValida
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                  : "bg-primary text-primary-foreground hover:shadow-soft-lg hover:-translate-y-0.5"
              }`}
            >
              {salvandoVisual ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Salvando Aparência...</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>Salvar Aparência da Página</span>
                </>
              )}
            </button>
          </form>

          {/* Live Preview em Tempo Real */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
            <div className="flex items-center gap-2 text-foreground font-display font-bold text-sm">
              <Eye size={16} className="text-primary" />
              <span>Pré-visualização da Página do Cliente</span>
            </div>

            <div className="bg-card rounded-3xl border border-border/70 shadow-floating overflow-hidden">
              {/* Header do Mockup */}
              <div className="p-4 border-b border-border/40 bg-card/90 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="h-7 max-w-[100px] object-contain rounded"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: corPrevia }}
                    >
                      <CalendarCheck size={16} />
                    </div>
                  )}
                  <span className="font-display font-bold text-sm text-foreground truncate">
                    {profissional.nomeClinica || "Sua Clínica"}
                  </span>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-body font-bold text-white shadow-xs shrink-0"
                  style={{ backgroundColor: corPrevia }}
                >
                  Agendar
                </span>
              </div>

              {/* Hero Banner do Mockup */}
              <div className="p-5 space-y-4 bg-background">
                <div
                  className="p-5 rounded-2xl text-white relative overflow-hidden shadow-soft-lg"
                  style={{
                    background: `linear-gradient(135deg, ${corPrevia}, ${corPrevia}cc)`,
                  }}
                >
                  <div className="relative z-10 space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white font-body text-[10px] font-bold backdrop-blur-xs">
                      <CheckCircle2 size={12} />
                      <span>{profissional.profissao || "Especialidade"}</span>
                    </div>
                    <h3 className="font-display font-extrabold text-base text-white leading-tight">
                      {tagline || "Agende sua consulta online"}
                    </h3>
                    <p className="font-body text-xs text-white/80 line-clamp-2">
                      {descricao || "Atendimento personalizado com total comodidade."}
                    </p>
                  </div>
                </div>

                {/* Lista de Serviços Ativos no Mockup */}
                <div className="space-y-2 pt-1">
                  <span className="font-body text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Serviços Visíveis:
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {servicos.filter((s) => s.ativo !== false).map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-xl border border-border/50 bg-card flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-display font-bold text-foreground truncate">
                            {s.nome}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {s.duracao}
                          </span>
                        </div>
                        <span
                          className="font-bold text-xs px-2 py-0.5 rounded-lg text-white shrink-0 ml-2"
                          style={{ backgroundColor: corPrevia }}
                        >
                          {s.preco}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MODAL: CRIAR / EDITAR SERVIÇO ── */}
      <AnimatePresence>
        {modalServicoAberto && servicoEmEdicao && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalServicoAberto(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-md bg-card rounded-3xl p-6 md:p-8 shadow-floating border border-border/50"
            >
              <div className="flex items-center justify-between pb-4 border-b border-border/20 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold shadow-inner">
                    <Tag size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-foreground leading-snug">
                      {servicoEmEdicao.id ? "Editar Serviço" : "Novo Serviço"}
                    </h3>
                    <p className="text-xs font-body text-muted-foreground">
                      Preencha os detalhes do procedimento
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalServicoAberto(false)}
                  className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSalvarServicoModal} className="space-y-4">
                {/* Nome do Serviço */}
                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Nome do Serviço *
                  </label>
                  <input
                    type="text"
                    required
                    value={servicoEmEdicao.nome}
                    onChange={(e) =>
                      setServicoEmEdicao({ ...servicoEmEdicao, nome: e.target.value })
                    }
                    placeholder="Ex: Consulta Fisioterapia, Limpeza de Pele..."
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {/* Preço e Duração */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Preço *
                    </label>
                    <input
                      type="text"
                      required
                      value={servicoEmEdicao.preco}
                      onChange={(e) =>
                        setServicoEmEdicao({ ...servicoEmEdicao, preco: e.target.value })
                      }
                      placeholder="R$ 120,00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Duração (Minutos) *
                    </label>
                    <input
                      type="number"
                      required
                      min={5}
                      step={5}
                      value={servicoEmEdicao.duracaoMinutos}
                      onChange={(e) =>
                        setServicoEmEdicao({
                          ...servicoEmEdicao,
                          duracaoMinutos: parseInt(e.target.value, 10) || 45,
                        })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* Presets de Duração Rápida */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DURACOES_PRESET.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() =>
                        setServicoEmEdicao({ ...servicoEmEdicao, duracaoMinutos: min })
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-body font-semibold transition-colors cursor-pointer ${
                        servicoEmEdicao.duracaoMinutos === min
                          ? "bg-primary text-primary-foreground shadow-xs font-bold"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Descrição Detalhada (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={servicoEmEdicao.descricao}
                    onChange={(e) =>
                      setServicoEmEdicao({ ...servicoEmEdicao, descricao: e.target.value })
                    }
                    placeholder="Explique o que inclui esta consulta ou tratamento..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm font-body font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>

                {/* Toggle Visível na Página de Agendamentos */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/40 border border-border/40">
                  <div>
                    <p className="font-display font-bold text-xs text-foreground">
                      Visível na Página de Agendamentos
                    </p>
                    <p className="font-body text-[11px] text-muted-foreground">
                      Permite que clientes agendem este serviço online
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setServicoEmEdicao({
                        ...servicoEmEdicao,
                        ativo: !servicoEmEdicao.ativo,
                      })
                    }
                    className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {servicoEmEdicao.ativo ? (
                      <ToggleRight size={28} className="text-emerald-500" />
                    ) : (
                      <ToggleLeft size={28} className="text-muted-foreground/60" />
                    )}
                  </button>
                </div>

                {/* Ações */}
                <div className="flex gap-2.5 pt-4 border-t border-border/20">
                  <button
                    type="button"
                    onClick={() => setModalServicoAberto(false)}
                    className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoServico}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-body font-bold text-xs shadow-soft transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {salvandoServico ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    <span>{servicoEmEdicao.id ? "Atualizar" : "Cadastrar"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE SERVIÇO ── */}
      <AnimatePresence>
        {servicoExcluindo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setServicoExcluindo(null)}
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
                Excluir Serviço?
              </h4>
              <p className="text-xs font-body text-muted-foreground mt-2 leading-relaxed">
                Tem certeza que deseja remover o serviço{" "}
                <strong className="text-foreground">{servicoExcluindo.nome}</strong>?
                Ele deixará de aparecer na sua página de agendamento online.
              </p>

              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setServicoExcluindo(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvandoServico}
                  onClick={handleExcluirServicoConfirmado}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-body font-bold text-xs shadow-soft transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  {salvandoServico ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  <span>Sim, Excluir</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
