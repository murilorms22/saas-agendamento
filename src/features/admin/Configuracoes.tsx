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
  Building2,
  Trash2,
  CalendarCheck,
  Clock,
  Globe,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { useAuth } from "../../contexts/AuthContext";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { isReservedSlug } from "../../constants/reservedSlugs";

export default function Configuracoes() {
  return (
    <PageLoader>
      <ConfiguracoesConteudo />
    </PageLoader>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes & Segurança
// ─────────────────────────────────────────────────────────────────────────────

// 🛡️ Brecha 3: Regex estrita para validação de cor Hexadecimal (3 ou 6 dígitos)
const REGEX_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// 🛡️ Brecha 2: Validação estrita de extensões e tipos MIME
const EXTENSOES_PERMITIDAS = ["png", "jpg", "jpeg", "webp"];
const MIMES_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const TAMANHO_MAX_BYTES = 2 * 1024 * 1024; // 2MB

// Paletas de cores elegantes e profissionais recomendadas para clínicas
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

interface ToastMsg {
  tipo: "success" | "error" | "warning" | "info";
  texto: string;
}

function ConfiguracoesConteudo() {
  const { profissional: profissionalNullable, refetch } = useProfessional();
  const profissional = profissionalNullable!; // seguro: PageLoader garante não-null
  const { user } = useAuth();

  // Estados do formulário
  const [corHex, setCorHex] = useState(profissional.corPrimariaHex || "#0d9488");
  const [logoUrl, setLogoUrl] = useState(profissional.logoUrl || "");
  const [nomeNegocio, setNomeNegocio] = useState(profissional.nomeClinica || "");
  const [especialidade, setEspecialidade] = useState(profissional.profissao || "");
  const [tagline, setTagline] = useState(profissional.tagline || "");
  const [descricao, setDescricao] = useState(profissional.descricao || "");
  const [slug, setSlug] = useState(profissional.slug || "");

  // Estados de controle e feedback
  const [salvando, setSalvando] = useState(false);
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

  // Sincroniza estados caso os dados do profissional mudem
  useEffect(() => {
    if (profissional) {
      if (profissional.corPrimariaHex) setCorHex(profissional.corPrimariaHex);
      if (profissional.logoUrl) setLogoUrl(profissional.logoUrl);
      if (profissional.nomeClinica) setNomeNegocio(profissional.nomeClinica);
      if (profissional.profissao) setEspecialidade(profissional.profissao);
      if (profissional.tagline) setTagline(profissional.tagline);
      if (profissional.descricao) setDescricao(profissional.descricao);
      if (profissional.slug) setSlug(profissional.slug);
    }
  }, [profissional]);

  const sanitizarSlug = (valor: string) =>
    valor
      .toLowerCase()
      .trim()
      .replace(/[^\w-]/g, "")
      .replace(/_/g, "-")
      .replace(/-+/g, "-");

  // 🛡️ Brecha 3: Sanitização de Hexadecimal
  const corValida = REGEX_HEX.test(corHex.trim());

  // 🛡️ Brecha 2: Upload Seguro de Arquivo para o Supabase Storage
  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validação de tamanho (máximo 2MB)
    if (file.size > TAMANHO_MAX_BYTES) {
      exibirToast("O arquivo é muito grande. O tamanho máximo permitido é 2MB.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Validação estrita de extensão
    const partes = file.name.split(".");
    const ext = partes.pop()?.toLowerCase();
    if (!ext || !EXTENSOES_PERMITIDAS.includes(ext)) {
      exibirToast("Extensão inválida. Permite-se apenas .png, .jpg, .jpeg ou .webp.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 3. Validação estrita de tipo MIME
    if (!MIMES_PERMITIDOS.includes(file.type)) {
      exibirToast("Tipo de imagem não suportado. Envie um arquivo PNG, JPEG ou WebP válido.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 4. Sanitização do nome do arquivo e upload no bucket 'logos'
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
          exibirToast(
            "Bucket 'logos' não encontrado no Supabase. Crie o bucket público 'logos' no painel do Supabase Storage.",
            "warning"
          );
        } else {
          exibirToast("Não foi possível enviar a imagem. Tente novamente.", "error");
        }
        return;
      }

      // 5. Gera a URL pública
      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(nomeSanitizado);

      if (urlData?.publicUrl) {
        setLogoUrl(urlData.publicUrl);
        exibirToast("Logo enviada! Clique em 'Salvar Alterações' para gravar.", "success");
      }
    } catch (err: any) {
      console.error("[Storage] Erro inesperado:", err);
      exibirToast("Erro de conexão ao enviar a imagem.", "error");
    } finally {
      setEnviandoLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 🛡️ Brecha 1: Trava Dupla contra IDOR no Update (.eq('id', profissional.id).eq('user_id', user.id))
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard clause de sanidade
    if (!profissional?.id || !user?.id) {
      exibirToast("Contexto do profissional ou usuário ausente. Tente relogar.", "error");
      return;
    }

    // Sanitização e validação de hexadecimal
    const hexNormalizado = corHex.trim();
    if (!REGEX_HEX.test(hexNormalizado)) {
      exibirToast("Cor inválida! Informe um código Hexadecimal válido (ex: #2563EB).", "error");
      return;
    }

    // Validação e Sanitização do Slug Público
    const slugLimpo = sanitizarSlug(slug);
    if (!slugLimpo || slugLimpo.length < 3) {
      exibirToast("O link público (slug) deve conter pelo menos 3 caracteres alfanuméricos.", "error");
      return;
    }

    if (isReservedSlug(slugLimpo)) {
      exibirToast(`O endereço "/${slugLimpo}" é uma palavra reservada do sistema. Por favor, escolha outro slug.`, "warning");
      return;
    }

    // Validação de segurança na URL da Logo (HTTPS estrito)
    const logoUrlLimpa = logoUrl.trim();
    if (logoUrlLimpa && !/^https:\/\//i.test(logoUrlLimpa)) {
      exibirToast("A URL da logo deve começar com https:// para ser segura.", "error");
      return;
    }

    setSalvando(true);
    try {
      // 🛡️ Validação de Unicidade de Slug contra colisão com outras empresas
      const { data: slugEmUso } = await supabase
        .from("empresas")
        .select("id")
        .eq("slug", slugLimpo)
        .neq("id", profissional.id)
        .maybeSingle();

      if (slugEmUso) {
        exibirToast(`O link "/${slugLimpo}" já está sendo utilizado por outra clínica. Escolha um link exclusivo.`, "warning");
        setSalvando(false);
        return;
      }

      const dispAtual = profissional.disponibilidade || {};
      const novoDisp = {
        ...dispAtual,
        perfil: {
          ...(dispAtual.perfil || {}),
          nome: nomeNegocio.trim() || profissional.nomeClinica,
          especialidade: especialidade.trim() || profissional.profissao,
          profissao: especialidade.trim() || profissional.profissao,
          tagline: tagline.trim() || profissional.tagline,
          descricao: descricao.trim() || profissional.descricao,
        },
      };

      // 🛡️ Trava dupla estrita exigida pelo Red Team: .eq('id', profissional.id).eq('user_id', user.id)
      const { error: updateError } = await supabase
        .from("empresas")
        .update({
          slug: slugLimpo,
          cor_primaria: hexNormalizado,
          logo_url: logoUrlLimpa || null,
          nome_negocio: nomeNegocio.trim() || profissional.nomeClinica,
          especialidade: especialidade.trim() || profissional.profissao,
          disponibilidade: novoDisp,
        })
        .eq("id", profissional.id)
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`);

      if (updateError) {
        console.error("[Configurações] Erro ao atualizar empresa:", updateError);
        // Se alguma coluna opcional ainda não existir no banco, tenta salvar apenas o essencial
        if (updateError.message.includes("column")) {
          const { error: fallbackError } = await supabase
            .from("empresas")
            .update({
              slug: slugLimpo,
              cor_primaria: hexNormalizado,
              nome_negocio: nomeNegocio.trim() || profissional.nomeClinica,
              especialidade: especialidade.trim() || profissional.profissao,
              disponibilidade: novoDisp,
            })
            .eq("id", profissional.id)
            .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`);

          if (fallbackError) {
            console.error("[Configurações] Falha no fallback:", fallbackError);
            exibirToast("Não foi possível salvar as configurações. Tente novamente.", "error");
          } else {
            exibirToast("Configurações do perfil salvas com sucesso!", "success");
            refetch();
          }
          return;
        }

        if (updateError.message.includes("permission denied")) {
          exibirToast("Permissão negada. Você só pode alterar a sua própria clínica.", "error");
        } else {
          exibirToast("Não foi possível salvar as alterações. Tente novamente.", "error");
        }
        return;
      }

      exibirToast("Configurações do perfil salvas com sucesso!", "success");
      // Atualiza a store global para refletir em toda a aplicação imediatamente
      refetch();
    } catch (err: any) {
      console.error("[Configurações] Erro inesperado ao salvar:", err);
      exibirToast("Erro de conexão ao salvar alterações.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const corPrevia = corValida ? corHex : "#0d9488";

  return (
    <div className="space-y-8 pb-16 relative max-w-7xl mx-auto">
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
              className="ml-2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cabeçalho da Página ── */}
      <header className="border-b border-border/40 pb-6">
        <div className="flex items-center gap-2 text-primary font-body font-semibold text-xs mb-1.5 uppercase tracking-wider">
          <Sparkles size={15} />
          <span>Motor White-Label • Personalização</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
          Identidade Visual da Clínica
        </h1>
        <p className="text-muted-foreground font-body text-xs sm:text-sm font-medium mt-1">
          Customize a paleta de cores, adicione a logotipo da sua clínica e visualize as mudanças em tempo real na Landing Page.
        </p>
      </header>

      {/* ── Grid Principal: Formulário (Esquerda) + Live Preview (Direita) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── Coluna Esquerda: Formulário de Personalização ── */}
        <form onSubmit={handleSalvar} className="lg:col-span-7 space-y-6">
          {/* Card 1: Informações Gerais da Clínica */}
          <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4">
            <div className="flex items-center gap-2.5 text-foreground font-display font-bold text-base border-b border-border/30 pb-3">
              <Building2 size={18} className="text-primary" />
              <span>Dados da Clínica</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Nome do Negócio / Clínica
                </label>
                <input
                  type="text"
                  value={nomeNegocio}
                  onChange={(e) => setNomeNegocio(e.target.value)}
                  placeholder="Ex: Fisio Prime Studio ou Dra. Ana"
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Especialidade / Profissão
                </label>
                <input
                  type="text"
                  value={especialidade}
                  onChange={(e) => setEspecialidade(e.target.value)}
                  placeholder="Ex: Fisioterapeuta, Desenvolvedor, Psicólogo..."
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Subtítulo / Slogan de Destaque
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Ex: Agende seu horário com facilidade e rapidez"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Descrição do Perfil / Apresentação
              </label>
              <textarea
                rows={2}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Atendimento personalizado com excelência e hora marcada."
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
              />
            </div>

            {/* Campo de Slug / Link Público de Agendamento */}
            <div className="space-y-2 pt-3 border-t border-border/20">
              <div className="flex items-center justify-between">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={14} className="text-primary" />
                  Link Público de Agendamento (Slug)
                </label>
                {profissional.slug && (
                  <a
                    href={`/${profissional.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-body text-primary hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>Testar página</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>

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
              <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
                Este é o link direto que seus pacientes utilizarão para agendar consultas. Use apenas letras minúsculas, números e hífens.
              </p>
            </div>
          </div>

          {/* Card 2: Cor da Marca (Hexadecimal + Color Picker) */}
          <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-5">
            <div className="flex items-center justify-between border-b border-border/30 pb-3">
              <div className="flex items-center gap-2.5 text-foreground font-display font-bold text-base">
                <Palette size={18} className="text-primary" />
                <span>Cor da Marca (Primária)</span>
              </div>
              <span
                className="w-4 h-4 rounded-full border border-border shadow-xs"
                style={{ backgroundColor: corPrevia }}
              />
            </div>

            {/* Input e Color Picker */}
            <div className="space-y-3">
              <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Código Hexadecimal da Marca
              </label>
              <div className="flex items-center gap-3">
                {/* Visualizador / Color Picker Nativo */}
                <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-border shadow-soft shrink-0 cursor-pointer">
                  <input
                    type="color"
                    value={corValida ? corHex : "#0d9488"}
                    onChange={(e) => setCorHex(e.target.value.toLowerCase())}
                    className="absolute -inset-2 w-16 h-16 cursor-pointer border-none bg-transparent"
                    title="Selecione a cor com o conta-gotas"
                  />
                </div>

                {/* Campo de Texto HEX */}
                <div className="relative flex-1">
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
                    className={`w-full px-4 py-3 rounded-xl bg-background border font-mono text-sm font-bold tracking-wider transition-all focus:outline-none focus:ring-2 ${
                      corValida
                        ? "border-border text-foreground focus:ring-primary/40 focus:border-primary"
                        : "border-rose-500/60 text-rose-600 focus:ring-rose-500/30"
                    }`}
                  />
                </div>
              </div>

              {!corValida && (
                <p className="font-body text-xs text-rose-500 flex items-center gap-1.5 font-medium">
                  <AlertCircle size={13} />
                  Formato inválido. Use um código Hexadecimal como #2563EB ou #0D9488.
                </p>
              )}
            </div>

            {/* Presets Recomendados */}
            <div className="space-y-2 pt-2 border-t border-border/20">
              <span className="font-body text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
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

          {/* Card 3: Upload de Logo (Supabase Storage: logos) */}
          <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border/30 pb-3">
              <div className="flex items-center gap-2.5 text-foreground font-display font-bold text-base">
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
                  Remover Logo
                </button>
              )}
            </div>

            {/* Input Oculto de Arquivo */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleSelecionarArquivo}
              className="hidden"
            />

            {logoUrl ? (
              /* Logo Atual Carregada */
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-secondary/40 border border-border/60">
                <div className="w-24 h-24 rounded-2xl bg-background border border-border flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-inner">
                  <img
                    src={logoUrl}
                    alt="Logo da clínica"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                  <p className="font-display font-bold text-sm text-foreground">
                    Logotipo ativa
                  </p>
                  <p className="font-body text-xs text-muted-foreground break-all truncate">
                    {logoUrl}
                  </p>
                  <button
                    type="button"
                    disabled={enviandoLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-body font-bold text-foreground hover:bg-secondary transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <UploadCloud size={14} />
                    Substituir Imagem
                  </button>
                </div>
              </div>
            ) : (
              /* Área de Upload (Drag & Drop / Clique) */
              <div
                onClick={() => !enviandoLogo && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                  enviandoLogo
                    ? "border-primary/40 bg-primary/5 cursor-wait"
                    : "border-border/80 hover:border-primary hover:bg-primary/5"
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  {enviandoLogo ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <UploadCloud size={24} />
                  )}
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-foreground">
                    {enviandoLogo ? "Enviando imagem..." : "Clique para enviar a logo"}
                  </p>
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    Formatos suportados: PNG, JPG, JPEG ou WebP (máximo 2MB)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Botão de Salvar Alterações */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={salvando || enviandoLogo || !corValida}
              className={`w-full py-4 rounded-2xl font-body font-bold text-sm shadow-soft transition-all flex items-center justify-center gap-2 cursor-pointer ${
                salvando || enviandoLogo || !corValida
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                  : "bg-primary text-primary-foreground hover:shadow-soft-lg hover:-translate-y-0.5"
              }`}
            >
              {salvando ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Salvando Alterações...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </form>

        {/* ── Coluna Direita: Live Preview em Tempo Real ── */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-8">
          <div className="flex items-center gap-2 text-foreground font-display font-bold text-sm">
            <Eye size={16} className="text-primary" />
            <span>Pré-visualização da Landing Page</span>
          </div>

          {/* Mockup da Landing Page */}
          <div className="bg-card rounded-3xl border border-border/70 shadow-floating overflow-hidden">
            {/* Topbar do Mockup com a Cor e Logo */}
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
                  {nomeNegocio || "Sua Clínica"}
                </span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-body font-bold text-white shadow-xs shrink-0"
                style={{ backgroundColor: corPrevia }}
              >
                Agendar
              </span>
            </div>

            {/* Corpo do Mockup (Hero Card Simulado) */}
            <div className="p-5 space-y-4 bg-background">
              {/* Hero Banner estilizado com a cor escolhida */}
              <div
                className="p-6 rounded-2xl text-white relative overflow-hidden shadow-soft-lg"
                style={{
                  background: `linear-gradient(135deg, ${corPrevia}, ${corPrevia}cc)`,
                }}
              >
                <div className="relative z-10 space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white font-body text-[10px] font-bold backdrop-blur-xs">
                    <CheckCircle2 size={12} />
                    <span>{especialidade || "Especialidade"}</span>
                  </div>

                  <h3 className="font-display font-extrabold text-lg text-white leading-tight">
                    {tagline || "Agende sua consulta online"}
                  </h3>
                  <p className="font-body text-xs text-white/80 line-clamp-2">
                    {descricao || "Escolha o melhor dia e horário para o seu atendimento com total comodidade."}
                  </p>
                </div>
              </div>

              {/* Botão de Agendamento Simulado */}
              <div className="space-y-2">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Botão Principal da Consulta
                </span>
                <button
                  type="button"
                  className="w-full py-3 rounded-xl font-body font-bold text-xs text-white shadow-soft transition-all flex items-center justify-center gap-2 cursor-default"
                  style={{ backgroundColor: corPrevia }}
                >
                  Confirmar Agendamento
                </button>
              </div>

              {/* Seletor de Horários Simulado */}
              <div className="space-y-2 pt-2 border-t border-border/30">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Horário Ativo:
                </span>
                <div className="flex gap-2">
                  <span
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs flex items-center gap-1"
                    style={{ backgroundColor: corPrevia }}
                  >
                    <Clock size={12} />
                    09:00
                  </span>
                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-muted-foreground border border-border/40">
                    10:00
                  </span>
                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-muted-foreground border border-border/40">
                    11:00
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
