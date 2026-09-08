import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface WebhookRecord {
  id: string | number;
  empresa_id?: string;
  servico_id?: string | number;
  cliente_id?: string | number;
  nome_cliente?: string;
  cliente_nome?: string;
  nome?: string;
  telefone?: string;
  whatsapp_cliente?: string;
  cliente_telefone?: string;
  whatsapp?: string;
  servico_nome?: string;
  servico?: string;
  data?: string;
  data_agendamento?: string;
  data_hora_agendamento?: string;
  horario?: string;
  hora?: string;
  status?: string;
  observacoes?: string;
  notas?: string;
  [key: string]: any;
}

interface WebhookPayload {
  type?: "INSERT" | "UPDATE" | "DELETE" | string;
  table?: string;
  schema?: string;
  record?: WebhookRecord;
  old_record?: WebhookRecord | null;
  [key: string]: any;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sanitizarTelefone(tel?: string | null): string | null {
  if (!tel) return null;
  const digitos = tel.replace(/\D/g, "");
  if (digitos.length < 10) return null;

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return digitos;
}

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return "Data a confirmar";
  try {
    const limpa = dataStr.split("T")[0];
    const [ano, mes, dia] = limpa.split("-");
    if (ano && mes && dia) {
      return `${dia}/${mes}/${ano}`;
    }
  } catch { }
  return dataStr;
}

