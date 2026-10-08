/**
 * GET /api/admin/promo-scenarios/import-template
 * Retorna o modelo CSV para importação em lote de cenários.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const csv = [
    'mlb,nome_produto,teto_desconto_seller_pct,preco_minimo,valor_minimo_a_receber,modo',
    'MLB12345678,Perfume Rose Premium,10,50.00,30.00,conservador',
    'MLB87654321,Spray Body Mist,15,35.00,20.00,agressivo',
    'MLB11223344,Body Cream Coco,8,40.00,25.00,conservador',
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modelo_cenarios_promocoes.csv"',
    },
  })
}
