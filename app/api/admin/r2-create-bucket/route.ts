/**
 * GET /api/admin/r2-create-bucket
 * Cria o bucket R2 premiumshine-fotos se não existir.
 */
import { NextResponse } from 'next/server'
import { S3Client, HeadBucketCommand, CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'

export async function GET() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env.R2_BUCKET || 'premiumshine-fotos'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({
      ok: false,
      step: 'env_check',
      error: 'Variáveis R2 não configuradas no Vercel.',
      vars: {
        R2_ACCOUNT_ID: !!accountId,
        R2_ACCESS_KEY_ID: !!accessKeyId,
        R2_SECRET_ACCESS_KEY: !!secretAccessKey,
        R2_BUCKET: !!process.env.R2_BUCKET,
      },
    }, { status: 500 })
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  // Teste: listar buckets
  let buckets: string[] = []
  try {
    const listRes = await client.send(new ListBucketsCommand({}))
    buckets = (listRes.Buckets || []).map(b => b.Name || '')
    console.log('[r2-create-bucket] Buckets existentes:', buckets)
  } catch (e: any) {
    const msg = e.message || e.name || 'Unknown'
    console.error('[r2-create-bucket] Erro ao listar buckets:', msg)
    return NextResponse.json({
      ok: false,
      step: 'list_buckets',
      error: `Erro de conexão R2: ${msg}`,
      errorCode: e.name,
      hint: 'O servidor Vercel não consegue acessar o Cloudflare R2. Crie o bucket manualmente no Dashboard do Cloudflare → R2 → Create bucket com nome "premiumshine-fotos".',
    }, { status: 502 })
  }

  if (buckets.includes(bucketName)) {
    return NextResponse.json({
      ok: true,
      step: 'bucket_exists',
      message: `Bucket '${bucketName}' já existe!`,
      bucket: bucketName,
      existing_buckets: buckets,
    })
  }

  // Criar bucket
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }))
    return NextResponse.json({
      ok: true,
      step: 'bucket_created',
      message: `Bucket '${bucketName}' criado com sucesso!`,
      bucket: bucketName,
    })
  } catch (e: any) {
    console.error('[r2-create-bucket] Erro ao criar:', e.message || e.name)
    if (e.name === 'BucketAlreadyOwnedByYou' || e.name === 'BucketAlreadyExists') {
      return NextResponse.json({
        ok: true,
        step: 'bucket_exists',
        message: `Bucket '${bucketName}' já existe.`,
        bucket: bucketName,
      })
    }
    return NextResponse.json({
      ok: false,
      step: 'create_bucket',
      error: `Erro ao criar bucket: ${e.message || e.name}`,
      errorCode: e.name,
    }, { status: 502 })
  }
}
