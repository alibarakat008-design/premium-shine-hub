/**
 * =====================================================
 * GATEWAY DE PAGAMENTO — PIX via Asaas
 * Premium Shine Hub
 * =====================================================
 *
 * Por que Asaas?
 *   - PIX com taxa ZERO (0% sobre PIX)
 *   - Cartão: 2,5% (vs 5% do Mercado Pago)
 *   - Webhook em tempo real
 *   - D+0 (cai na hora)
 *
 * Setup:
 *   1) Criar conta em asaas.com
 *   2) Gerar API Key em "Integrações"
 *   3) Colocar no .env: ASAAS_API_KEY=sua_key
 *   4) Configurar webhook: https://seudominio.com.br/api/payment/webhook
 *
 * Endpoints:
 *   POST /api/payment/pix         — Gerar PIX pra um pedido
 *   GET  /api/payment/status/:id  — Checar status do pagamento
 *   POST /api/payment/webhook     — Receber confirmação Asaas
 * =====================================================
 */

// lib/asaas/client.ts

import crypto from 'crypto'

const ASAAS_API_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://www.asaas.com/api/v3'
  : 'https://sandbox.asaas.com/api/v3'

const ASAAS_API_KEY = process.env.ASAAS_API_KEY!

interface AsaasCustomer {
  id?: string
  name: string
  email: string
  phone?: string
  cpfCnpj: string
  postalCode?: string
  addressNumber?: string
  addressCity?: string
  addressState?: string
}

interface AsaasPayment {
  id: string
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'CANCELED'
  value: number
  netValue: number
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD'
  dueDate: string
  paidDate?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  pixQrCodeId?: string
  customer: string
  externalReference?: string
}

async function asaasRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
  const res = await fetch(`${ASAAS_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Asaas error ${res.status}: ${err}`)
  }

  return res.json()
}

// =====================================================
// HELPER: Criar ou encontrar cliente no Asaas
// =====================================================
export async function getOrCreateAsaasCustomer(data: {
  name: string
  email: string
  phone?: string
  cpfCnpj: string
  postalCode?: string
  addressNumber?: string
  addressCity?: string
  addressState?: string
}): Promise<string> {
  // Tentar encontrar cliente existente por CPF/CNPJ
  const cpfLimpo = data.cpfCnpj.replace(/\D/g, '')
  const existing = await asaasRequest(`/customers?cpfCnpj=${cpfLimpo}`)

  if (existing.data && existing.data.length > 0) {
    return existing.data[0].id
  }

  // Criar novo
  const customer = await asaasRequest('/customers', 'POST', {
    name: data.name,
    email: data.email,
    phone: data.phone,
    cpfCnpj: cpfLimpo,
    postalCode: data.postalCode?.replace(/\D/g, ''),
    addressNumber: data.addressNumber,
    addressCity: data.addressCity,
    addressState: data.addressState,
  })

  return customer.id
}

// =====================================================
// CRIAR PAGAMENTO PIX
// =====================================================
export async function createPixPayment(data: {
  orderId: string
  customer: AsaasCustomer
  value: number
  description: string
  dueDate?: string // ISO date
}): Promise<{
  paymentId: string
  pixQrCode: string
  pixQrCodeImage: string
  invoiceUrl: string
  expiresAt: string
}> {
  // 1) Criar/encontrar cliente
  const customerId = await getOrCreateAsaasCustomer(data.customer)

  // 2) Calcular data de vencimento (PIX expira em 24h)
  const dueDate = data.dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // 3) Criar pagamento
  const payment: AsaasPayment = await asaasRequest('/payments', 'POST', {
    customer: customerId,
    billingType: 'PIX',
    value: data.value,
    dueDate,
    description: data.description,
    externalReference: data.orderId, // nosso ID do pedido
  })

  // 4) Buscar QR Code PIX
  const pixData = await asaasRequest(`/payments/${payment.id}/pixQrCode`)

  return {
    paymentId: payment.id,
    pixQrCode: pixData.payload, // texto do QR code (copia e cola)
    pixQrCodeImage: pixData.encodedImage, // imagem base64
    invoiceUrl: payment.invoiceUrl || '',
    expiresAt: pixData.expirationDate,
  }
}

// =====================================================
// VERIFICAR STATUS
// =====================================================
export async function checkPaymentStatus(asaasPaymentId: string): Promise<{
  status: string
  paid: boolean
  paidDate?: string
}> {
  const payment: AsaasPayment = await asaasRequest(`/payments/${asaasPaymentId}`)

  return {
    status: payment.status,
    paid: payment.status === 'RECEIVED' || payment.status === 'CONFIRMED',
    paidDate: payment.paidDate,
  }
}

// =====================================================
// WEBHOOK VALIDATION
// =====================================================
export function validateAsaasWebhook(body: any, signature: string): boolean {
  // Asaas manda token no body, não usa HMAC
  // Você configura um token em "Integrações > Webhooks"
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN

  if (!webhookToken) {
    console.warn('ASAAS_WEBHOOK_TOKEN não configurado, pulando validação')
    return true
  }

  return body?.auth === webhookToken || signature === webhookToken
}
