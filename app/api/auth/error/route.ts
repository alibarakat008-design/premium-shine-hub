import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/error
 * Retorna JSON com mensagem de erro (em vez de HTML genérico).
 * Usado quando algo redireciona o usuário pra cá (ex: OAuth cancelado).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const error = searchParams.get('error') || 'unknown_error'
  const description = searchParams.get('error_description') || null

  return NextResponse.json({
    ok: false,
    error,
    error_description: description,
    message: 'Erro de autenticação. Tente novamente ou volte pro início.',
    help: {
      cadastro: '/cadastro',
      login: '/login-parceiro',
      voltar: '/admin/dashboard-parceiro',
    },
  }, {
    status: 400,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}