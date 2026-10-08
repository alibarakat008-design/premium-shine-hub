/**
 * Auto-login por link magico
 *
 * Recebe company_id + token de seguranca e seta cookies de sessao.
 * Redireciona pro destino (default: /admin).
 *
 * IMPORTANTE: usa HTML+JS em vez de 302 redirect, porque alguns
 * navegadores/condicoes nao salvam cookies via 302+Set-Cookie.
 * O HTML seta os cookies via document.cookie e faz o redirect via JS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

const AUTH_SECRET = process.env.AUTH_SECRET || 'psh-auth-secret-2026'

export const dynamic = 'force-dynamic'

function generateToken(companyId: string, date: string): string {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`auto-login|${companyId}|${date}`)
    .digest('hex')
    .slice(0, 24)
}

function verifyToken(companyId: string, date: string, token: string): boolean {
  const expected = generateToken(companyId, date)
  return expected === token
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const date = searchParams.get('date') || new Date().toISOString().substring(0, 10)
  const token = searchParams.get('token')
  const redirect = searchParams.get('redirect') || '/admin/vendas-ao-vivo'

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatorio' }, { status: 400 })
  }

  // Valida token
  if (!token || !verifyToken(companyId, date, token)) {
    return NextResponse.json({
      ok: false,
      error: 'Token invalido. Use o link gerado pelo admin.',
    }, { status: 401 })
  }

  try {
    // Confirma company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, account_type FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Company nao encontrada' }, { status: 404 })
    }

    const c = company[0]
    const isMatriz = c.account_type === 'matriz'
    const sessionRole = isMatriz ? 'matriz' : (c.account_type || 'parceiro')

    // Pega user da company
    const users: any[] = await prisma.$queryRawUnsafe(
      `SELECT id::text, email, role FROM users WHERE company_id = $1::uuid AND ativo = true ORDER BY created_at LIMIT 1`,
      companyId,
    )
    const user = users[0]

    // Gera psh_auth_token (HMAC)
    const ts = Date.now().toString()
    const userId = user?.id || 'unknown'
    const hmac = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(`${userId}|${companyId}|${ts}`)
      .digest('hex')
      .slice(0, 32)
    const authToken = Buffer.from(`${userId}|${companyId}|${ts}|${hmac}`).toString('base64')

    // HTML com JS que seta cookies via document.cookie e redireciona
    // (mais robusto que 302 + Set-Cookie)
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Autenticando...</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    text-align: center;
  }
  .container {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding: 40px 60px;
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  h1 { font-size: 24px; margin: 0 0 8px; }
  p { opacity: 0.9; margin: 0; }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  button {
    margin-top: 16px;
    background: #fff;
    color: #1e40af;
    border: 0;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #f0f9ff; }
  .err { background: rgba(239, 68, 68, 0.2); color: #fff; padding: 12px; border-radius: 8px; margin-top: 12px; display: none; }
</style>
</head>
<body>
<div class="container">
  <div class="spinner" id="spinner"></div>
  <h1>Autenticando...</h1>
  <p id="status">Aguarde enquanto entramos na sua area.</p>
  <div class="err" id="err"></div>
  <button id="btn" style="display:none" onclick="window.location.href='${redirect}'">Entrar manualmente</button>
</div>
<script>
(function() {
  try {
    // Seta todos os cookies via document.cookie (mesmo origem, sem httpOnly)
    var exp = 30 * 24 * 60 * 60;  // 30 dias
    document.cookie = 'psh_session_role=${sessionRole}; path=/; max-age=' + exp + '; samesite=lax';
    document.cookie = 'psh_session_company_id=${companyId}; path=/; max-age=' + exp + '; samesite=lax';
    document.cookie = 'psh_session_company_name=' + encodeURIComponent('${c.nome_fantasia.replace(/'/g, "\\'")}') + '; path=/; max-age=' + exp + '; samesite=lax';
    document.cookie = 'psh_auth_token=${authToken}; path=/; max-age=' + exp + '; samesite=lax';
    document.cookie = 'psh_session_email=${user?.email || ''}; path=/; max-age=' + exp + '; samesite=lax';

    // Verifica se cookies foram setados
    setTimeout(function() {
      if (document.cookie.indexOf('psh_session_role=') === -1) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('status').textContent = 'Cookies bloqueados pelo navegador.';
        document.getElementById('err').style.display = 'block';
        document.getElementById('err').textContent = 'Tente abrir o link em uma janela normal (não anônima) e aceite os cookies.';
        document.getElementById('btn').style.display = 'inline-block';
      } else {
        window.location.href = '${redirect}';
      }
    }, 500);
  } catch (e) {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status').textContent = 'Erro: ' + e.message;
    document.getElementById('btn').style.display = 'inline-block';
  }
})();
</script>
</body>
</html>`

    // Retorna HTML com 200 OK (sem 302)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
