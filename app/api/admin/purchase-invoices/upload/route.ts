import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/purchase-invoices/upload?company_id=X
 *
 * Upload de PDF ou XML de NF.
 * Salva em /tmp (Vercel serverless) e retorna { ok, url, filename, size }.
 * NO VERCEL: /tmp é o único diretório gravável. Arquivos são temporários.
 * NO LOCAL: Salva em /tmp também (compatível com Vercel).
 *
 * Uso: input type="file" no modal de Nova Nota, envia FormData
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'Arquivo não enviado' }, { status: 400 })

    // Valida extensão
    const validExts = ['.pdf', '.xml', '.png', '.jpg', '.jpeg']
    const ext = path.extname(file.name).toLowerCase()
    if (!validExts.includes(ext)) {
      return NextResponse.json({ ok: false, error: `Extensão inválida: ${ext}. Aceita: ${validExts.join(', ')}` }, { status: 400 })
    }

    // Valida tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'Arquivo > 10MB' }, { status: 400 })
    }

    // Salvar em /tmp (gravável no Vercel serverless)
    const uploadDir = path.join('/tmp', 'uploads', 'nf', companyId)
    await mkdir(uploadDir, { recursive: true })

    // Nome único: timestamp + random
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${ts}_${rand}_${safeName}`
    const filepath = path.join(uploadDir, filename)

    // Salva arquivo
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filepath, buffer)

    // URL de acesso (temporária em /tmp - Vercel não persiste)
    // Em produção real, seria Supabase Storage ou S3
    const url = `/tmp/uploads/nf/${companyId}/${filename}`

    // Se for XML, tenta extrair chave de acesso e número da NF (parser simples)
    let parsed: any = {}
    if (ext === '.xml') {
      const xml = buffer.toString('utf-8')
      // Procura tag <chNFe> (chave de acesso)
      const chMatch = xml.match(/<chNFe>([^<]+)<\/chNFe>/i) || xml.match(/Id="NFe(\d+)"/i)
      if (chMatch) parsed.chave_acesso_nf = chMatch[1].replace('NFe', '')
      // Procura número da NF
      const numMatch = xml.match(/<nNF>(\d+)<\/nNF>/i)
      if (numMatch) parsed.numero_nota_fiscal = numMatch[1]
      // Procura valor total
      const valMatch = xml.match(/<vNF>([\d.]+)<\/vNF>/i) || xml.match(/<vProd>([\d.]+)<\/vProd>/i)
      if (valMatch) parsed.valor_total = parseFloat(valMatch[1].replace('.', '').replace(',', '.'))
      // Data emissão
      const dtMatch = xml.match(/<dEmi>(\d{4}-\d{2}-\d{2})<\/dEmi>/i)
      if (dtMatch) parsed.data_pedido = dtMatch[1]
      // CNPJ emitente (fornecedor)
      const cnpjMatch = xml.match(/<emit>[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/i)
      if (cnpjMatch) parsed.cnpj_emitente = cnpjMatch[1]
      const nomeMatch = xml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/i)
      if (nomeMatch) parsed.nome_emitente = nomeMatch[1]
    }

    return NextResponse.json({
      ok: true,
      url,
      filename,
      size: file.size,
      ext,
      parsed,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
