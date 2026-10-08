import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ml-debug?company_id=X
 *
 * Debug pra ver EXATAMENTE qual config tá sendo enviada pro ML.
 * Útil pra diagnosticar erros de redirect_uri/client_id inválido.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  const issues: string[] = []
  const info: any = {
    timestamp: new Date().toISOString(),
    env: {
      ML_CLIENT_ID: process.env.ML_CLIENT_ID ? `${process.env.ML_CLIENT_ID.substring(0, 8)}...` : '❌ NÃO DEFINIDO',
      ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET ? `${process.env.ML_CLIENT_SECRET.substring(0, 4)}...${process.env.ML_CLIENT_SECRET.substring(process.env.ML_CLIENT_SECRET.length - 4)}` : '❌ NÃO DEFINIDO',
      ML_REDIRECT_URI: process.env.ML_REDIRECT_URI || '❌ NÃO DEFINIDO',
    },
    vercel_url: `https://premium-shine-hub.vercel.app`,
  }

  // Verifica se o env tá faltando
  if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) {
    issues.push('⚠️ ML_CLIENT_ID ou ML_CLIENT_SECRET não configurado no servidor')
  }

  // Compara redirect_uri do env com a URL real
  const expectedRedirect = `${info.vercel_url}/api/admin/ml-oauth/callback`
  if (process.env.ML_REDIRECT_URI && process.env.ML_REDIRECT_URI !== expectedRedirect) {
    issues.push(`⚠️ ML_REDIRECT_URI do .env é "${process.env.ML_REDIRECT_URI}" — DIVERGENTE da URL real "${expectedRedirect}"`)
  }

  // Testa o token do ML via /users/me (se houver company com token salvo)
  let accountTest: any = null
  if (companyId) {
    const compRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, access_token_ml, refresh_token_ml, ml_expires_at, ml_user_id FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (compRes.length > 0) {
      const comp = compRes[0]
      accountTest = {
        token_in_db: !!comp.access_token_ml,
        token_first_4: comp.access_token_ml ? comp.access_token_ml.substring(0, 4) : null,
        refresh_token_in_db: !!comp.refresh_token_ml,
        refresh_first_4: comp.refresh_token_ml ? comp.refresh_token_ml.substring(0, 4) : null,
        ml_user_id: comp.ml_user_id,
        ml_expires_at: comp.ml_expires_at,
      }

      // Testa /users/me com o access token
      if (comp.access_token_ml && comp.access_token_ml !== '__PENDING__') {
        const r = await fetch('https://api.mercadolibre.com/users/me', {
          headers: { Authorization: `Bearer ${comp.access_token_ml}` },
        })
        accountTest.api_check = {
          users_me_status: r.status,
          ok: r.ok,
        }
        if (r.ok) {
          const user = await r.json()
          accountTest.api_check.user = { id: user.id, nickname: user.nickname }
        } else {
          accountTest.api_check.body = (await r.text()).substring(0, 300)
        }
      }
    }
  }

  // Gera URL OAuth de exemplo (igual ao start)
  if (process.env.ML_CLIENT_ID) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.ML_CLIENT_ID,
      redirect_uri: expectedRedirect,
      state: 'debug-state',
    })
    info.constructed_oauth_url = `https://auth.mercadolivre.com.br/authorization?${params.toString()}`

    // Tenta acessar o oauth_url e ver o que retorna
    try {
      const testRes = await fetch(info.constructed_oauth_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)',
          Accept: 'text/html',
        },
        redirect: 'manual',
      })
      info.oauth_test = {
        status: testRes.status,
        location: testRes.headers.get('location')?.substring(0, 200),
      }
      if (testRes.status === 200) {
        const body = await testRes.text()
        info.oauth_test.body_sample = body.substring(0, 500)
        // Detecta se é página de erro
        if (body.includes('Não é possível') || body.includes('not_found') || body.includes('404')) {
          issues.push('❌ ML retornou página de erro 404 — provavelmente client_id inválido OU redirect_uri NÃO cadastrado no painel ML')
        }
      }
    } catch (e: any) {
      info.oauth_test.error = e.message
    }
  }

  return NextResponse.json({
    ok: true,
    info,
    issues,
    account_test: accountTest,
    recommendation: issues.length > 0
      ? 'Verifique os pontos acima antes de continuar'
      : 'Tudo OK — tenta o fluxo OAuth de novo',
  })
}