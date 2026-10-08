// lib/pdf-extract.ts
// Extrai códigos de rastreio e produtos de notas/orçamentos de PDF/XML

import { readFile } from 'fs/promises'
import path from 'path'

// Regexes de limpeza
const LIMPAR = /[^\x20-\x7E\xA0-\xFF\u00C0-\xFF]/
const BRancos = /\s+/g

// Padrões de códigos de rastreio brasileiros
const PADROES_CODIGOS = [
  // Correios padrão
  /[A-Z]{2}\d{9}[A-Z]{2}/gi,
  // Correios com ponto
  /[A-Z]{2}\.\d{9}\.[A-Z]{2}/g,
  // JD log
  /\bJD\d{12,}\b/g,
  // Código de rastreio genérico (letras + números, 10-30 chars)
  /\b([A-Z]{2,3}[\dCWYLKFGUPHJ]{8,20})\b/g,
  // Códigos numéricos longos (order numbers)
  /\b(\d{12,20})\b/g,
]

// Padrões específicos por transportadora
const TRANSPORTADORAS = {
  correios: /[A-Z]{2}\d{9}[A-Z]{2}/gi,
  jd: /JD\d{12,}/gi,
  rakuten: /RKT\d+/gi,
  magazine: /MGZ\d+/gi,
  shopee: /SHP\d{10,}/gi,
  mercadolivre: /MLU?\d{8,}/gi,
}

export async function extractTrackingCodes(
  filePath: string,
  tipo: 'pdf' | 'xml'
): Promise<string[]> {
  try {
    const conteudo = await readFile(filePath, tipo === 'xml' ? 'utf-8' : 'latin1')
    return extrairCodigos(conteudo)
  } catch {
    // Fallback: tentar como texto
    try {
      const buffer = await readFile(filePath)
      const text = buffer.toString('utf-8')
      return extrairCodigos(text)
    } catch {
      return []
    }
  }
}

function extrairCodigos(texto: string): string[] {
  const encontrados = new Set<string>()

  // Normalizar texto
  const normalizado = texto
    .replace(/\s+/g, ' ')
    .replace(/[.,;]/g, ' ')
    .toUpperCase()

  // Aplicar todos os padrões
  for (const padrao of PADROES_CODIGOS) {
    const matches = normalizado.match(padrao)
    if (matches) {
      for (const match of matches) {
        const clean = match.toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (clean.length >= 8 && clean.length <= 30) {
          encontrados.add(clean)
        }
      }
    }
  }

  // Padrões por transportadora
  for (const [, padrao] of Object.entries(TRANSPORTADORAS)) {
    const matches = texto.match(padrao)
    if (matches) {
      for (const m of matches) {
        const clean = m.toUpperCase()
        if (clean.length >= 6) {
          encontrados.add(clean)
        }
      }
    }
  }

  // Tentar extrair SKUs do texto (formato: XY12345, SKU-123, etc)
  const skuMatches = texto.match(/\b([A-Z]{2,4}[\-]?\d{4,8})\b/gi)
  if (skuMatches) {
    for (const m of skuMatches) {
      const clean = m.toUpperCase()
      if (clean.length >= 4 && clean.length <= 15) {
        encontrados.add(clean)
      }
    }
  }

  // Filtrar códigos muito curtos ou genéricos demais
  const validos = Array.from(encontrados).filter(codigo => {
    // Descartar se parece ser só número
    if (/^\d{10,}$/.test(codigo)) return true // numericos longos (order IDs)
    // Descartar se muito curto
    if (codigo.length < 8) return false
    // Descartar se parece ser data
    if (/^\d{8,}$/.test(codigo)) return true
    return true
  })

  return validos
}

