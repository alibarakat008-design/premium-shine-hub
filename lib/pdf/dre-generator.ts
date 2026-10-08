/**
 * =====================================================
 * GERADOR DE PDF DO DRE
 * Premium Shine Hub
 * =====================================================
 * Usa Puppeteer pra renderizar HTML do DRE e gerar PDF
 * Stack: Puppeteer + React Email (template)
 * =====================================================
 */

// lib/pdf/dre-generator.ts

import puppeteer from 'puppeteer'

export async function generateDREPDF(dre: DREData): Promise<Buffer> {
  // 1) Gerar HTML do DRE
  const html = generateDREHTML(dre)

  // 2) Renderizar com Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 0 15mm;">
          Premium Shine Hub — DRE ${dre.periodo}
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 9px; color: #999; width: 100%; text-align: center; padding: 0 15mm;">
          Página <span class="pageNumber"></span> de <span class="totalPages"></span> · Gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
      `,
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

function generateDREHTML(dre: DREData): string {
  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const formatPercent = (v: number) => `${v.toFixed(1)}%`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      color: #1a1a3e;
      padding: 20px;
      line-height: 1.5;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #a78bfa;
    }
    .header h1 { color: #a78bfa; font-size: 28px; margin-bottom: 5px; }
    .header .subtitle { color: #666; font-size: 14px; }
    .header .periodo { color: #f472b6; font-size: 20px; font-weight: bold; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f5f5f5; color: #666; font-weight: 600; font-size: 12px; text-transform: uppercase; }
    td { font-size: 13px; }
    .number { text-align: right; font-family: monospace; }
    .section-title { background: #a78bfa; color: white; padding: 8px 12px; font-weight: bold; margin-top: 20px; font-size: 14px; }
    .subtotal { background: #f5f5f5; font-weight: bold; }
    .total { background: #a78bfa; color: white; font-weight: bold; font-size: 15px; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .lucro-final { background: #22c55e; color: white; padding: 15px; text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; border-radius: 8px; }
    .lucro-negativo { background: #ef4444; }
    .indicadores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 20px; }
    .indicador { background: #f5f5f5; padding: 12px; border-radius: 8px; text-align: center; }
    .indicador .label { color: #666; font-size: 11px; text-transform: uppercase; }
    .indicador .value { color: #a78bfa; font-size: 18px; font-weight: bold; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Premium Shine Hub</h1>
    <div class="subtitle">Demonstrativo do Resultado do Exercício (DRE)</div>
    <div class="periodo">${dre.periodo}</div>
  </div>

  <div class="section-title">📈 RECEITA</div>
  <table>
    <tr>
      <td>Receita Bruta de Vendas</td>
      <td class="number">${formatCurrency(dre.receita_bruta)}</td>
    </tr>
    <tr>
      <td>(-) Devoluções e Cancelamentos</td>
      <td class="number negative">${formatCurrency(0)}</td>
    </tr>
    <tr>
      <td>(-) Descontos Concedidos</td>
      <td class="number negative">${formatCurrency(0)}</td>
    </tr>
    <tr class="subtotal">
      <td>= RECEITA LÍQUIDA</td>
      <td class="number">${formatCurrency(dre.receita_liquida)}</td>
    </tr>
  </table>

  <div class="section-title">💰 CUSTOS</div>
  <table>
    <tr>
      <td>(-) CMV (Custo da Mercadoria Vendida)</td>
      <td class="number negative">${formatCurrency(dre.cmv)}</td>
    </tr>
    <tr class="subtotal">
      <td>= LUCRO BRUTO</td>
      <td class="number positive">${formatCurrency(dre.lucro_bruto)}</td>
    </tr>
    <tr>
      <td>Margem Bruta</td>
      <td class="number">${formatPercent(dre.margem_bruta_pct)}</td>
    </tr>
  </table>

  <div class="section-title">📉 DESPESAS OPERACIONAIS</div>
  <table>
    <tr>
      <td>(-) Taxas de Marketplace (ML, Shopee)</td>
      <td class="number negative">${formatCurrency(dre.taxas_marketplace)}</td>
    </tr>
    <tr>
      <td>(-) Impostos sobre Vendas</td>
      <td class="number negative">${formatCurrency(dre.impostos)}</td>
    </tr>
    <tr>
      <td>(-) Comissões (Sellers, Vendedoras, Afiliados)</td>
      <td class="number negative">${formatCurrency(dre.comissoes)}</td>
    </tr>
    <tr>
      <td>(-) Fretes</td>
      <td class="number negative">${formatCurrency(dre.fretes)}</td>
    </tr>
    <tr>
      <td>(-) Embalagens Premium</td>
      <td class="number negative">${formatCurrency(dre.embalagens)}</td>
    </tr>
    <tr>
      <td>(-) Outras Despesas</td>
      <td class="number negative">${formatCurrency(dre.outras_despesas)}</td>
    </tr>
  </table>

  <div class="${dre.lucro_operacional >= 0 ? 'lucro-final' : 'lucro-final lucro-negativo'}">
    LUCRO LÍQUIDO: ${formatCurrency(dre.lucro_operacional)}
    <div style="font-size: 14px; margin-top: 5px; opacity: 0.9;">
      Margem Líquida: ${formatPercent(dre.margem_liquida_pct)}
    </div>
  </div>

  <div class="indicadores">
    <div class="indicador">
      <div class="label">Pedidos</div>
      <div class="value">${dre.total_pedidos}</div>
    </div>
    <div class="indicador">
      <div class="label">Unidades</div>
      <div class="value">${dre.total_unidades}</div>
    </div>
    <div class="indicador">
      <div class="label">Ticket Médio</div>
      <div class="value">${formatCurrency(dre.ticket_medio)}</div>
    </div>
    <div class="indicador">
      <div class="label">U/Pedido</div>
      <div class="value">${(dre.total_unidades / dre.total_pedidos || 0).toFixed(1)}</div>
    </div>
  </div>

  <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; color: #999; font-size: 10px; text-align: center;">
    Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR')}
    <br>
    Premium Shine Hub — Sistema Omnichannel
  </div>
</body>
</html>
  `
}

// lib/pdf/dre-types.ts
export interface DREData {
  periodo: string
  receita_bruta: number
  receita_liquida: number
  cmv: number
  lucro_bruto: number
  taxas_marketplace: number
  comissoes: number
  fretes: number
  embalagens: number
  impostos: number
  outras_despesas: number
  lucro_operacional: number
  margem_bruta_pct: number
  margem_liquida_pct: number
  total_pedidos: number
  total_unidades: number
  ticket_medio: number
}

// =====================================================
// lib/google-drive.ts — Upload via Service Account
// =====================================================
/*
import { google } from 'googleapis'
import { Readable } from 'stream'

export async function uploadToGoogleDrive({
  fileName,
  mimeType,
  buffer,
  folderId,
}: {
  fileName: string
  mimeType: string
  buffer: Buffer
  folderId?: string
}): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })

  const drive = google.drive({ version: 'v3', auth })

  const fileMetadata = {
    name: fileName,
    parents: folderId ? [folderId] : undefined,
  }

  const media = {
    mimeType,
    body: Readable.from(buffer),
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink, webContentLink',
  })

  return response.data.webViewLink || ''
}
*/
