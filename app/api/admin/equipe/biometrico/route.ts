/**
 * =====================================================
 * API: Biométrico — recebe dados do relógio de ponto
 * =====================================================
 * O relógio de ponto (ex: Henry, TopData, Newpex) pode
 * enviar dados via HTTP POST ou GET neste endpoint.
 *
 * Métodos suportados:
 *   1) HTTP GET/POST direto do aparelho (desacoplado, firewall)
 *   2) Um "bot" interno que lê o equipamento local e repassa aqui
 *   3) App mobile que registra ponto e envia aqui
 *
 * Formato padrão do equipamento (mais comum):
 *   GET /api/admin/equipe/biometrico?codigo=123&data=2026-08-17&hora=13:05:26&tipo=entrada
 *
 * Formato alternativo (JSON):
 *   POST /api/admin/equipe/biometrico
 *   Body: { codigo: "123", data: "2026-08-17", hora: "13:05:26", tipo: "entrada", serial: "DEV001" }
 *
 * Tipo: "entrada", "saida", "pausa"
 * =====================================================
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Endpoint GET (equipamentos que fazem GET simples)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const codigo = searchParams.get('codigo')
    const data = searchParams.get('data')
    const hora = searchParams.get('hora')
    const tipo = searchParams.get('tipo') || 'entrada'
    const serial = searchParams.get('serial') || null

    if (!codigo || !data) {
      return new NextResponse('Parâmetros codigo e data obrigatórios', { status: 400 })
    }

    const resultado = await registrarPonto(codigo, data, hora, tipo, serial)
    return NextResponse.json(resultado)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// Endpoint POST (equipamentos que enviam JSON)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { codigo, data, hora, tipo, serial, equipe_id } = body

    if (!data || (!codigo && !equipe_id)) {
      return NextResponse.json({ ok: false, error: 'data e (codigo ou equipe_id) obrigatórios' }, { status: 400 })
    }

    // Se recebeu codigo (matrícula do relógio), procurar pelo nome na equipe
    // (você cadastra a matrícula do relógio no campo 'observacao' do membro como 'biometrico:123')
    let idFinal = equipe_id

    if (codigo && !equipe_id) {
      // Procura membro que tenha observacao contendo "biometrico:codigo"
      const membros = await prisma.equipe.findMany({
        where: {
          ativo: true,
          observacao: { contains: `biometrico:${codigo}` },
        },
        select: { id: true, nome: true },
      })

      if (membros.length === 0) {
        return NextResponse.json({
          ok: false,
          error: `Nenhum colaborador com código biométrico "${codigo}" encontrado. Cadastre a matrícula no campo "Observação" do colaborador como: biometrico:123`,
        }, { status: 404 })
      }

      idFinal = membros[0].id
    }

    const resultado = await registrarPonto(idFinal, data, hora, tipo, serial)
    return NextResponse.json(resultado)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

async function registrarPonto(
  equipe_id: string,
  dataStr: string,
  horaStr: string | null,
  tipo: string,
  serial: string | null
) {
  // Monta data_hora
  const dataHora = horaStr
    ? new Date(`${dataStr}T${horaStr}:00.000Z`)
    : new Date(`${dataStr}T${new Date().toISOString().split('T')[1]}`)

  // Tipo válido
  const tipoVal = ['entrada', 'saida', 'pausa'].includes(tipo) ? tipo : 'entrada'

  // Busca info do colaborador
  const membro = await prisma.equipe.findUnique({
    where: { id: equipe_id },
    select: { id: true, nome: true },
  })

  if (!membro) {
    return { ok: false, error: 'Colaborador não encontrado' }
  }

  // Registra ponto
  const ponto = await prisma.equipe_ponto.create({
    data: {
      equipe_id,
      tipo: tipoVal as any,
      data_hora: dataHora,
      foto_url: null,
      observacao: serial ? `Aparelho: ${serial}` : null,
      registrado_por: 'biometrico',
    },
  })

  return {
    ok: true,
    mensagem: `${membro.nome} — ${tipoVal === 'entrada' ? 'Entrada' : tipoVal === 'saida' ? 'Saída' : 'Pausa'} registrada às ${dataHora.toLocaleTimeString('pt-BR')}`,
    data: ponto,
  }
}