async function enviarMensagemWhatsApp({
  apiUrl,
  apiKey,
  instance,
  numero,
  texto,
}: {
  apiUrl: string;
  apiKey: string;
  instance: string;
  numero: string;
  texto: string;
}): Promise<{ sucesso: boolean; resposta?: any; erro?: string }> {
  const urlLimpa = apiUrl.replace(/\/+$/, "");
  const endpoint = `${urlLimpa}/message/sendText/${instance}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: numero,
        text: texto,
        textMessage: {
          text: texto,
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const msgErro = `Falha HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.error(`[Evolution API] Erro no disparo para ${numero}:`, msgErro);
      return { sucesso: false, erro: msgErro, resposta: data };
    }

    console.log(`[Evolution API] Mensagem enviada com sucesso para ${numero}!`, data);
    return { sucesso: true, resposta: data };
  } catch (err: any) {
    const msgErro = err?.message || String(err);
    console.error(`[Evolution API] Exceção na requisição para ${numero}:`, msgErro);
    return { sucesso: false, erro: msgErro };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL =
      Deno.env.get("EVOLUTION_API_URL") ||
      "https://evolution-api-production-a2b26.up.railway.app";
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "praxis";

    // O Supabase injeta essas variáveis nativamente em Edge Functions
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const payload: WebhookPayload = await req.json().catch(() => ({}));
    console.log("[Webhook Recebido]", JSON.stringify(payload));

    const type = payload.type || (payload.record ? "INSERT" : "");
    const record: WebhookRecord = payload.record || payload;

    if (!record || !record.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nenhum registro de agendamento válido encontrado no payload.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 1. Validação Flexível de Evento (não exige old_record) ──────────────────
    const status = String(record?.status || "").trim().toLowerCase();
    const isCancelamento =
      (type === "UPDATE" || type === "INSERT") &&
      (status === "cancelado" || status === "cancelada");
    const isNovoAgendamento =
      type === "INSERT" && status !== "cancelado" && status !== "cancelada";

    if (!isNovoAgendamento && !isCancelamento) {
      console.log(
        `[Evento Ignorado] Tipo: "${type}", Status: "${record.status}"`
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "Evento ignorado",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[Processando Agendamento #${record.id}] Tipo: ${type} | isCancelamento: ${isCancelamento} | isNovoAgendamento: ${isNovoAgendamento}`
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2. Hidratação Completa dos Dados (Fallback via SELECT no Banco) ────────
    let dbAgendamento: any = null;
    try {
      const { data: agData, error: agErr } = await supabase
        .from("agendamentos")
        .select(`
          *,
          clientes:cliente_id (id, nome, telefone),
          servicos:servico_id (id, nome, preco, duracao),
          empresas:empresa_id (id, nome_negocio, telefone)
        `)
        .eq("id", record.id)
        .maybeSingle();

      if (!agErr && agData) {
        dbAgendamento = agData;
      } else {
        // Fallback para select simples se houver problema com joins
        const { data: agSimples } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("id", record.id)
          .maybeSingle();
        if (agSimples) dbAgendamento = agSimples;
      }
    } catch (hydrateErr) {
      console.warn("[Aviso] Erro durante hidratação do agendamento:", hydrateErr);
    }

    // Dados consolidados do agendamento
    const targetEmpresaId = record.empresa_id || dbAgendamento?.empresa_id;
    const targetServicoId = record.servico_id || dbAgendamento?.servico_id;

    // Resolução do Nome do Paciente
    const nomePaciente =
      record.cliente_nome ||
      record.nome_cliente ||
      record.nome ||
      dbAgendamento?.cliente_nome ||
      dbAgendamento?.nome_cliente ||
      dbAgendamento?.clientes?.nome ||
      "Paciente";

    // Resolução do Telefone do Paciente
    const telefonePacienteBruto =
      record.whatsapp_cliente ||
      record.cliente_telefone ||
      record.telefone ||
      record.whatsapp ||
      dbAgendamento?.whatsapp_cliente ||
      dbAgendamento?.cliente_telefone ||
      dbAgendamento?.telefone ||
      dbAgendamento?.clientes?.telefone ||
      null;

    const telefonePaciente = sanitizarTelefone(telefonePacienteBruto);

    // Resolução do Nome e Detalhes do Serviço
    let nomeServico =
      record.servico_nome ||
      record.servico ||
      dbAgendamento?.servico_nome ||
      dbAgendamento?.servicos?.nome ||
      "Consulta";

    let precoServico = dbAgendamento?.servicos?.preco ? String(dbAgendamento.servicos.preco) : "";
    let duracaoServico = dbAgendamento?.servicos?.duracao ? `${dbAgendamento.servicos.duracao} min` : "";

    if ((!nomeServico || nomeServico === "Consulta") && targetServicoId) {
      const { data: servicoDirect } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao")
        .eq("id", targetServicoId)
        .maybeSingle();

      if (servicoDirect) {
        nomeServico = servicoDirect.nome || nomeServico;
        precoServico = servicoDirect.preco ? String(servicoDirect.preco) : precoServico;
        duracaoServico = servicoDirect.duracao ? `${servicoDirect.duracao} min` : duracaoServico;
      }
    }

    // Resolução dos Dados da Empresa / Clínica
    let nomeClinica = dbAgendamento?.empresas?.nome_negocio || "Praxis";
    let telefoneClinicaBruto = dbAgendamento?.empresas?.telefone || null;

    if (!telefoneClinicaBruto && targetEmpresaId) {
      const { data: empresaDirect } = await supabase
        .from("empresas")
        .select("id, nome_negocio, telefone")
        .eq("id", targetEmpresaId)
        .maybeSingle();

      if (empresaDirect) {
        nomeClinica = empresaDirect.nome_negocio || nomeClinica;
        telefoneClinicaBruto = empresaDirect.telefone || null;
      }
    }

    // Fallback de Empresa se necessário
    if (!telefoneClinicaBruto) {
      const { data: fallbackEmpresa } = await supabase
        .from("empresas")
        .select("id, nome_negocio, telefone")
        .limit(1)
        .maybeSingle();

      if (fallbackEmpresa) {
        nomeClinica = fallbackEmpresa.nome_negocio || nomeClinica;
        telefoneClinicaBruto = fallbackEmpresa.telefone || null;
      }
    }

    const telefoneClinicaSanitizado = sanitizarTelefone(telefoneClinicaBruto);

    // Formatação de Data e Horário
    const dataRaw =
      record.data ||
      record.data_agendamento ||
      record.data_hora_agendamento ||
      dbAgendamento?.data ||
      dbAgendamento?.data_agendamento ||
      dbAgendamento?.data_hora_agendamento;

    const dataFormatada = formatarData(dataRaw);

    let horaFormatada =
      record.horario ||
      record.hora ||
      dbAgendamento?.horario ||
      dbAgendamento?.hora ||
      "08:00";

    if (!horaFormatada || horaFormatada === "08:00") {
      const dataHoraIso = record.data_hora_agendamento || dbAgendamento?.data_hora_agendamento;
      if (dataHoraIso) {
        const parteHora = String(dataHoraIso).split("T")[1];
        if (parteHora) horaFormatada = parteHora.slice(0, 5);
      }
    }

    const observacoes =
      record.observacoes ||
      record.notas ||
      dbAgendamento?.observacoes ||
      dbAgendamento?.notas ||
      "";

    console.log(`[Dados Hidratados] Paciente: ${nomePaciente} (${telefonePaciente}) | Clínica: ${nomeClinica} (${telefoneClinicaSanitizado}) | Serviço: ${nomeServico} | Data: ${dataFormatada} ${horaFormatada}`);

    const resultadosEnvios: any[] = [];

    // ── 3. Disparo de Notificações conforme o Tipo ──────────────────────────────
    if (isNovoAgendamento) {
      // ══════════════════════════════════════════
      // CENÁRIO 1: NOVO AGENDAMENTO (INSERT)
      // ══════════════════════════════════════════

      // Mensagem Paciente
      if (telefonePaciente) {
        const textoPaciente = [
          `Olá, *${nomePaciente}*! 👋`,
          ``,
          `Seu agendamento foi registrado com sucesso! 🎉`,
          ``,
          `🏥 *Clínica:* ${nomeClinica}`,
          `🩺 *Serviço:* ${nomeServico}`,
          `📅 *Data:* ${dataFormatada}`,
          `⏰ *Horário:* ${horaFormatada}`,
          precoServico ? `💰 *Valor:* R$ ${precoServico}` : null,
          duracaoServico ? `⏱️ *Duração estimada:* ${duracaoServico}` : null,
          ``,
          `Caso precise reagendar ou tirar dúvidas, basta responder a esta mensagem.`,
          ``,
          `Agradecemos a confiança! ✨`,
        ]
          .filter((l) => l !== null)
          .join("\n");

        console.log(`[Disparo WhatsApp] Destinatário: Paciente (${telefonePaciente}) | Tipo: Novo Agendamento`);
        console.log(`[Texto Mensagem Paciente]:\n${textoPaciente}`);

        const resPaciente = await enviarMensagemWhatsApp({
          apiUrl: EVOLUTION_API_URL,
          apiKey: EVOLUTION_API_KEY,
          instance: EVOLUTION_INSTANCE,
          numero: telefonePaciente,
          texto: textoPaciente,
        });

        resultadosEnvios.push({
          destinatario: "paciente",
          tipo: "novo_agendamento",
          numero: telefonePaciente,
          status: resPaciente.sucesso ? "enviado" : "erro",
          detalhes: resPaciente,
        });
      } else {
        console.warn("[Aviso] Paciente não possui telefone sanitizável válido para novo agendamento.");
      }

      // Mensagem Profissional / Clínica
      if (telefoneClinicaSanitizado) {
        const textoClinica = [
          `🔔 *Novo Agendamento Confirmado!*`,
          ``,
          `👤 *Paciente:* ${nomePaciente}`,
          telefonePacienteBruto ? `📱 *Contato:* ${telefonePacienteBruto}` : null,
          `🩺 *Serviço:* ${nomeServico}`,
          `📅 *Data:* ${dataFormatada}`,
          `⏰ *Horário:* ${horaFormatada}`,
          observacoes ? `📝 *Observações:* ${observacoes}` : null,
          ``,
          `Acesse seu painel *Praxis* para visualizar os detalhes completos da sua agenda.`,
        ]
          .filter((l) => l !== null)
          .join("\n");

        console.log(`[Disparo WhatsApp] Destinatário: Clínica/Profissional (${telefoneClinicaSanitizado}) | Tipo: Novo Agendamento`);
        console.log(`[Texto Mensagem Clínica]:\n${textoClinica}`);

        const resClinica = await enviarMensagemWhatsApp({
          apiUrl: EVOLUTION_API_URL,
          apiKey: EVOLUTION_API_KEY,
          instance: EVOLUTION_INSTANCE,
          numero: telefoneClinicaSanitizado,
          texto: textoClinica,
        });

        resultadosEnvios.push({
          destinatario: "clinica",
          tipo: "novo_agendamento",
          numero: telefoneClinicaSanitizado,
          status: resClinica.sucesso ? "enviado" : "erro",
          detalhes: resClinica,
        });
      } else {
        console.warn(
          `[Alerta Profissional Ignorado] Telefone da clínica não pôde ser sanitizado. Valor bruto: "${telefoneClinicaBruto}"`
        );
      }
    } else if (isCancelamento) {
      // ══════════════════════════════════════════
      // CENÁRIO 2: CANCELAMENTO (UPDATE / INSERT 'cancelado')
      // ══════════════════════════════════════════

      // Mensagem Paciente
      if (telefonePaciente) {
        const textoPacienteCancelamento = [
          `❌ *Agendamento Cancelado*`,
          ``,
          `Olá, *${nomePaciente}*. Confirmamos o cancelamento da sua consulta de *${nomeServico}* marcada para o dia *${dataFormatada}* às *${horaFormatada}*.`,
          ``,
          `Se desejar reagendar em outro momento, acesse nossa página novamente.`,
        ].join("\n");

        console.log(`[Disparo WhatsApp] Destinatário: Paciente (${telefonePaciente}) | Tipo: Cancelamento`);
        console.log(`[Texto Mensagem Cancelamento Paciente]:\n${textoPacienteCancelamento}`);

        const resPaciente = await enviarMensagemWhatsApp({
          apiUrl: EVOLUTION_API_URL,
          apiKey: EVOLUTION_API_KEY,
          instance: EVOLUTION_INSTANCE,
          numero: telefonePaciente,
          texto: textoPacienteCancelamento,
        });

        resultadosEnvios.push({
          destinatario: "paciente",
          tipo: "cancelamento",
          numero: telefonePaciente,
          status: resPaciente.sucesso ? "enviado" : "erro",
          detalhes: resPaciente,
        });
      } else {
        console.warn("[Aviso] Paciente não possui telefone sanitizável válido para notificação de cancelamento.");
      }

      // Mensagem Profissional / Clínica
      if (telefoneClinicaSanitizado) {
        const textoClinicaCancelamento = [
          `⚠️ *Agendamento Cancelado*`,
          ``,
          `O paciente *${nomePaciente}* cancelou a consulta de *${nomeServico}* que estava agendada para o dia *${dataFormatada}* às *${horaFormatada}*.`,
          ``,
          `O horário foi liberado na sua agenda do Praxis.`,
        ].join("\n");

        console.log(`[Disparo WhatsApp] Destinatário: Clínica/Profissional (${telefoneClinicaSanitizado}) | Tipo: Cancelamento`);
        console.log(`[Texto Mensagem Cancelamento Clínica]:\n${textoClinicaCancelamento}`);

        const resClinica = await enviarMensagemWhatsApp({
          apiUrl: EVOLUTION_API_URL,
          apiKey: EVOLUTION_API_KEY,
          instance: EVOLUTION_INSTANCE,
          numero: telefoneClinicaSanitizado,
          texto: textoClinicaCancelamento,
        });

        resultadosEnvios.push({
          destinatario: "clinica",
          tipo: "cancelamento",
          numero: telefoneClinicaSanitizado,
          status: resClinica.sucesso ? "enviado" : "erro",
          detalhes: resClinica,
        });
      } else {
        console.warn(
          `[Alerta Cancelamento Profissional Ignorado] Telefone da clínica não pôde ser sanitizado. Valor bruto: "${telefoneClinicaBruto}"`
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        evento: isNovoAgendamento ? "novo_agendamento" : "cancelamento",
        agendamento_id: record.id,
        paciente: nomePaciente,
        clinica: nomeClinica,
        resultados: resultadosEnvios,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[Erro Fatal na Edge Function notificar-agendamento]:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});