/**
 * Gera etiquetas de envio no FORMATO MERCADO LIVRE
 *
 * GET /api/admin/etiquetas/html?ids=uuid1,uuid2&por_pagina=1
 *
 * - 1 etiqueta por página (A4 retrato)
 * - Cabeçalho com remetente (Loja + account_id)
 * - Shipping ID + Pack ID + tracking method (FLEX, etc)
 * - QR Code grande (rastreio)
 * - CEP destino + cidade em destaque
 * - Endereço completo do destinatário
 * - Lista de items (SKU + título + qtd)
 *
 * Dados vêm do endpoint /api/admin/etiquetas/ml-data (com cache)
 * QR Code via api.qrserver.com (grátis, sem auth)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth'
import { ML_LOGO_SVG } from '@/lib/ml-logo'
// @ts-ignore — bwip-js não tem types oficiais
const bwipjs = require('bwip-js')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const escapeHtml = (s: any) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// Cache de pedidos completos (sender, shipping, buyer)
const cache = new Map<string, { ts: number; data: any }>()
const CACHE_TTL = 5 * 60 * 1000

async function fetchJson(url: string, token: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 800))
        continue
      }
      if (!r.ok) return null
      return await r.json()
    } catch {
      await new Promise((res) => setTimeout(res, 200))
    }
  }
  return null
}

async function carregarDados(orders: any[], token: string) {
  const enriched = []
  for (const o of orders) {
    const cacheKey = o.id
    const cached = cache.get(cacheKey)
    let data: any

    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      data = cached.data
    } else {
      // 1) Order detail
      const orderDetail = await fetchJson(
        `https://api.mercadolibre.com/orders/${o.order_number}?access_token=${token}`,
        token
      )

      if (!orderDetail) {
        data = { fallback: true }
      } else {
        // 2) Shipment
        let shipment: any = null
        const shipId = orderDetail.shipping?.id
        if (shipId) {
          shipment = await fetchJson(
            `https://api.mercadolibre.com/shipments/${shipId}?access_token=${token}`,
            token
          )
        }

        // 3) Buyer
        let buyerFull: any = null
        if (orderDetail.buyer?.id) {
          buyerFull = await fetchJson(
            `https://api.mercadolibre.com/users/${orderDetail.buyer.id}?access_token=${token}`,
            token
          )
        }

        data = {
          fallback: false,
          pack_id: orderDetail.pack_id,
          shipping_id: orderDetail.shipping?.id,
          shipping: shipment
            ? {
                tracking_number: shipment.tracking_number,
                tracking_method: shipment.tracking_method,
                tracking_url: shipment.tracking_url,
                logistic_type: shipment.logistic_type,
                status: shipment.status,
                receiver_address: shipment.receiver_address,
                sender_address: shipment.sender_address,
              }
            : null,
          buyer: {
            id: orderDetail.buyer?.id,
            nickname: orderDetail.buyer?.nickname,
            first_name: orderDetail.buyer?.first_name,
            last_name: orderDetail.buyer?.last_name,
            full_name: buyerFull
              ? `${buyerFull.first_name || ''} ${buyerFull.last_name || ''}`.trim()
              : `${orderDetail.buyer?.first_name || ''} ${orderDetail.buyer?.last_name || ''}`.trim(),
            doc_number: buyerFull?.identification?.number || null,
          },
        }
      }
      cache.set(cacheKey, { ts: Date.now(), data })
    }

    enriched.push({ ...o, ml: data })
  }
  return enriched
}

function formatDate(s?: string) {
  if (!s) return ''
  try {
    const d = new Date(s)
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
    return `${String(d.getDate()).padStart(2, '0')} ${meses[d.getMonth()]}`
  } catch {
    return ''
  }
}

/**
 * Gera etiquetas de PICKING (SKU no topo, várias por página)
 * - Não faz fetch no ML (rápido)
 * - Layout denso: 4, 8, 12, 21 por página
 */
