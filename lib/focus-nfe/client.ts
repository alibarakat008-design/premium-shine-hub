/**
 * =====================================================
 * EMISSÃO AUTOMÁTICA DE NF-e — Focus NFe
 * Premium Shine Hub
 * =====================================================
 *
 * Por que Focus NFe?
 *   - Mais barato que eNotas / NFe.io
 *   - API simples e bem documentada
 *   - Suporta NFe, NFCe, MDFe, CTe
 *   - Validação em tempo real
 *
 * Setup:
 *   1) Criar conta em focusnfe.com.br
 *   2) Cadastrar empresa (precisa de CNPJ + certificado A1)
 *   3) Gerar token de API
 *   4) Colocar no .env: FOCUS_NFE_TOKEN=...
 *
 * Fluxo:
 *   - Venda confirmada (PIX pago OU pedido ML)
 *   - Sistema gera NF-e automaticamente
 *   - XML + PDF salvos no banco + Drive
 *   - Alerta pro admin
 *
 * Endpoints:
 *   POST /api/nfe/emitir     — Emite NF-e pra um pedido
 *   GET  /api/nfe/:id         — Busca status
 *   POST /api/nfe/cancelar    — Cancela NF-e
 *   GET  /api/nfe/listar      — Lista emitidas
 * =====================================================
 */

// lib/focus-nfe/client.ts

const FOCUS_NFE_URL = process.env.FOCUS_NFE_ENV === 'production'
  ? 'https://api.focusnfe.com.br/v2'
  : 'https://homologacao.focusnfe.com.br/v2'

const FOCUS_NFE_TOKEN = process.env.FOCUS_NFE_TOKEN!

interface NFeRequest {
  // Dados básicos
  natureza_operacao: string // 'VENDA'
  numero?: number
  serie: string // '1'
  data_emissao?: string
  tipo_documento: '1' | '2' // 1=Saída, 2=Entrada
  finalidade_emissao: '1' | '2' | '3' | '4'
  presenca_comprador: '0' | '1' | '2' | '3' | '4' | '5' | '9'

  // Emitente (sua empresa)
  cnpj_emitente: string
  inscricao_estadual_emitente?: string
  nome_emitente: string
  nome_fantasia_emitente?: string
  regime_tributario_emitente: '1' | '2' | '3' // 1=Simples Nacional
  cnae_emitente?: string
  codigo_de_regime_tributario?: string

  // Destinatário
  cnpj_destinatario?: string
  cpf_destinatario?: string
  inscricao_estadual_destinatario?: string
  nome_destinatario: string
  email_destinatario?: string

  // Endereço destinatário
  logradouro_destinatario?: string
  numero_destinatario?: string
  bairro_destinatario?: string
  municipio_destinatario?: string
  uf_destinatario?: string
  cep_destinatario?: string
  telefone_destinatario?: string

  // Itens
  items: NFeItem[]

  // Totais (calculados automaticamente, mas pode passar)
  valor_produtos?: number
  valor_frete?: number
  valor_seguro?: number
  valor_desconto?: number
  valor_outras_despesas?: number
  valor_total?: number

  // Pagamento
  forma_pagamento: '01' | '02' | '03' | '04' | '05' | '10' | '11' | '12' | '13' | '14' | '15' | '90' | '99'
  // 01=Dinheiro, 02=Cheque, 03=Cartão Crédito, 04=Cartão Débito, 05=Crédito Loja,
  // 10=Vale Alimentação, 11=Vale Refeição, 12=Vale Presente, 13=Vale Combustível,
  // 14=Duplicata Mercantil, 15=Boleto, 90=Sem Pagamento, 99=Outros
  meio_pagamento?: string

  // Frete
  modalidade_frete: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  // 0=Sem frete, 1=CIF, 2=FOB, 3=Terceiros, 4=Próprio remetente, 5=Próprio destinatário
  transportadora_frete?: {
    cnpj: string
    nome: string
    inscricao_estadual?: string
    endereco?: string
    municipio?: string
    uf?: string
  }
  veiculo_placa?: string

  // Informações extras
  informacoes_adicionais?: string
  referencias?: any[]

  // Pedido de referência
  numero_pedido?: string
  chave_pedido?: string
}

interface NFeItem {
  numero_item: number
  codigo_produto: string
  descricao: string
  cfop: string // 5102, 6102, etc
  unidade_comercial: string // 'UN', 'CX', 'KG'
  quantidade_comercial: number
  valor_unitario_comercial: number
  valor_bruto: number
  codigo_ncm: string
  ean?: string
  ean_tributario?: string
  // Impostos
  icms_origem: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
  icms_situacao_tributaria: string // '00', '20', '40', '60', etc (Simples Nacional: '102', '500')
  icms_aliquota?: number
  icms_valor?: number
  pis_situacao_tributaria?: string
  pis_aliquota?: number
  pis_valor?: number
  cofins_situacao_tributaria?: string
  cofins_aliquota?: number
  cofins_valor?: number
  ipi_situacao_tributaria?: string
  ipi_aliquota?: number
  ipi_valor?: number
}

