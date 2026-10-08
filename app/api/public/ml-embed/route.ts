import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLAuthUrl } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/public/ml-embed?company_id=X
 *
 * VERSÃO ALTERNATIVA que usa BROWSER headless-like (completos headers de navegador)
 * pra carregar a página de autorização. Se Cloudflare bloquear, vai dar erro de verdade
 * e a gente sabe que é bloqueio mesmo.
 *
 * IMPORTANTE: ML só autoriza se o user estiver LOGADO no ML no navegador.
 * Esse endpoint NÃO bypassa Cloudflare — só mostra a página.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }

  const company: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
    companyId,
  )
  if (company.length === 0) {
    return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
  }

  // Mostra uma página HTML com link direto pro ML + passo a passo
  const origin = new URL(req.url).origin
  const realRedirectUri = `${origin}/api/admin/ml-oauth/callback`
  const directAuthUrl = getMLAuthUrl(companyId, realRedirectUri)

  return new NextResponse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectar Mercado Livre - ${company[0].nome_fantasia}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafbfc; color: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 600px; width: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    h1 { color: #1a1a1a; margin-bottom: 16px; font-size: 24px; }
    .company { background: #f0f9ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #3b82f6; }
    .step { background: #fafbfc; padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e5e7eb; }
    .step-num { display: inline-block; background: #3b82f6; color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; margin-right: 10px; font-weight: 700; }
    .btn { display: inline-block; background: #3b82f6; color: #fff; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
    .btn:hover { background: #2563eb; }
    .warning { background: #fef3c7; padding: 12px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #f59e0b; font-size: 14px; }
    .code { background: #f3f4f6; padding: 8px 12px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔗 Conectar Mercado Livre</h1>
    <div class="company">
      <strong>Empresa:</strong> ${company[0].nome_fantasia}<br>
      <strong>ID:</strong> <small>${company[0].id}</small>
    </div>

    <div class="step"><span class="step-num">1</span> <strong>Saia de qualquer conta ML</strong> aberta no navegador (botão de perfil → Sair)</div>
    <div class="step"><span class="step-num">2</span> <strong>Clique no botão abaixo</strong> — vai abrir a tela de login do Mercado Livre</div>
    <div class="step"><span class="step-num">3</span> <strong>Faça login com a conta ML</strong> que você quer CONECTAR (a do GH SHOP, NÃO a da LIURAESSENCE)</div>
    <div class="step"><span class="step-num">4</span> <strong>Autorize o app</strong> "Premium Shine Hub" clicando em "Autorizar"</div>
    <div class="step"><span class="step-num">5</span> <strong>Pronto!</strong> Vai voltar pro painel e mostrar "✅ Conectado"</div>

    <a href="${directAuthUrl}" target="_blank" class="btn">🚀 Conectar Mercado Livre agora</a>

    <div class="warning">
      ⚠️ <strong>Importante:</strong> Se aparecer "essa página não existe" ou erro do Cloudflare,
      <strong>aguarde 5 minutos</strong> e tente de novo. O Cloudflare do ML bloqueia acessos muito rápidos do mesmo IP.
    </div>

    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      Se precisar de ajuda, mande print do erro + URL da barra de endereço.
    </p>
  </div>
</body>
</html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}