async function gerarPicking(ids: string[], porPagina: number) {
  const orders = await prisma.orders.findMany({
    where: { id: { in: ids } },
      select: {
        id: true,
        order_number: true,
        total: true,
        origem: true,
        marketplace_accounts: { select: { plataforma: true } },
        order_items: {
          select: {
            id: true,
            sku: true,
            nome_produto: true,
            quantidade: true,
            products: {
              select: {
                sku: true,
                nome: true,
                brands: { select: { nome: true } },
              },
            },
          },
        },
      },
  })

  // Gera etiquetas (1 por unidade)
  const etiquetas: Array<{
    sku: string
    titulo: string
    marca: string
    qtd: number
    pedido: string
    plataforma: string
    envio_full: boolean
  }> = []

  for (const o of orders) {
    const plataforma = o.marketplace_accounts?.plataforma || o.origem
    for (const it of o.order_items || []) {
      const sku = it.sku || it.products?.sku || 'SEM-SKU'
      const titulo = it.nome_produto || it.products?.nome || 'Sem título'
      const marca = it.products?.brands?.nome || ''
      const qtd = it.quantidade || 1
      const pedido = o.order_number || `ID-${o.id.slice(0, 8)}`
      for (let i = 0; i < qtd; i++) {
        etiquetas.push({ sku, titulo, marca, qtd, pedido, plataforma, envio_full: false })
      }
    }
  }

  // Pagina
  const paginas: typeof etiquetas[] = []
  for (let i = 0; i < etiquetas.length; i += porPagina) {
    paginas.push(etiquetas.slice(i, i + porPagina))
  }

  const gridCols = porPagina <= 2 ? 2 : porPagina <= 4 ? 2 : porPagina <= 12 ? 3 : 3
  const gridRows = Math.ceil(porPagina / gridCols)

  const labelMap: Record<number, { fontSize: string; tituloSize: string; minHeight: string }> = {
    4: { fontSize: '14pt', tituloSize: '11pt', minHeight: '130mm' },
    8: { fontSize: '12pt', tituloSize: '9pt', minHeight: '60mm' },
    12: { fontSize: '11pt', tituloSize: '8pt', minHeight: '60mm' },
    21: { fontSize: '10pt', tituloSize: '7pt', minHeight: '33mm' },
  }
  const cfg = labelMap[porPagina] || labelMap[4]

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Etiquetas Picking — ${etiquetas.length} unidades</title>
<style>
  @page { size: A4; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; }
    .toolbar { display: none !important; }
    .pagina { page-break-after: always; }
    .pagina:last-child { page-break-after: auto; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #fafbfc; }
  .toolbar { position: sticky; top: 0; background: #1f2937; color: white; padding: 14px 20px; display: flex; align-items: center; gap: 14px; z-index: 100; }
  .toolbar h1 { margin: 0; font-size: 16px; font-weight: 600; flex: 1; }
  .toolbar button { background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; }
  .toolbar button.close { background: #6b7280; }
  .pagina {
    width: 210mm;
    min-height: 297mm;
    padding: 8mm;
    margin: 0 auto 8mm;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    display: grid;
    grid-template-columns: repeat(${gridCols}, 1fr);
    grid-template-rows: repeat(${gridRows}, 1fr);
    gap: 4mm;
  }
  .etiqueta {
    border: 2px solid #111;
    border-radius: 6px;
    padding: 4mm;
    display: flex;
    flex-direction: column;
    background: white;
    page-break-inside: avoid;
    min-height: ${cfg.minHeight};
  }
  .etiqueta .sku-top {
    font-family: 'Courier New', monospace;
    font-size: ${cfg.fontSize};
    font-weight: 700;
    color: #000;
    background: #fde047;
    padding: 2mm 4mm;
    border-radius: 3px;
    text-align: center;
    letter-spacing: 0.5px;
    margin-bottom: 3mm;
    border: 1px dashed #92400e;
  }
  .etiqueta .marca { font-size: ${porPagina <= 4 ? '9pt' : '7pt'}; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 2mm; }
  .etiqueta .titulo { font-size: ${cfg.tituloSize}; font-weight: 600; color: #111; line-height: 1.2; margin-bottom: 2mm; overflow: hidden; }
  .etiqueta .footer { margin-top: auto; display: flex; justify-content: space-between; align-items: end; padding-top: 2mm; border-top: 1px dashed #ccc; font-size: ${porPagina <= 4 ? '8pt' : '6pt'}; }
  .etiqueta .footer .pedido { font-family: 'Courier New', monospace; color: #444; }
  .etiqueta .footer .pedido strong { color: #000; }
  .etiqueta .footer .full { background: #3b82f6; color: white; padding: 1mm 3mm; border-radius: 3px; font-size: 7pt; font-weight: 700; display: inline-block; margin-left: 3px; }
  .etiqueta .qtd-badge { background: #111; color: white; padding: 1mm 3mm; border-radius: 3px; font-size: ${porPagina <= 4 ? '10pt' : '7pt'}; font-weight: 700; }
  .layout-21 .etiqueta .footer { display: none; }
</style>
</head>
<body>
<div class="toolbar">
  <h1>🏷️ ${etiquetas.length} etiquetas picking em ${paginas.length} páginas (${porPagina}/página)</h1>
  <div class="info">Pressione <strong>Ctrl+P</strong> ou clique abaixo</div>
  <button onclick="window.print()">🖨️ Imprimir</button>
  <button class="close" onclick="window.close()">✕ Fechar</button>
</div>
${paginas
  .map(
    (pagina) => `
<div class="pagina">
${pagina
  .map(
    (et) => `
  <div class="etiqueta">
    <div class="sku-top">${escapeHtml(et.sku)}</div>
    <div class="marca">${escapeHtml(et.marca || '—')}</div>
    <div class="titulo">${escapeHtml(et.titulo)}</div>
    <div class="footer">
      <div>
        <div class="pedido">Pedido: <strong>${escapeHtml(et.pedido)}</strong></div>
        <div>${et.plataforma === 'mercado_livre' ? '🛒 ML' : et.plataforma === 'shopee' ? '🛍️ Shopee' : escapeHtml(et.plataforma)}${et.envio_full ? '<span class="full">FULL</span>' : ''}</div>
      </div>
      <div class="qtd-badge">x${et.qtd}</div>
    </div>
  </div>
`
  )
  .join('')}
</div>
`
  )
  .join('')}
<script>window.focus();</script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function getTipoEnvio(o: any): 'flex' | 'coleta' {
  const ml = o.ml || {}
  const ship = ml.shipping || {}
  const logisticType = ship.logistic_type || ''
  const tmethod = (ship.tracking_method || '').toUpperCase()
  if (logisticType === 'self_service' || tmethod === 'FLEX') return 'flex'
  // Agência / Coleta / cross_docking / xd_drop_off
  return 'coleta'
}

function splitNumber(s: string): string {
  // Formata como o ML: a cada 5 dígitos adiciona espaço
  // Ex: "2000013843711245" → "20000 13843 711245"
  return String(s || '').replace(/\D/g, '').replace(/(\d{5})(?=\d)/g, '$1 ').trim()
}

function renderFlex(o: any) {
  const ml = o.ml || {}
  const ship = ml.shipping || {}
  const receiver = ship.receiver_address || {}
  const buyer = ml.buyer || {}
  const tracking = ship.tracking_number || ''
  const trackingUrl = ship.tracking_url || 'https://www.mercadolivre.com.br/envios/track?code=' + tracking

  const street = receiver.street_name || ''
  const number = receiver.street_number || ''
  const complement = receiver.complement || ''
  const neighborhood = (receiver.neighborhood && receiver.neighborhood.name) || ''
  const city = (receiver.city && receiver.city.name) || ''
  const state = (receiver.state && receiver.state.name) || ''
  const zip = receiver.zip_code || ''
  const cityUpper = city.toUpperCase()
  const neighborhoodUpper = neighborhood.toUpperCase()
  const apt = receiver.apartment || ''

  const remetente = o.remetente || {}
  const accountId = remetente.account_id || o.conta || 'LIURAESSENCE'
  const nickname = remetente.nickname || 'Liura Essence'
  const items = o.items || []

  const qrData = encodeURIComponent(trackingUrl)
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + qrData

  const envioId = String(ml.shipping_id || '').replace(/\D/g, '')
  const packId = String(ml.pack_id || '').replace(/\D/g, '')

  const destinatario = receiver.receiver_name || buyer.full_name || buyer.nickname || 'Destinatário'
  const docNumber = (buyer.doc_number || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

  return `
<div class="etiqueta-ml flex">
  <div class="ml-header ml-section">
    <div class="ml-logo">${ML_LOGO_SVG}</div>
    <div class="ml-vendedor">
      <div class="ml-vendedor-nome">${nickname} <span class="ml-acc">#${accountId}</span></div>
      <div class="ml-vendedor-end">Rua Itanhaém 431, Vila Prudente</div>
      <div class="ml-vendedor-end">Vila Prudente, São Paulo, São Paulo</div>
      <div class="ml-vendedor-ep">
        <div class="ml-ep-row">
          <span class="ml-ep-label">Envio:</span>
          <span class="ml-ep-num">${splitNumber(envioId)}</span>
        </div>
        <div class="ml-ep-row">
          <span class="ml-ep-label">Pack ID:</span>
          <span class="ml-ep-num">${splitNumber(packId)}</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ml-flex-row ml-section">
    <div class="ml-flex-method">FLEX</div>
    <div class="ml-flex-date">${formatDate(o.created_at || new Date().toISOString())}</div>
  </div>
  <div class="ml-flex-qr-cep ml-section">
    <div class="ml-flex-qr-wrap">
      <img class="ml-flex-qr" src="${qrUrl}" alt="QR Code" onerror="this.style.display='none'"/>
    </div>
    <div class="ml-flex-cep-block">
      <div class="ml-cep-label">CEP:</div>
      <div class="ml-flex-cep-num">${zip}</div>
      <div class="ml-flex-cidade">${cityUpper}</div>
      <div class="ml-flex-bairro"><span class="ml-bairro-label">Bairro:</span> ${neighborhoodUpper}</div>
      ${apt ? '<div class="ml-flex-apto">' + apt + '</div>' : ''}
    </div>
  </div>
  <div class="ml-tipo ml-section">${(receiver.delivery_preference || 'residencial').toUpperCase()}</div>
  <div class="ml-ender ml-section">
    <div><span class="ml-fld">Endereço:</span> ${street}${number ? ', ' + number : ''}${complement ? ' - ' + complement : ''}</div>
    <div><span class="ml-fld">Bairro:</span> ${neighborhood}</div>
    ${complement ? '<div><span class="ml-fld">Complemento:</span> ' + complement + '</div>' : ''}
  </div>
  <div class="ml-destinatario ml-section">
    <div><span class="ml-fld">Destinatário:</span> ${destinatario}${buyer.id ? ' <span class="ml-buyer-id">(' + buyer.id + ')</span>' : ''}</div>
    ${docNumber ? '<div class="ml-doc">(' + docNumber + ')</div>' : ''}
  </div>
  <div class="ml-sku-bottom">
    <div class="ml-sku-dashed"></div>
    <div class="ml-sku-bottom-text">${items
      .map((it: any) => (it.sku || 'SEM-SKU') + (it.quantidade > 1 ? ' ×' + it.quantidade : ''))
      .join(' · ')}</div>
  </div>
</div>
`
}

function renderColeta(o: any) {
  const ml = o.ml || {}
  const ship = ml.shipping || {}
  const receiver = ship.receiver_address || {}
  const buyer = ml.buyer || {}
  const tracking = ship.tracking_number || ''
  const trackingUrl = ship.tracking_url || 'https://www.mercadolivre.com.br/envios/track?code=' + tracking

  const street = receiver.street_name || ''
  const number = receiver.street_number || ''
  const complement = receiver.complement || ''
  const reference = receiver.reference || ''
  const neighborhood = (receiver.neighborhood && receiver.neighborhood.name) || ''
  const city = (receiver.city && receiver.city.name) || ''
  const state = (receiver.state && receiver.state.name) || ''
  const zip = receiver.zip_code || ''
  const deliveryPref = (receiver.delivery_preference || '').toUpperCase()

  const remetente = o.remetente || {}
  const accountId = remetente.account_id || o.conta || 'LIURAESSENCE'
  const nickname = remetente.nickname || 'Liura Essence'

  // Endereço do remetente (vem de marketplace_accounts se não tiver)
  const senderAddr = (remetente && remetente.address) || {}
  const senderStreet = senderAddr.street_name || senderAddr.address || 'Avenida Orlando Bergamo 800 Cumbica - Cond Rec Guarulhos II'
  const senderCity = (senderAddr.city && senderAddr.city.name) || senderAddr.city || 'Guarulhos'
  const senderState = (senderAddr.state && senderAddr.state.name) || senderAddr.state || 'BR-SP'
  const senderZip = senderAddr.zip_code || '07232151'

  const items = o.items || []

  const qrData = encodeURIComponent(trackingUrl)
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + qrData

  const packId = String(ml.pack_id || '')
  const envioId = String(ml.shipping_id || '')

  // ===== BARCODE Code 128 REAL (via bwip-js) =====
  // ML usa Code 128 com o número de rastreio (tracking_number) ou shipping_id
  let barcodeSvg = ''
  try {
    const barcodeText = tracking || envioId || '0000000000'
    barcodeSvg = bwipjs.toSVG({
      bcid: 'code128',
      text: barcodeText,
      scale: 3,
      height: 12,
      includetext: false,
    })
    // Em Vercel (serverless) o bwip às vezes retorna string vazia na primeira chamada.
    // Força retry:
    if (!barcodeSvg || barcodeSvg.length < 50) {
      console.warn('[etiquetas] bwip returned empty, retrying...')
      barcodeSvg = bwipjs.toSVG({
        bcid: 'code128',
        text: barcodeText,
        scale: 3,
        height: 12,
      })
    }
  } catch (e: any) {
    console.error('[etiquetas] bwip error:', e.message)
    barcodeSvg = `<text>${tracking || envioId}</text>`
  }

  // Helper: formata data "segunda 6/jul"
  const created = o.created_at ? new Date(o.created_at) : new Date()
  const diasSemana = ['domingo','segunda','terça','quarta','quinta','sexta','sábado']
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  const diaSemana = diasSemana[created.getUTCDay()]
  const dia = created.getUTCDate()
  const mes = meses[created.getUTCMonth()]
  const despachar = `${diaSemana} ${dia}/${mes}`

  // Pra data de entrega (2 dias úteis depois, simplificado — usar campo se existir)
  const entregaDate = o.entrega_date ? new Date(o.entrega_date) : new Date(created.getTime() + 4 * 24 * 3600 * 1000)
  const diaSemanaE = diasSemana[entregaDate.getUTCDay()]
  const diaE = entregaDate.getUTCDate()
  const mesE = meses[entregaDate.getUTCMonth()]
  const entrega = `${diaSemanaE} ${diaE}/${mesE}`

  // Rota (vinda de shipping.substatus ou hardcoded se não tiver)
  const rota = o.rota || `${remetente.uf || 'XSP10'} > ${city.substring(0, 3).toUpperCase() || 'SSC'} > ${state || ''}`

  // NF (nota fiscal) — pode vir de ml.billing_info ou ficar em branco
  const nf = o.nf || o.billing || ''

  // SSC code (vindo de shipping ou gerado)
  const sscCode = o.ssc_code || 'SSC9'
  const sscNum = o.ssc_num || '24'
  const sscTime = o.ssc_time || '03:00'
  const xspTag = o.xsp_tag || remetente.uf || 'XSP10'

  const destinatario = receiver.receiver_name || buyer.full_name || buyer.nickname || 'Destinatário'
  const docNumber = (buyer.doc_number || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

  // Pack ID formatado com espaços (ex: "20000 13843 711245")
  const packIdFmt = splitNumber(packId)
  // Número embaixo do barcode: prefixo regular + últimos 5 dígitos em bold (ex: "474454 <strong>34547</strong>")
  const barcodeDigits = String(tracking || envioId || '0').replace(/\D/g, '')
  const barcodeNumFmt = barcodeDigits.length > 5
    ? barcodeDigits.slice(0, barcodeDigits.length - 5) + ' <strong>' + barcodeDigits.slice(-5) + '</strong>'
    : '<strong>' + barcodeDigits + '</strong>'

  return `
<div class="etiqueta-ml coleta">
  <!-- ============ HEADER (Pack ID em LINHA SEPARADA) ============ -->
  <div class="ml-header">
    <div class="ml-logo-wrap">${ML_LOGO_SVG}</div>
    <div class="ml-vendor-info">
      <div class="ml-vendor-line1"><strong>${nickname}</strong>#${accountId}</div>
      <div class="ml-vendor-addr">${senderStreet}</div>
      <div class="ml-vendor-city">${senderCity}, ${senderState}, ${senderZip}</div>
      <div class="ml-pack-id-row">Pack ID: <strong>${packIdFmt}</strong></div>
    </div>
  </div>

  <!-- ============ XSP10 + DESPACHAR (cell menor) ============ -->
  <div class="ml-xsp-row">
    <div class="ml-xsp-box">${xspTag || 'XSP10'}</div>
    <div class="ml-despacho-cell">Despachar: <strong>${despachar}</strong></div>
  </div>

  <!-- ============ BARCODE CODE 128 (com margem respiratória) ============ -->
  <div class="ml-barcode-wrap">
    ${barcodeSvg}
  </div>
  <div class="ml-barcode-num">${barcodeNumFmt}</div>

  <!-- ============ LINHA SSC (24 | SSC9 | 03:00) ============ -->
  <div class="ml-ssc-row">
    <div class="ml-ssc-box">${sscNum}</div>
    <div class="ml-ssc-code">${sscCode}</div>
    <div class="ml-ssc-time">${sscTime}</div>
  </div>

  <!-- ============ ROTA (SEM bordas, com NF) ============ -->
  <div class="ml-route-row">
    <div class="ml-route-line">${rota.replace(/>([^<]+)/g, '><strong>$1</strong>')}</div>
    <div class="ml-date-line"><strong>${entrega}</strong>${nf ? '&nbsp;&nbsp;NF: <strong>' + nf + '</strong>' : ''}</div>
  </div>

  <!-- ============ LINHA DE BORDA A BORDA (acima do destinatário) ============ -->
  <div class="ml-dest-divider"></div>

  <!-- ============ DESTINATÁRIO + QR CODE ============ -->
  <div class="ml-dest-row">
    <div class="ml-dest-info">
      <div class="ml-dest-name"><strong>${destinatario}</strong></div>
      ${docNumber ? `<div class="ml-dest-doc">(${docNumber})</div>` : ''}
      <div class="ml-dest-line"><span class="ml-fld">Endereço:</span> ${street}${number ? ', ' + number : ''}</div>
      <div class="ml-dest-line"><span class="ml-fld">CEP:</span> ${zip}</div>
      <div class="ml-dest-line"><span class="ml-fld">Cidade de destino :</span> ${city}, ${state}</div>
      ${complement ? `<div class="ml-dest-line"><span class="ml-fld">Complemento :</span> ${complement}${reference ? ' <span class="ml-fld">Referencia:</span> ' + reference : ''}</div>` : ''}
      ${reference && !complement ? `<div class="ml-dest-line"><span class="ml-fld">Referencia:</span> ${reference}</div>` : ''}
      ${deliveryPref ? `<div class="ml-dest-tipo">${deliveryPref}</div>` : ''}
    </div>
    <div class="ml-qr-wrap">
      <img src="${qrUrl}" alt="QR" onerror="this.style.display='none'"/>
      <div class="ml-r-box">R</div>
    </div>
  </div>

  <!-- ============ RODAPÉ: LINHA PONTILHADA + SKU DO PEDIDO ============ -->
  <div class="ml-sku-footer">
    <div class="ml-dashed-line"></div>
    <div class="ml-sku-line">${items.map((it: any) => it.sku || 'SEM-SKU').join(' · ')}</div>
  </div>
</div>
`
}

function renderEtiqueta(o: any) {
  const tipo = getTipoEnvio(o)
  if (tipo === 'flex') return renderFlex(o)
  return renderColeta(o)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get('ids') || ''
    const porPagina = parseInt(searchParams.get('por_pagina') || '1', 10)
    const formato = searchParams.get('formato') || 'ml' // 'ml' (etiqueta envio) ou 'picking' (SKU no topo)

    if (!idsParam) {
      return new NextResponse('<h1>Nenhum pedido selecionado</h1>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const ids = idsParam.split(',').filter(Boolean)
    if (ids.length === 0) {
      return new NextResponse('<h1>IDs inválidos</h1>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Limite razoável pra timeout
    const limitedIds = ids.slice(0, 80)

    // ========== PICKING: rápido, sem buscar do ML ==========
    if (formato === 'picking') {
      return gerarPicking(limitedIds, porPagina)
    }

    // ========== ML: precisa buscar do ML ==========
    const orders = await prisma.orders.findMany({
      where: { id: { in: limitedIds } },
      select: {
        id: true,
        order_number: true,
        total: true,
        origem: true,
        created_at: true,
        marketplace_accounts: {
          select: { nickname: true, account_id: true },
        },
        order_items: {
          select: { id: true, sku: true, nome_produto: true, quantidade: true },
        },
      },
    })

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return new NextResponse('<h1>Token ML indisponível</h1>', {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
    const token = tokenResult.token

    // Enriquece com dados do ML
    const enriched = await carregarDados(orders, token)

    // Enriquecido com remetente
    const enrichedComRemetente = enriched.map((o) => ({
      ...o,
      conta: o.marketplace_accounts?.nickname,
      remetente: o.marketplace_accounts
        ? { nickname: o.marketplace_accounts.nickname, account_id: o.marketplace_accounts.account_id }
        : null,
      items: o.order_items || [],
      ml_pack_id: o.ml?.pack_id,
    }))

    // Agrupa em páginas
    const paginas: any[] = []
    for (let i = 0; i < enrichedComRemetente.length; i += porPagina) {
      paginas.push(enrichedComRemetente.slice(i, i + porPagina))
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Etiquetas ML — ${enrichedComRemetente.length} pedidos</title>
<style>
  /* Impressão: etiqueta individual sai em página 100x150mm (10x15cm padrão ML) */
  @page { size: 100mm 150mm; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; background: white; }
    .toolbar { display: none !important; }
    .pagina { width: 100mm; height: 150mm; padding: 0; margin: 0; box-shadow: none; page-break-after: always; box-sizing: border-box; }
    .pagina:last-child { page-break-after: auto; }
    .etiqueta-ml { width: 100mm; height: 150mm; box-sizing: border-box; }
    /* Preserva cores dos boxes pretos (XSP, 24, R) */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    /* Força renderização correta dos SVGs */
    svg { shape-rendering: crispEdges; }
  }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; background: #fafbfc; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; background: #1f2937; color: white; padding: 14px 20px; display: flex; align-items: center; gap: 14px; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .toolbar h1 { margin: 0; font-size: 16px; font-weight: 600; flex: 1; }
  .toolbar button { background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; }
  .toolbar button:hover { background: #059669; }
  .toolbar button.close { background: #6b7280; }
  .toolbar .info { font-size: 13px; opacity: 0.9; }
  .pagina {
    width: 100mm;
    height: 150mm;
    padding: 0;
    margin: 0 auto 8mm auto;
    background: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }
  .etiqueta-ml {
    width: 100mm;
    height: 150mm;
    background: white;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    font-size: 9pt;
    line-height: 1.3;
    /* Borda externa grossa em volta de toda a etiqueta (igual ML) */
    border: 2px solid #000;
    box-sizing: border-box;
  }
  .etiqueta-ml.flex { height: 150mm; }
  .etiqueta-ml.coleta { height: 150mm; padding: 3mm; box-sizing: border-box; }

  /* LINHA GROSSA separando seções (igual etiqueta ML oficial) */
  .ml-divider-thick {
    border-bottom: 2px solid #000;
    margin: 1mm 0;
  }

  /* ===== HEADER COM LOGO ML (igual etiqueta ML real) ===== */
  .ml-header {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
    padding: 2mm 2mm 1mm 2mm;
    border-bottom: 2px solid #000;
  }
  .ml-logo svg {
    display: block;
    width: 14mm;
    height: 14mm;
  }
  .ml-vendedor { flex: 1; line-height: 1.25; }
  .ml-vendedor-nome { font-size: 11pt; font-weight: 700; }
  .ml-vendedor-nome .ml-acc { font-weight: 400; color: #333; font-size: 9pt; }
  .ml-vendedor-end { font-size: 8.5pt; color: #111; }
  .ml-vendedor-pack { font-size: 10pt; margin-top: 2mm; }
  .ml-pack-num { font-weight: 700; }

  /* ===== FLEX: Envio + Pack ID em 2 linhas (como no ML) ===== */
  .ml-envio-pack { font-size: 10pt; line-height: 1.1; padding: 1mm 0; }
  .ml-ep-row { display: block; line-height: 1.15; }
  .ml-vendedor-ep { margin-top: 1.5mm; font-size: 10pt; line-height: 1.15; }
  .ml-vendedor-ep .ml-ep-row { display: block; }
  .ml-vendedor-ep .ml-ep-label { font-weight: 400; }
  .ml-vendedor-ep .ml-ep-num { font-weight: 700; }
  .ml-ep-row { display: block; }
  .ml-ep-label { font-weight: 400; }
  .ml-ep-num { font-weight: 700; letter-spacing: 0.5px; }

  /* ===== FLEX: Linha FLEX | DATA com divisória ===== */
  /* FLEX | 20 JUN: 2 colunas limpas, sem divisória (igual ML) */
  .ml-flex-row {
    display: flex;
    align-items: center;
    height: 10mm;
    margin: 1mm 0;
  }
  .ml-flex-method {
    flex: 1;
    text-align: center;
    font-size: 18pt;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .ml-flex-date {
    flex: 1;
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 1px;
  }

  /* ===== FLEX: QR Code EM CIMA + CEP embaixo (mesmo bloco) ===== */
  .ml-flex-qr-cep { padding: 2mm 0; text-align: center; }
  .ml-flex-qr-wrap { display: flex; justify-content: center; margin-bottom: 2mm; }
  .ml-flex-qr { width: 42mm; height: 42mm; display: block; }
  .ml-flex-cep-block { text-align: center; }

  /* ===== FLEX: CEP em destaque + cidade/bairro ===== */
  .ml-flex-cep { text-align: center; padding: 2mm 0 1mm 0; }
  .ml-cep-label { font-size: 10pt; color: #666; text-align: right; padding-right: 2mm; }
  .ml-flex-cep-num { font-size: 28pt; font-weight: 800; letter-spacing: 1px; margin: 1mm 0 3mm 0; }
  .ml-flex-cidade { font-size: 13pt; font-weight: 800; text-transform: uppercase; }
  .ml-flex-bairro { font-size: 11pt; font-weight: 700; text-transform: uppercase; margin-top: 1mm; }
  .ml-bairro-label { font-weight: 400; text-transform: none; font-size: 10pt; }
  .ml-flex-apto { font-size: 10pt; color: #555; margin-top: 1mm; }

  /* ===== FLEX: RESIDENCIAL com borda ===== */
  .ml-tipo {
    text-align: center;
    font-size: 12pt;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 1.5mm 0;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    margin: 2mm 0;
  }

  /* ===== Endereço completo ===== */
  .ml-ender { font-size: 8.5pt; line-height: 1.5; padding: 1mm 0; }
  .ml-ender .ml-fld { display: inline-block; min-width: 22mm; font-weight: 700; }
  .ml-destinatario { font-size: 8.5pt; line-height: 1.5; padding: 1mm 0; }
  .ml-destinatario .ml-fld { display: inline-block; min-width: 22mm; font-weight: 700; }
  .ml-doc { font-size: 8pt; color: #555; margin-top: 1mm; }

  /* ===== COLETA / AGÊNCIA — Layout EXATO da etiqueta oficial ML ===== */

  /* Header: Pack ID em LINHA SEPARADA (igual etiqueta ML oficial) */
  .etiqueta-ml.coleta .ml-header {
    display: flex;
    align-items: flex-start;
    gap: 2mm;
    padding: 1mm 0 0.5mm 0;
    font-family: Arial, 'Helvetica Neue', sans-serif;
  }
  .ml-logo-wrap {
    flex-shrink: 0;
    width: 13mm;
    height: 13mm;
    margin-top: 1mm;
  }
  .ml-logo-wrap svg, .ml-logo-wrap img {
    width: 13mm;
    height: 13mm;
    display: block;
  }
  .ml-vendor-info { flex: 1; line-height: 1.15; }
  .ml-vendor-line1 {
    font-size: 10pt;
    font-weight: 800;
    margin-bottom: 0.5mm;
    letter-spacing: 0;
  }
  .ml-vendor-line1 strong { font-weight: 800; }
  .ml-vendor-addr { font-size: 7.5pt; color: #000; line-height: 1.15; font-weight: 400; }
  .ml-vendor-city { font-size: 7.5pt; color: #000; line-height: 1.15; font-weight: 400; }
  .ml-pack-id-row {
    font-size: 9pt;
    margin-top: 0.5mm;
    color: #000;
    font-weight: 400;
  }
  .ml-pack-id-row strong { font-weight: 800; letter-spacing: 0.3px; }

  /* XSP10 BOX + DESPACHAR CELL (gap entre eles, Despachar mais à direita) */
  .ml-xsp-row {
    display: flex;
    align-items: stretch;
    margin: 1mm 0 0 0;
    gap: 4mm;
    font-family: Arial, sans-serif;
  }
  .ml-xsp-box {
    background: #000;
    color: #fff;
    font-size: 18pt;
    font-weight: 900;
    padding: 1mm 3mm;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18mm;
    letter-spacing: 0.5px;
    font-family: 'Arial Black', Arial, sans-serif;
    text-rendering: geometricPrecision;
  }
  .ml-despacho-cell {
    flex: 0 0 auto;
    margin-left: auto;
    border: 1px solid #000;
    padding: 0.5mm 4mm;
    font-size: 9pt;
    font-weight: 400;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    font-family: Arial, sans-serif;
  }
  .ml-despacho-cell strong { font-weight: 700; }

  /* BARCODE CODE 128 — com margem respiratória (DESCE mais) */
  .ml-barcode-wrap {
    text-align: center;
    padding: 5mm 0 1mm 0;
    display: flex;
    justify-content: center;
  }
  .ml-barcode-wrap svg {
    width: 80mm;
    height: 20mm;
    display: block;
  }
  .ml-barcode-num {
    text-align: center;
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 13pt;
    font-weight: 400;
    margin: 0;
    padding: 0.5mm 0 2mm 0;
    letter-spacing: 3px;
  }
  .ml-barcode-num strong { font-weight: 800; letter-spacing: 0; }

  /* LINHA SSC: 24 (box preto) | SSC9 (texto gigante) | 03:00 (hora) */
  .ml-ssc-row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0 4mm;
    margin: 0;
    font-family: Arial, sans-serif;
  }
  .ml-ssc-box {
    background: #000;
    color: #fff;
    font-size: 24pt;
    font-weight: 900;
    padding: 1mm 4mm;
    line-height: 1;
    min-width: 12mm;
    text-align: center;
    font-family: 'Arial Black', Arial, sans-serif;
  }
  .ml-ssc-code {
    font-size: 32pt;
    font-weight: 900;
    letter-spacing: 1.5px;
    line-height: 1;
    font-family: 'Arial Black', Arial, sans-serif;
  }
  .ml-ssc-time {
    font-size: 18pt;
    font-weight: 700;
    line-height: 1;
    min-width: 16mm;
    text-align: right;
    font-family: Arial, sans-serif;
  }

  /* ROTA: SEM bordas, centralizado, com NF */
  .ml-route-row {
    text-align: center;
    font-size: 10pt;
    line-height: 1.4;
    margin: 1.5mm 0 0 0;
    padding: 0;
    font-family: Arial, sans-serif;
  }
  .ml-route-line { font-size: 10pt; font-weight: 400; letter-spacing: 0.3px; }
  .ml-route-line strong { font-weight: 800; }
  .ml-date-line { font-size: 10pt; margin-top: 0.5mm; font-weight: 800; letter-spacing: 0.3px; }
  .ml-date-line strong { font-weight: 800; }

  /* LINHA DE BORDA A BORDA (acima do destinatário, full width) */
  .ml-dest-divider {
    border-top: 1px solid #000;
    margin: 5mm -3mm 0 -3mm;
  }

  /* DESTINATÁRIO + QR Code — lado a lado */
  .ml-dest-row {
    display: flex;
    gap: 3mm;
    margin: 0 0 1mm 0;
    padding-top: 2mm;
    align-items: flex-start;
    font-family: Arial, sans-serif;
  }
  .ml-dest-info {
    flex: 1;
    font-size: 9pt;
    line-height: 1.4;
    font-weight: 400;
  }
  .ml-dest-name {
    font-size: 11pt;
    font-weight: 900;
    line-height: 1.15;
    margin-bottom: 0.5mm;
    letter-spacing: 0;
    font-family: Arial, sans-serif;
  }
  .ml-dest-doc { font-size: 8.5pt; color: #333; margin-bottom: 1mm; font-weight: 400; }
  .ml-dest-line { line-height: 1.35; font-weight: 400; }
  .ml-fld { font-weight: 700; }
  .ml-dest-tipo {
    font-size: 10pt;
    font-weight: 800;
    margin-top: 0.8mm;
    letter-spacing: 0.5px;
    font-family: Arial, sans-serif;
  }

  /* RODAPÉ: linha pontilhada + SKU do pedido */
  .ml-sku-footer {
    margin-top: 2mm;
  }
  .ml-dashed-line {
    border-top: 1.5px dashed #000;
    margin-bottom: 1.2mm;
  }
  .ml-sku-line {
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 8pt;
    color: #000;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.4px;
  }

  /* QR Code (à direita, embaixo dele o box "R" preto) */
  .ml-qr-wrap {
    width: 33mm;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ml-qr-wrap img {
    width: 33mm;
    height: 33mm;
    display: block;
  }
  .ml-r-box {
    margin-top: 0.5mm;
    background: #000;
    color: #fff;
    padding: 1mm 5mm;
    font-weight: 900;
    font-size: 11pt;
    line-height: 1;
    font-family: 'Arial Black', Arial, sans-serif;
  }

  /* ===== ID do buyer ML (aparece entre parênteses após o nome) ===== */
  .ml-buyer-id {
    color: #666;
    font-size: 8pt;
    font-weight: 400;
  }

  /* ===== SKU no rodapé com linha pontilhada ===== */
  .ml-sku-bottom {
    margin-top: auto;
    padding-top: 2mm;
  }
  .ml-sku-dashed {
    border-top: 1px dashed #000;
    margin-bottom: 1.5mm;
  }
  .ml-sku-bottom-text {
    font-family: 'Courier New', monospace;
    font-size: 9pt;
    color: #111;
    font-weight: 600;
    text-align: center;
  }
</style>
</head>
<body>
<div class="toolbar">
  <h1>📦 ${enrichedComRemetente.length} etiquetas ML em ${paginas.length} páginas</h1>
  <div class="info">Pressione <strong>Ctrl+P</strong> ou clique abaixo</div>
  <button onclick="window.print()">🖨️ Imprimir</button>
  <button class="close" onclick="window.close()">✕ Fechar</button>
</div>

${paginas
  .map(
    (pagina) => `
<div class="pagina">
${pagina.map(renderEtiqueta).join('')}
</div>
`
  )
  .join('')}

<script>
window.focus();
</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    return new NextResponse(
      `<h1>Erro ao gerar etiquetas</h1><pre>${err.message}\n${err.stack}</pre>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    )
  }
}
