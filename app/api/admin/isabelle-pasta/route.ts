import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ISABELLE_ID = 'a897a8d7-d0e4-4de0-bb0f-3f89b364e8b5'

// PASTA products to CREATE (only ones missing in DB after rename)
const PASTA_TO_CREATE = [
  { nome: 'PASTA VENENO BIANCO 200GR', sku: 'ILB-PASTA-VENENO-BIANCO-200GR', ean: '7898286336578' },
]

// Products to rename (current_nome contains -> correct_nome, sku, ean)
// ORDEM CRÍTICA: mais específico primeiro para evitar sobreposição
const PASTA_RENAMES = [
  { contains: 'PASTA ANGEL FANTASM',   correct_nome: 'PASTA ANGEL FANTASM 200GR',  sku: 'ILB-PASTA-ANGEL-FANTASM-200GR',  ean: '7898744784538' },
  { contains: 'PASTA ASAD BOURBON',     correct_nome: 'PASTA ASAD BOURBON 200GR',   sku: 'ILB-PASTA-ASAD-BOURBON-200GR',   ean: '7898286336417' },
  { contains: 'PASTA ASAD ELIXIR',      correct_nome: 'PASTA ASAD ELIXIR 200GR',    sku: 'ILB-PASTA-ASAD-ELIXIR-200GR',    ean: '7898286336530' },
  { contains: 'PASTA SABAH AL WARD SUGAR', correct_nome: 'PASTA SABAH AL WARD SUGAR 200GR', sku: 'ILB-PASTA-SABAH-AL-WARD-SUGAR-200GR', ean: '7898286336509' },
  { contains: 'PASTA SABAH AL WARD DELILAH', correct_nome: 'PASTA SABAH AL WARD DELILAH 200GR', sku: 'ILB-PASTA-SABAH-AL-WARD-DELILAH-200GR', ean: '7898286336622' },
  { contains: 'PASTA SABAH AL WARD VALENTINE', correct_nome: 'PASTA SABAH AL WARD VALENTINE 200GR', sku: 'ILB-PASTA-SABAH-AL-WARD-VALENTINE-200GR', ean: '7898744785580' },
  { contains: 'PASTA SABAH GARDEN OF EDEN', correct_nome: 'PASTA SABAH GARDEN OF EDEN 200GR', sku: 'ILB-PASTA-SABAH-GARDEN-OF-EDEN-200GR', ean: '7898286336677' },
  { contains: 'PASTA LA BELLE BOMBA',   correct_nome: 'PASTA LA BELLE BOMBA 200GR',  sku: 'ILB-PASTA-LA-BELLE-BOMBA-200GR',  ean: '7898744784583' },
  { contains: 'PASTA MARSHMALLOW BLUSH', correct_nome: 'PASTA MARSHMALLOW BLUSH 200GR', sku: 'ILB-PASTA-MARSHMALLOW-BLUSH-200GR', ean: '7898744786382' },
  { contains: 'PASTA FAKHAR GOLD',       correct_nome: 'PASTA FAKHAR GOLD 200GR',     sku: 'ILB-PASTA-FAKHAR-GOLD-200GR',     ean: '7898744783920' },
  { contains: 'PASTA FAKHAR ROSE',      correct_nome: 'PASTA FAKHAR ROSE 200GR',    sku: 'ILB-PASTA-FAKHAR-ROSE-200GR',    ean: '7898286336363' },
  { contains: 'PASTA QUEEN OF ARABIA',  correct_nome: 'PASTA QUEEN OF ARABIA 200GR', sku: 'ILB-PASTA-QUEEN-OF-ARABIA-200GR', ean: '7898286336646' },
  { contains: 'PASTA YARA CANDY',       correct_nome: 'PASTA YARA CANDY 200GR',     sku: 'ILB-PASTA-YARA-CANDY-200GR',     ean: '7898744785474' },
  { contains: 'PASTA YARA ELIXIR',      correct_nome: 'PASTA YARA ELIXIR 200GR',    sku: 'ILB-PASTA-YARA-ELIXIR-200GR',    ean: '7898286336547' },
  { contains: 'PASTA AFEEF',            correct_nome: 'PASTA AFEEF 200GR',           sku: 'ILB-PASTA-AFEEF-200GR',           ean: '7898744785481' },
  { contains: 'PASTA ALIEN',            correct_nome: 'PASTA ALIEN 200GR',            sku: 'ILB-PASTA-ALIEN-200GR',            ean: '7898286336349' },
  { contains: 'PASTA AMBER OUD',        correct_nome: 'PASTA AMBER OUD 200GR',       sku: 'ILB-PASTA-AMBER-OUD-200GR',       ean: '7898286336523' },
  { contains: 'PASTA ANGEL',            correct_nome: 'PASTA ANGEL 200GR',            sku: 'ILB-PASTA-ANGEL-200GR',            ean: '7898744783371' },
  { contains: 'PASTA ASAD',             correct_nome: 'PASTA ASAD 200GR',            sku: 'ILB-PASTA-ASAD-200GR',            ean: '7898286336325' },
  { contains: 'PASTA ATHEERI',          correct_nome: 'PASTA ATHEERI 200GR',         sku: 'ILB-PASTA-ATHEERI-200GR',         ean: '7898744786082' },
  { contains: 'PASTA CLUB ICONIC',      correct_nome: 'PASTA CLUB ICONIC 200GR',    sku: 'ILB-PASTA-CLUB-ICONIC-200GR',    ean: '7898744783715' },
  { contains: 'PASTA CLUB',             correct_nome: 'PASTA CLUB 200GR',            sku: 'ILB-PASTA-CLUB-200GR',            ean: '7898744783449' },
  { contains: 'PASTA DALAL',            correct_nome: 'PASTA DALAL 200GR',           sku: 'ILB-PASTA-DALAL-200GR',           ean: '7898286336639' },
  { contains: 'PASTA DELILAH',          correct_nome: 'PASTA DELILAH 200GR',         sku: 'ILB-PASTA-DELILAH-200GR',         ean: '7898286336431' },
  { contains: 'PASTA HABIBI',           correct_nome: 'PASTA HABIBI 200GR',          sku: 'ILB-PASTA-HABIBI-200GR',          ean: '7898744783555' },
  { contains: 'PASTA HASSAN AURA',      correct_nome: 'PASTA HASSAN AURA 200GR',    sku: 'ILB-PASTA-HASSAN-AURA-200GR',    ean: '7898286336356' },
  { contains: 'PASTA ISHQ SILVER',      correct_nome: 'PASTA ISHQ SILVER 200GR',   sku: 'ILB-PASTA-ISHQ-SILVER-200GR',   ean: '7898744786105' },
  { contains: 'PASTA KINGDOM',         correct_nome: 'PASTA KINGDOM 200GR',         sku: 'ILB-PASTA-KINGDOM-200GR',         ean: '7898286336578' },
  { contains: 'PASTA LIQUID BRUN',      correct_nome: 'PASTA LIQUID BRUN 200GR',   sku: 'ILB-PASTA-LIQUID-BRUN-200GR',   ean: '7898744783906' },
  { contains: 'PASTA NICE GIRL',       correct_nome: 'PASTA NICE GIRL 200GR',      sku: 'ILB-PASTA-NICE-GIRL-200GR',      ean: '7898744784576' },
  { contains: 'PASTA PURE EXCLUSIVE',  correct_nome: 'PASTA PURE EXCLUSIVE 200GR',  sku: 'ILB-PASTA-PURE-EXCLUSIVE-200GR',  ean: '7898744784996' },
  { contains: 'PASTA RAKI',            correct_nome: 'PASTA RAKI 200GR',            sku: 'ILB-PASTA-RAKI-200GR',            ean: '7898286336394' },
  { contains: 'PASTA ROYAL AMBER',     correct_nome: 'PASTA ROYAL AMBER 200GR',    sku: 'ILB-PASTA-ROYAL-AMBER-200GR',    ean: '7898286336400' },
  { contains: 'PASTA SABAH AL WARD',   correct_nome: 'PASTA SABAH AL WARD 200GR',  sku: 'ILB-PASTA-SABAH-AL-WARD-200GR',  ean: '7898286336424' },
  { contains: 'PASTA SO CANDID',        correct_nome: 'PASTA SO CANDID 200GR',     sku: 'ILB-PASTA-SO-CANDID-200GR',     ean: '7898286336561' },
  { contains: 'PASTA SUPREMACIA',      correct_nome: 'PASTA SUPREMACIA 200GR',    sku: 'ILB-PASTA-SUPREMACIA-200GR',    ean: '7898744785597' },
  { contains: 'PASTA VICTORIA',        correct_nome: 'PASTA VICTORIA 200GR',      sku: 'ILB-PASTA-VICTORIA-200GR',      ean: '7898286336554' },
  { contains: 'PASTA VULCAN',          correct_nome: 'PASTA VULCAN 200GR',         sku: 'ILB-PASTA-VULCAN-200GR',         ean: '7898744785610' },
  { contains: 'PASTA YARA',            correct_nome: 'PASTA YARA 200GR',            sku: 'ILB-PASTA-YARA-200GR',            ean: '7898286336332' },
  { contains: 'SHIMMER ANGEL',         correct_nome: 'PASTA SHIMMER ANGEL 90GR',  sku: 'ILB-PASTA-SHIMMER-ANGEL-90GR',  ean: '7898286336516' },
  { contains: 'SHIMMER SABAH SUGAR',   correct_nome: 'PASTA SHIMMER SABAH SUGAR 90GR', sku: 'ILB-PASTA-SHIMMER-SABAH-SUGAR-90GR', ean: '7898286336493' },
]

