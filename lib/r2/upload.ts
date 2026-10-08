/**
 * =====================================================
 * UPLOAD DE FOTOS — Cloudflare R2
 * Premium Shine Hub
 * =====================================================
 * R2 é S3-compatible, custo MUITO menor que AWS S3
 *   - 10 GB grátis/mês
 *   - R$0.50 por GB adicional
 *   - Sem cobrança de egress (diferente do S3!)
 *
 * Setup:
 *   1) Criar conta em cloudflare.com
 *   2) R2 > Create bucket "premiumshine-fotos"
 *   3) Gerar Access Keys em R2 > Manage R2 API Tokens
 *   4) Colocar no .env:
 *      R2_ACCOUNT_ID=...
 *      R2_ACCESS_KEY_ID=...
 *      R2_SECRET_ACCESS_KEY=...
 *      R2_BUCKET=premiumshine-fotos
 *      R2_PUBLIC_URL=https://fotos.premiumshine.com.br
 *
 * Endpoint:
 *   POST /api/upload/photo
 *   Body: FormData com campo "file"
 *   Retorna: { url: "https://..." }
 * =====================================================
 */

// lib/r2/upload.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET!
const PUBLIC_URL = process.env.R2_PUBLIC_URL!

/**
 * Faz upload de um arquivo pro R2
 * @param file Buffer ou stream do arquivo
 * @param originalName Nome original (pra extrair extensão)
 * @param folder Pasta dentro do bucket (ex: 'produtos', 'usuarios')
 */
export async function uploadToR2(
  file: Buffer,
  originalName: string,
  folder: string = 'produtos'
): Promise<{
  url: string
  key: string
  size: number
}> {
  // Gerar nome único
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  const key = `${folder}/${randomUUID()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file,
    ContentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    CacheControl: 'public, max-age=31536000', // cache 1 ano
    Metadata: {
      originalName: encodeURIComponent(originalName),
    },
  })

  await R2.send(command)

  return {
    url: `${PUBLIC_URL}/${key}`,
    key,
    size: file.length,
  }
}

/**
 * Valida arquivo antes do upload
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Tamanho máximo: 10MB
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    return { valid: false, error: 'Arquivo muito grande. Máximo 10MB.' }
  }

  // Tipos permitidos
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Tipo não suportado. Use JPG, PNG ou WebP.' }
  }

  return { valid: true }
}