// Para XML (NF-e): extrair SKUs dos produtos
export async function extractFromXML(filePath: string): Promise<{ codigo: string; descricao: string; quantidade: number }[]> {
  try {
    const conteudo = await readFile(filePath, 'utf-8')
    const resultados: { codigo: string; descricao: string; quantidade: number }[] = []

    // Tentar extrair infProd (produtos da NF-e)
    const prodMatches = conteudo.match(/<infProd[^>]*>([\s\S]*?)<\/infProd>/gi)
    if (prodMatches) {
      for (const block of prodMatches) {
        const cProd = block.match(/<cProd>([^<]+)<\/cProd>/)?.[1]?.trim()
        const xProd = block.match(/<xProd>([^<]+)<\/xProd>/)?.[1]?.trim()
        const qCom = block.match(/<qCom>([^<]+)<\/qCom>/)?.[1]?.trim()

        if (cProd) {
          resultados.push({
            codigo: cProd.replace(/[^A-Z0-9\-]/gi, '').toUpperCase(),
            descricao: xProd || '',
            quantidade: parseFloat(qCom || '1') || 1,
          })
        }
      }
    }

    return resultados
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZAYNEX Orçamento parser
// Formato: QTD | MARCA | PRODUTO | VOL. | UNITÁRIO | DESC. | TOTAL
// ─────────────────────────────────────────────────────────────────────────────
export interface ItemNota {
  quantidade: number
  marca: string
  produto: string
  volume: string
  preco_unitario: number
  total: number
  fornecedor?: string
  numero_nota?: string
  data?: string
}

function limparTexto(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[|]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePreco(valor: string): number {
  // Formato: R$ 1.234,56 ou 1.234,56 ou R$1.234,56
  const match = valor.match(/[\d.,]+/)
  if (!match) return 0
  const cleaned = match[0].replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function extractZaynexOrcamento(texto: string): ItemNota[] {
  const itens: ItemNota[] = []
  const linhas = texto.split(/\n/)

  // Captura cabeçalho
  let numero = ''
  let data = ''
  let cliente = ''
  let fornecedor = ''

  const numMatch = texto.match(/OR[CÇ]AMENTO\s*N[º°]?\s*(\S+)/i)
  if (numMatch) numero = numMatch[1]

  const dataMatch = texto.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (dataMatch) data = dataMatch[1]

  const clienteMatch = texto.match(/CLIENTE\s+ORÇAMENTO\s+([^\n]+)/i)
  if (clienteMatch) cliente = clienteMatch[1].trim()

  const vendMatch = texto.match(/VENDEDOR\s+(\S+)/i)
  if (vendMatch) fornecedor = vendMatch[1]

  // Padrão para linha de item:
  // 7   TREE HUT   LOTUS WATER 510GRM   510ML   R$ 79,00   —   R$ 553,00
  // 120   LATTAFA   HAYAATI TRADICIONAL (PRETO) EDP 100ML   100ML   R$ 89,00   —   R$ 10.680,00
  const linhaRegex = /^\s*(\d+)\s+([A-Z][A-Z0-9\s&.\-'\(\)ÁÉÍÓÚÂÊÔÀÈÌÒÙÃÕÑÜÇ]+?)\s+([\w\s&.\-'\(\)ÁÉÍÓÚÂÊÔÀÈÌÒÙÃÕÑÜÇ]+?)\s+(\d+)\s*([A-Z]{2,4})\s+([\d.,]+)\s+[^\d]*\s*([\d.,]+)\s*$/

  for (const linha of linhas) {
    // Tenta extrair quantidade no início
    const qtdMatch = linha.match(/^\s*(\d+)\s+/)
    if (!qtdMatch) continue
    const quantidade = parseInt(qtdMatch[1], 10)
    if (quantidade <= 0 || quantidade > 10000) continue

    // Tenta encontrar dois preços no formato R$ X.XXX,XX
    const precos = [...linha.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m => {
      const v = m[1].replace(/\./g, '').replace(',', '.')
      return parseFloat(v)
    })

    if (precos.length < 2) continue
    const preco_unitario = precos[0]
    const total = precos[1]

    if (preco_unitario <= 0 || total <= 0) continue

    // Extrai a parte após a quantidade
    const parte = linha.substring(qtdMatch[0].length).trim()

    // Separa por marca (primeira palavra em maiúsculas seguida de texto)
    // Encontra o padrão: MARCA + PRODUTO + volume + preços
    // A marca é a primeira palavra(s) em caps até encontrar descrição de volume

    // Tenta encontrar o volume (ex: "510ML", "100ML", "310G")
    const volMatch = parte.match(/(\d+)\s*([A-Z]{2,4})\b/)
    if (!volMatch) continue

    const volNum = volMatch[1]
    const volUnidade = volMatch[2]
    const volume = `${volNum}${volUnidade}`

    // Marca é tudo antes da descrição do produto
    // O produto vem antes do volume
    const beforeVol = parte.substring(0, parte.indexOf(volMatch[0])).trim()
    // Separa marca e produto: marca = primeira palavra(s) em caps
    // Encontra onde o produto começa (primeira letra minúscula)
    const marcaProdutoMatch = beforeVol.match(/^([A-Z][A-Z0-9\s&'.\-ÁÉÍÓÚÂÊÔÀÈÌÒÙÃÕÑÜÇ]+?)\s+([A-Z][A-Za-z0-9\s&'.\-ÁÉÍÓÚÂÊÔÀÈÌÒÙÃÕÑÜÇ]+)$/)
    if (!marcaProdutoMatch) {
      // fallback: assume que tudo antes do último conjunto em caps é marca
      const parts = beforeVol.trim().split(/\s+/)
      if (parts.length < 2) continue
      const marca = parts.slice(0, Math.max(1, parts.length - 1)).join(' ')
      const produto = parts.slice(Math.max(1, parts.length - 1)).join(' ')
      itens.push({ quantidade, marca: marca.trim(), produto: produto.trim(), volume, preco_unitario, total, fornecedor, numero_nota: numero, data })
      continue
    }

    itens.push({
      quantidade,
      marca: marcaProdutoMatch[1].trim(),
      produto: marcaProdutoMatch[2].trim(),
      volume,
      preco_unitario,
      total,
      fornecedor,
      numero_nota: numero,
      data,
    })
  }

  return itens
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Orçamento parser (fallback para outros formatos)
// ─────────────────────────────────────────────────────────────────────────────
export function extractGenericOrcamento(texto: string): ItemNota[] {
  const itens: ItemNota[] = []
  const linhas = texto.split(/\n/)

  // Captura cabeçalho
  let numero = ''
  let data = ''

  const numMatch = texto.match(/OR[CÇ]AMENTO\s*N[º°]?\s*(\S+)/i)
  if (numMatch) numero = numMatch[1]
  const dataMatch = texto.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (dataMatch) data = dataMatch[1]

  // Padrão genérico: quantidade + texto + preço
  const genericRegex = /^\s*(\d+)\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s*$/gi
  for (const linha of linhas) {
    const match = linha.match(genericRegex)
    if (match) {
      const quantidade = parseInt(match[1], 10)
      const preco = parsePreco(match[3])
      if (quantidade > 0 && preco > 0) {
        const produto = match[2].trim()
        // Tenta separar marca do produto (primeira palavra em caps)
        const marcaMatch = produto.match(/^([A-Z][A-Z0-9\s&'.\-ÁÉÍÓÚÂÊÔÀÈÌÒÙÃÕÑÜÇ]+?)\s+(.+)$/)
        itens.push({
          quantidade,
          marca: marcaMatch ? marcaMatch[1].trim() : 'OUTROS',
          produto: marcaMatch ? marcaMatch[2].trim() : produto,
          volume: '',
          preco_unitario: preco,
          total: quantidade * preco,
          numero_nota: numero,
          data,
        })
      }
    }
  }

  return itens
}