// Patterns of old-format products to deactivate
const OLD_PATTERNS = [
  'Creme Hidratante Corporal',
  'Creme Hidratante Asad Pasta',
  'Creme Loção Hidratante Pasta',
  'Creme Pasta Hidratante',
  'Hidratante Corporal Asad',
  'Hidratante Corporal Dalal',
  'Hidratante Corporal Pasta',
  'Hidratante Corporal Yara',
  'Isabelle La Belle Pasta Hidratante',
  'Pasta Hidratante Corporal',
  'Pasta Concentrada',
  'Isabelle La Belle Angel',
]

// Escape single quotes for SQL
function escapeSQL(s: string): string {
  return s.replace(/'/g, "''")
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action } = await req.json()

  if (action === 'cleanup') {
    try {
      // 1. Get or create PASTA category
      let pastaCat = await prisma.categories.findUnique({ where: { slug: 'pasta-dental' } })
      if (!pastaCat) {
        pastaCat = await prisma.categories.create({
          data: { nome: 'PASTA DENTAL', slug: 'pasta-dental', ativa: true, ordem: 15 }
        })
      }
      const catId = pastaCat.id

      // 2. Deactivate old-format products (1 call per pattern)
      let deactivateCount = 0
      for (const pattern of OLD_PATTERNS) {
        const result = await prisma.$executeRawUnsafe(
          `UPDATE products SET ativo = false WHERE marca_id = $1::uuid AND ativo = true AND nome ILIKE '%' || $2 || '%'`,
          ISABELLE_ID, pattern
        )
        deactivateCount += Number(result)
      }

      // 3. Rename existing PASTA products using $executeRawUnsafe (1 call per item)
      // Only update if the product doesn't already have this exact SKU (avoids conflicts with old-format products)
      const renamed: string[] = []
      for (const item of PASTA_RENAMES) {
        const result = await prisma.$executeRawUnsafe(
          `UPDATE products SET nome = $1, sku = $2, ean = $3, categoria_id = $4::uuid WHERE marca_id = $5::uuid AND ativo = true AND nome ILIKE '%' || $6 || '%' AND (sku IS NULL OR sku = '' OR sku = $2)`,
          item.correct_nome, item.sku, item.ean, catId, ISABELLE_ID, item.contains
        )
        if (Number(result) > 0) renamed.push(`${item.contains} -> ${item.correct_nome}`)
      }

      // 4. Create missing PASTA products
      const created: string[] = []
      const skipped: string[] = []
      for (const p of PASTA_TO_CREATE) {
        const existing = await prisma.products.findUnique({ where: { sku: p.sku } })
        if (existing) {
          skipped.push(p.nome + ' (SKU duplicado)')
          continue
        }
        // Also check by EAN
        const byEan = await prisma.products.findFirst({
          where: { marca_id: ISABELLE_ID, ean: p.ean ?? '' }
        })
        if (byEan) {
          skipped.push(`${p.nome} (EAN ${p.ean} já existe: ${byEan.nome})`)
          continue
        }
        // Check if any ISABELLE product already has this SKU (in case of stale data)
        const bySkuAny = await prisma.products.findFirst({
          where: { sku: p.sku }
        })
        if (bySkuAny) {
          skipped.push(`${p.nome} (SKU ${p.sku} já existe como ${bySkuAny.nome})`)
          continue
        }
        await prisma.products.create({
          data: {
            nome: p.nome,
            sku: p.sku,
            ean: p.ean,
            marca_id: ISABELLE_ID,
            categoria_id: catId,
            ativo: true,
            publicado_site: false,
            publicado_shopee: false,
          }
        })
        created.push(p.nome)
      }

      // 5. Final list
      const allPasta = await prisma.$queryRawUnsafe<{ id: string; nome: string; sku: string; ean: string }[]>(
        `SELECT id, nome, sku, ean FROM products WHERE marca_id = $1::uuid AND ativo = true AND categoria_id = $2::uuid ORDER BY nome`,
        ISABELLE_ID, catId
      )

      return NextResponse.json({
        pastaCat,
        deactivatedOld: deactivateCount,
        renamed,
        created,
        skipped,
        totalPastaNow: allPasta.length,
        pastaProducts: allPasta,
      })
    } catch (err: unknown) {
      const e = err as Error
      return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
  }

  if (action === 'fix-old-skus') {
    // Corrige SKUs velhos ISABELLE-PASTA-200GR-*
    // ESTRATEGIA: se o SKU correto (ILB-PASTA-*) já existe, desativa o velho (duplicata)
    // Se o SKU correto NAO existe, renomeia normalmente
    const OLD_SKU_FIXES = [
      { oldSku: 'ISABELLE-PASTA-200GR-AFEEF',     new_nome: 'PASTA AFEEF 200GR',          new_sku: 'ILB-PASTA-AFEEF-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-ANGEL',      new_nome: 'PASTA ANGEL 200GR',         new_sku: 'ILB-PASTA-ANGEL-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-ASAD',       new_nome: 'PASTA ASAD 200GR',           new_sku: 'ILB-PASTA-ASAD-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-CLUB',      new_nome: 'PASTA CLUB 200GR',           new_sku: 'ILB-PASTA-CLUB-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-DELILAH',   new_nome: 'PASTA DELILAH 200GR',        new_sku: 'ILB-PASTA-DELILAH-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-FAKHARROSE', new_nome: 'PASTA FAKHAR ROSE 200GR',   new_sku: 'ILB-PASTA-FAKHAR-ROSE-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-HASSANAURA', new_nome: 'PASTA HASSAN AURA 200GR',    new_sku: 'ILB-PASTA-HASSAN-AURA-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-LIQUIDBRUN', new_nome: 'PASTA LIQUID BRUN 200GR',   new_sku: 'ILB-PASTA-LIQUID-BRUN-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-NICEGIRL',  new_nome: 'PASTA NICE GIRL 200GR',      new_sku: 'ILB-PASTA-NICE-GIRL-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-RAKI',       new_nome: 'PASTA RAKI 200GR',            new_sku: 'ILB-PASTA-RAKI-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-SOCANDID',   new_nome: 'PASTA SO CANDID 200GR',      new_sku: 'ILB-PASTA-SO-CANDID-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-VULCAN',      new_nome: 'PASTA VULCAN 200GR',         new_sku: 'ILB-PASTA-VULCAN-200GR' },
      { oldSku: 'ISABELLE-PASTA-200GR-YARA',        new_nome: 'PASTA YARA 200GR',           new_sku: 'ILB-PASTA-YARA-200GR' },
    ]

    try {
      const renamed: string[] = []
      const deactivated: string[] = []
      const notFound: string[] = []

      for (const f of OLD_SKU_FIXES) {
        // Check if old product exists
        const oldRows = await prisma.$queryRawUnsafe<{ id: string; nome: string; sku: string }[]>(
          `SELECT id, nome, sku FROM products WHERE sku = $1`, f.oldSku
        )
        if (oldRows.length === 0) {
          notFound.push(f.oldSku)
          continue
        }

        // Check if new SKU already exists (conflict — deactivate old duplicate)
        const conflictRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM products WHERE sku = $1`, f.new_sku
        )
        if (conflictRows.length > 0) {
          // Deactivate old duplicate
          await prisma.$executeRawUnsafe(
            `UPDATE products SET ativo = false WHERE sku = $1`, f.oldSku
          )
          deactivated.push(`${f.oldSku} (duplicata de ${f.new_sku}, desativado)`)
          continue
        }

        // Safe to rename
        const result = await prisma.$executeRawUnsafe(
          `UPDATE products SET nome = $1, sku = $2 WHERE sku = $3`,
          f.new_nome, f.new_sku, f.oldSku
        )
        if (Number(result) > 0) renamed.push(`${f.oldSku} -> ${f.new_nome}`)
      }

      // Final count
      let pastaCat = await prisma.categories.findUnique({ where: { slug: 'pasta-dental' } })
      const count = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM products WHERE marca_id = $1::uuid AND ativo = true AND categoria_id = $2::uuid`,
        ISABELLE_ID, pastaCat?.id ?? ''
      )

      return NextResponse.json({
        renamed,
        deactivated,
        notFound,
        totalPastaNow: Number(count[0]?.count ?? 0),
      })
    } catch (err: unknown) {
      const e = err as Error
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
