/**
 * POST /api/admin/criar-parceiro
 *
 * Cria uma nova empresa parceira + usuário admin + invite + retorna link mágico.
 *
 * Body: { nome_fantasia, cnpj, email, razao_social? }
 *
 * Retorna: { ok, company_id, user_id, invite_token, magic_link }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const APP_URL = 'https://premium-shine-hub.vercel.app'
const AUTH_SECRET = process.env.AUTH_SECRET || 'psh-auth-secret-2026'

// Senhas conhecidas (mesmas do gerar-link-parceiro)
const SENHAS_PARCEIROS: Record<string, string> = {
  GH: 'ghshop2026',
  ALAMEDA: 'alameda2026',
  COSMARI: 'cosmari2026',
  LIURA: 'shine2026',
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + AUTH_SECRET).digest('hex')
}

function generateToken(companyId: string): string {
  // Token baseado em (company_id + date) com HMAC
  const today = new Date().toISOString().substring(0, 10)
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(companyId + today)
    .digest('hex')
    .substring(0, 24)
}

function passwordForName(name: string): string {
  const upper = name.toUpperCase()
  if (upper.includes('GH')) return SENHAS_PARCEIROS.GH
  if (upper.includes('ALAMEDA')) return SENHAS_PARCEIROS.ALAMEDA
  if (upper.includes('COSMARI')) return SENHAS_PARCEIROS.COSMARI
  if (upper.includes('LIURA')) return SENHAS_PARCEIROS.LIURA
  // Senha padrão: nome + 2026 em minúsculo
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '2026'
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { nome_fantasia, cnpj, email, razao_social, account_type } = body

    if (!nome_fantasia || !cnpj || !email) {
      return NextResponse.json(
        { ok: false, error: 'Campos obrigatórios: nome_fantasia, cnpj, email' },
        { status: 400 }
      )
    }

    // Verifica se já existe company com esse CNPJ
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE cnpj = $1 LIMIT 1`,
      cnpj
    )
    if (existing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Já existe company com esse CNPJ: ${existing[0].nome_fantasia}`,
          existing_company_id: existing[0].id,
        },
        { status: 409 }
      )
    }

    // Verifica se já existe user com esse email
    const existingUser: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      email
    )
    if (existingUser.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Já existe user com esse email: ${existingUser[0].email}`,
          existing_user_id: existingUser[0].id,
        },
        { status: 409 }
      )
    }

    // 1. Cria a company
    const companyId = crypto.randomUUID()
    const senha = passwordForName(nome_fantasia)
    const senhaHash = hashPassword(senha)

    await prisma.$queryRawUnsafe(
      `INSERT INTO companies (
        id, cnpj, nome_fantasia, razao_social, account_type, ativa,
        email, created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, true, $6, NOW(), NOW()
      )`,
      companyId,
      cnpj,
      nome_fantasia,
      razao_social || nome_fantasia,
      account_type || 'parceiro',
      email
    )

    // 2. Cria o user admin (vinculado à company via cpf_cnpj)
    const userId = crypto.randomUUID()
    await prisma.$queryRawUnsafe(
      `INSERT INTO users (
        id, email, password_hash, nome, cpf_cnpj, role, ativo, created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, 'admin', true, NOW(), NOW()
      )`,
      userId,
      email,
      senhaHash,
      nome_fantasia,
      cnpj
    )

    // 3. Gera token mágico (válido 7 dias)
    const inviteToken = generateToken(companyId)
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.$queryRawUnsafe(
      `INSERT INTO b2b_invites (
        id, email_convidado, nome_convidado, company_name, token, plano, status,
        expira_em, created_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, 'basic'::b2b_plano, 'pendente'::invite_status, $6, NOW()
      )`,
      crypto.randomUUID(),
      email,
      nome_fantasia,
      nome_fantasia,
      inviteToken,
      expiraEm
    )

    // 4. Gera link mágico
    const today = new Date().toISOString().substring(0, 10)
    const magicLink = `${APP_URL}/api/auth/signin-link?email=${encodeURIComponent(email)}&password=${encodeURIComponent(senha)}&date=${today}&token=${generateToken(companyId)}&redirect=/admin/vincular-ml`

    return NextResponse.json({
      ok: true,
      company: {
        id: companyId,
        nome_fantasia,
        cnpj,
        email,
        account_type: account_type || 'parceiro',
        ativa: true,
      },
      user: {
        id: userId,
        email,
        nome: nome_fantasia,
        role: 'admin',
        password_hint: senha,
      },
      invite: {
        token: inviteToken,
        expira_em: expiraEm.toISOString(),
      },
      magic_link: magicLink,
      instructions: [
        `1. Mande o link mágico pro vendor`,
        `2. Quando ele clicar, vai logar direto como ${nome_fantasia}`,
        `3. Será redirecionado pra /admin/vincular-ml pra conectar a conta ML dele`,
        `4. Email: ${email}`,
        `5. Senha (caso precise digitar): ${senha}`,
      ],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