interface NFeResponse {
  status: 'autorizado' | 'cancelado' | 'rejeitado' | 'pendente' | 'erro'
  mensagem?: string
  chave?: string
  numero?: string
  serie?: string
  data_autorizacao?: string
  protocolo?: string
  xml_url?: string
  pdf_url?: string
  erros?: { codigo: string; mensagem: string }[]
}

async function focusNfeRequest(path: string, method: string = 'GET', body?: any): Promise<NFeResponse> {
  const url = `${FOCUS_NFE_URL}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FOCUS_NFE_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data: any = await res.json()

  if (!res.ok && data.status !== 'rejeitado') {
    throw new Error(`Focus NFe error: ${JSON.stringify(data)}`)
  }

  return data
}

// =====================================================
// 1) CRIAR NF-e (rascunho)
// =====================================================
export async function createNFe(ref: string, data: NFeRequest): Promise<NFeResponse> {
  return focusNfeRequest(`/nfe?ref=${ref}`, 'POST', data)
}

// =====================================================
// 2) BUSCAR STATUS
// =====================================================
export async function getNFeStatus(ref: string): Promise<NFeResponse> {
  return focusNfeRequest(`/nfe/${ref}`)
}

// =====================================================
// 3) CANCELAR
// =====================================================
export async function cancelNFe(ref: string, justificativa: string): Promise<NFeResponse> {
  return focusNfeRequest(`/nfe/${ref}`, 'DELETE', { justificativa })
}

// =====================================================
// 4) HELPER: Montar NF-e a partir de um pedido
// =====================================================
export function buildNFeFromOrder(order: any, company: any, customer: any, items: any[]): NFeRequest {
  // Monta estrutura da NF-e baseado no pedido
  return {
    natureza_operacao: 'VENDA',
    serie: '1',
    tipo_documento: '1',
    finalidade_emissao: '1',
    presenca_comprador: '2', // Internet

    // Emitente (sua empresa)
    cnpj_emitente: company.cnpj.replace(/\D/g, ''),
    inscricao_estadual_emitente: company.inscricao_estadual,
    nome_emitente: company.razao_social,
    nome_fantasia_emitente: company.nome_fantasia,
    regime_tributario_emitente: '1', // Simples Nacional
    cnae_emitente: company.cnae || '4646001', // Cosméticos
    codigo_de_regime_tributario: '3', // Simples Nacional

    // Destinatário
    cpf_destinatario: customer.cpf?.replace(/\D/g, ''),
    nome_destinatario: customer.nome,
    email_destinatario: customer.email,
    logradouro_destinatario: order.endereco_entrega?.logradouro,
    numero_destinatario: order.endereco_entrega?.numero,
    bairro_destinatario: order.endereco_entrega?.bairro,
    municipio_destinatario: order.endereco_entrega?.cidade,
    uf_destinatario: order.endereco_entrega?.estado,
    cep_destinatario: order.endereco_entrega?.cep?.replace(/\D/g, ''),
    telefone_destinatario: customer.telefone,

    // Itens
    items: items.map((item, idx) => ({
      numero_item: idx + 1,
      codigo_produto: item.sku,
      descricao: item.nome_produto,
      cfop: '6102', // Venda interestadual
      unidade_comercial: 'UN',
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: Number(item.preco_unitario),
      valor_bruto: Number(item.preco_total),
      codigo_ncm: item.ncm || '33030000', // Cosméticos
      ean: item.ean,
      // Simples Nacional: ICMS ISENTO
      icms_origem: '0',
      icms_situacao_tributaria: '102', // Simples Nacional sem permissão de crédito
      icms_aliquota: 0,
      icms_valor: 0,
      // PIS/COFINS regime Simples
      pis_situacao_tributaria: '07', // Isento
      pis_aliquota: 0,
      pis_valor: 0,
      cofins_situacao_tributaria: '07',
      cofins_aliquota: 0,
      cofins_valor: 0,
    })),

    // Totais
    valor_produtos: Number(order.subtotal),
    valor_frete: Number(order.frete),
    valor_total: Number(order.total),

    // Pagamento (PIX)
    forma_pagamento: '99', // Outros (PIX)
    meio_pagamento: 'Pix',

    // Frete
    modalidade_frete: '0', // Sem frete (calcular separadamente se necessário)

    // Referência ao pedido
    numero_pedido: order.order_number,
    chave_pedido: order.id,

    // Info adicional
    informacoes_adicionais: `Pedido #${order.order_number}. ${items.length} produto(s).`,
  }
}
