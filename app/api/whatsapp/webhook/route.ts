/**
 * =====================================================
 * WEBHOOK WHATSAPP BUSINESS API
 * =====================================================
 * Recebe webhooks do WhatsApp/Meta:
 *   - Mensagens recebidas (inbound)
 *   - Status de mensagens enviadas (outbound status)
 *
 * URL a cadastrar no Meta Developer Console:
 *   https://premium-shine-hub-pkg.vercel.app/api/whatsapp/webhook
 *   Verify Token: wa_botshine_2026
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID!
const WA_APP_SECRET = process.env.WA_APP_SECRET!
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN!
const WA_NUMEROS_PERMITIDOS = (process.env.WA_NUMEROS_PERMITIDOS || '').split(',').map(s => s.trim())
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ============================================================
// GET: verificação do Meta (validação de webhook)
// ============================================================
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  console.log('[WhatsApp Webhook] GET - mode:', mode, 'token:', token ? 'provided' : 'missing')

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verificação bem-sucedida!')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[WhatsApp Webhook] Verificação falhou - token inválido ou modo errado')
  return new NextResponse('Forbidden', { status: 403 })
}

// ============================================================
// POST: recebe mensagens e status do WhatsApp
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[WhatsApp Webhook] POST payload:', JSON.stringify(body).slice(0, 500))

    // Estrutura: { object: "whatsapp_business_account", entry: [...] }
    if (body.object !== 'whatsapp_business_account') {
      console.log('[WhatsApp Webhook] Ignorando - não é WhatsApp Business Account')
      return NextResponse.json({ ok: true, status: 'ignored' })
    }

    const entries = body.entry || []
    for (const entry of entries) {
      const changes = entry.changes || []
      for (const change of changes) {
        const value = change.value || {}

        // --- Mensagens Recebidas ---
        const messages = value.messages || []
        for (const msg of messages) {
          await processarMensagemRecebida(msg)
        }

        // --- Status de mensagens enviadas ---
        const statusUpdates = value.statuses || []
        for (const status of statusUpdates) {
          await processarStatusMensagem(status)
        }
      }
    }

    // Meta exige resposta 200 rapidamente
    return NextResponse.json({ ok: true, status: 'received' })
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Erro:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// ============================================================
// Processar mensagem recebida do cliente
// ============================================================
async function processarMensagemRecebida(msg: any) {
  try {
    const from = msg.from       // número do remetente (ex: "5511999999999")
    const msgId = msg.id
    const timestamp = msg.timestamp
    const tipo = msg.type       // "text", "image", "interactive", etc.
    const texto = msg.text?.body || ''

    // Verificar se número é permitido
    if (WA_NUMEROS_PERMITIDOS.length > 0 && !WA_NUMEROS_PERMITIDOS.includes(from)) {
      console.log(`[WhatsApp] Número não permitido: ${from}`)
      return
    }

    console.log(`[WhatsApp] Mensagem de ${from}: ${texto || `(${tipo})`}`)

    // Registrar no Supabase
    await salvarMensagem({
      msg_id: msgId,
      from_number: from,
      tipo: tipo,
      conteudo: texto,
      direcao: 'inbound',
      timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
      status: 'received',
    })

    // Responder automaticamente
    await enviarRespostaAutomatica(from, texto, tipo, msgId)
  } catch (err: any) {
    console.error('[WhatsApp] Erro ao processar mensagem:', err)
  }
}

// ============================================================
// Processar atualização de status
// ============================================================
async function processarStatusMensagem(status: any) {
  try {
    const msgId = status.id
    const statusEnvio = status.status  // "sent", "delivered", "read", "failed"
    const timestamp = status.timestamp

    console.log(`[WhatsApp] Status mensagem ${msgId}: ${statusEnvio}`)

    await salvarMensagem({
      msg_id: msgId,
      from_number: status.recipient_id || '',
      tipo: 'status_update',
      conteudo: statusEnvio,
      direcao: 'outbound_status',
      timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date(),
      status: statusEnvio,
    })
  } catch (err: any) {
    console.error('[WhatsApp] Erro ao processar status:', err)
  }
}

// ============================================================
// Resposta automática do bot
// ============================================================
async function enviarRespostaAutomatica(to: string, texto: string, tipo: string, msgId: string) {
  const textoLower = texto.toLowerCase().trim()

  let resposta = ''

  // Roteamento por palavras-chave
  if (/^(oi|olá|ola|hey|hi|hello)/i.test(textoLower)) {
    resposta = 'Olá! 👋 Bem-vindo(a) à *Liura Essence*!\n\nSou a assistente virtual da nossa loja. Como posso te ajudar?\n\n🔹 *catalogo* — Ver nossos produtos\n🔹 *preço* — Consultar valores\n🔹 *frete* — Informações sobre entrega\n🔹 *pedido* — Acompanhar pedido\n🔹 *contato* — Falar com atendente'
  } else if (/catalogo|catálogo|produtos|ver items/i.test(textoLower)) {
    resposta = '📦 *Catálogo Liura Essence*\n\nTemos mais de 500 produtos de perfumaria!\n\nMarcas principais:\n• ISABELLE LA BELLE\n• POKOLOKA\n• BARBOUR\'S\n• BOURBON\n• SABAH\n• CLUB\n• ANGEL\n• SUGAR\n\nAcesse nosso catálogo completo no Mercado Livre: ml.mercadolivre.com.br/liuraessence'
  } else if (/preço|valor|custo|quanto/i.test(textoLower)) {
    resposta = '💰 *Consulta de Preços*\n\nNossos produtos variam de R$ 29,90 a R$ 200+, dependendo da marca e tamanho.\n\nOs best-sellers são:\n• ASAD — a partir de R$ 79,90\n• BOURBON — a partir de R$ 89,90\n• SABAH — a partir de R$ 69,90\n• BARBOUR\'S — a partir de R$ 99,90\n\nQuer que eu passe o link de algum produto específico?'
  } else if (/frete|entrega|envio|enviar/i.test(textoLower)) {
    resposta = '🚚 *Informações de Frete*\n\n• *FULL*: Entrega rápida Mercado Livre (habitualmente 1-2 dias)\n• *Normal*: 5-10 dias úteis\n\nO frete é calculado automaticamente pelo Mercado Livre conforme seu CEP.\n\nEm compras acima de R$ 199, o *frete é grátis*!'
  } else if (/pedido|acompanhar|rastrear|tracking/i.test(textoLower)) {
    resposta = '📱 *Acompanhamento de Pedido*\n\nPara rastrear seu pedido, acesse:\n👉 https://www.mercadolivre.com.br/orders\n\nSe preferir, me passe o *número do pedido* e eu te ajudo!'
  } else if (/contato|atendente|humano|pessoa|telefone|whatsapp/i.test(textoLower)) {
    resposta = '📞 *Fale com nossa equipe*\n\nWhatsApp: (11) 97144-8104\nE-mail: contato@liuraessence.com.br\n\nHorário de atendimento:\nSegunda a Sexta: 9h às 18h\nSábado: 9h às 13h'
  } else if (/horário|funcionamento|aberto|fechado/i.test(textoLower)) {
    resposta = '🕐 *Horário de Funcionamento*\n\nSegunda a Sexta: 9h às 18h\nSábado: 9h às 13h\nDomingo: Fechado\n\nRespondemos mensagens de segunda a sábado!'
  } else if (/pix|payment|pagar|boleto|parcelar/i.test(textoLower)) {
    resposta = '💳 *Formas de Pagamento*\n\nAceitamos:\n• Cartão de Crédito (até 12x)\n• PIX (à vista)\n• Boleto Bancário\n• Mercado Pago\n\nTodos os pagamentos são processados pelo Mercado Livre — total segurança!'
  } else {
    resposta = '🤖 *Entendi sua mensagem!*\n\nAinda estou aprendendo. Por enquanto posso ajudar com:\n\n🔹 *catalogo* — Ver produtos\n🔹 *preço* — Consultar valores\n🔹 *frete* — Informações de entrega\n🔹 *pedido* — Acompanhar pedido\n🔹 *contato* — Falar com atendente\n\nOu me mande o número do pedido que eu procuro pra você!'
  }

  // Enviar resposta via WhatsApp API
  await enviarMensagemWhatsApp(to, resposta, msgId)
}

// ============================================================
// Enviar mensagem via WhatsApp Business API
// ============================================================
async function enviarMensagemWhatsApp(to: string, texto: string, replyToId?: string) {
  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: texto },
    }

    if (replyToId) {
      payload.context = { message_id: replyToId }
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const result = await response.json()
    if (result.error) {
      console.error('[WhatsApp] Erro ao enviar resposta:', result.error)
    } else {
      console.log(`[WhatsApp] Resposta enviada para ${to}: msg_id=${result.messages?.[0]?.id}`)
    }

    // Registrar mensagem enviada no Supabase
    if (result.messages?.[0]?.id) {
      await salvarMensagem({
        msg_id: result.messages[0].id,
        from_number: to,
        tipo: 'text',
        conteudo: texto,
        direcao: 'outbound',
        timestamp: new Date(),
        status: 'sent',
      })
    }
  } catch (err: any) {
    console.error('[WhatsApp] Erro ao enviar mensagem:', err)
  }
}

// ============================================================
// Salvar mensagem no Supabase
// ============================================================
async function salvarMensagem(data: {
  msg_id: string
  from_number: string
  tipo: string
  conteudo: string
  direcao: string
  timestamp: Date
  status: string
}) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/wa_mensagens_processadas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        msg_id: data.msg_id,
        from_number: data.from_number,
        tipo: data.tipo,
        conteudo: data.conteudo,
        direcao: data.direcao,
        timestamp: data.timestamp.toISOString(),
        status: data.status,
      }),
    })

    if (!response.ok && response.status !== 409) {
      console.warn('[WhatsApp] Falha ao salvar mensagem no Supabase:', response.status)
    }
  } catch (err: any) {
    console.warn('[WhatsApp] Erro ao salvar mensagem no Supabase:', err.message)
  }
}
