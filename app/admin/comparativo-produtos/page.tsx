'use client'

/**
 * COMPARATIVO DE PRODUTOS
 * Compara 2 SKUs lado a lado: receita, preço, margem, perfil do público, geografia
 * - KPIs: receita, unidades, pedidos, ticket, preço médio, custo, margem
 * - Cross-sell (lift entre os 2)
 * - Evolução mensal
 * - Onde A ganha / B ganha / Empatam
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Resumo = {
  sku: string
  nome: string
  marca: string
  genero: string | null
  ean: string | null
  pedidos: number
  unidades: number
  receita: number
  preco_medio: number
  ticket_medio: number
  custo: number
  margem_pct: number
  pct_feminino: number
  pct_masculino: number
  pct_unissex: number
  concentracao_uf: number
  uf_principal: string | null
  top_ufs: { uf: string; pedidos: number; receita: number; unidades: number; pct: number }[]
  top_cidades: { cidade: string; uf: string; pedidos: number; receita: number; unidades: number }[]
  evolucao: { mes: string; pedidos: number; receita: number; unidades: number }[]
}

type Data = {
  filtros: { meses: number; sku_a: string; sku_b: string }
  produto_a: Resumo
  produto_b: Resumo
  cross_sell: {
    orders_com_a: number
    orders_com_b: number
    orders_com_ambos: number
    suporte_a: number
    suporte_b: number
    suporte_ambos: number
    lift: number
    confianca_a_para_b_pct: number
    confianca_b_para_a_pct: number
  }
  comparativo: any
  insights: any[]
}

const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const COR_A = '#3b82f6'
const COR_B = '#ec4899'
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

export default function ComparativoProdutosPage() {
  const [produtosList, setProdutosList] = useState<{ id: string; sku: string; nome: string; marca: string; genero: string | null; receita: number }[]>([])
  const [skuA, setSkuA] = useState<string>('')
  const [skuB, setSkuB] = useState<string>('')
  const [meses, setMeses] = useState(6)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/admin/produtos-top?meses=6&limit=300')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setProdutosList(j.produtos)
          if (j.produtos.length >= 2) {
            setSkuA(j.produtos[0].sku)
            setSkuB(j.produtos[1].sku)
          }
        }
      })
  }, [])

  const fetchData = useCallback(async () => {
    if (!skuA || !skuB || skuA === skuB) return
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ sku_a: skuA, sku_b: skuB, meses: String(meses) })
      const r = await apiFetch('/api/admin/relatorios/comparativo-produtos?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [skuA, skuB, meses])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🔬 Comparativo de Produtos</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Compare 2 SKUs: preço, margem, público, geografia e cross-sell</p>
        </div>
        <Link href="/admin/comparativo-marcas" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Comparativo Marcas</Link>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_A }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Produto A</label>
            </div>
            <select value={skuA} onChange={(e) => setSkuA(e.target.value)} style={{ ...selectStyle, fontSize: 13, padding: '10px 12px', fontWeight: 600 }}>
              <option value="">Selecione...</option>
              {produtosList.map((p) => <option key={p.sku} value={p.sku}>{p.nome} ({p.sku})</option>)}
            </select>
          </div>
          <div style={{ fontSize: 24, color: 'var(--psh-text-secondary, #9ca3af)', fontWeight: 300, paddingBottom: 8 }}>vs</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_B }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Produto B</label>
            </div>
            <select value={skuB} onChange={(e) => setSkuB(e.target.value)} style={{ ...selectStyle, fontSize: 13, padding: '10px 12px', fontWeight: 600 }}>
              <option value="">Selecione...</option>
              {produtosList.map((p) => <option key={p.sku} value={p.sku}>{p.nome} ({p.sku})</option>)}
            </select>
          </div>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ ...selectStyle, fontSize: 13, padding: '10px 12px' }}>
            <option value={1}>1 mês</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Comparando produtos...</div>
      ) : !data ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Selecione 2 produtos pra comparar</div>
      ) : (
        <ComparativoProdutos data={data} />
      )}
    </div>
  )
}

function ComparativoProdutos({ data }: { data: Data }) {
  const a = data.produto_a
  const b = data.produto_b

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpisProdutos a={a} b={b} />

      {/* Cross-sell entre os 2 produtos */}
      <CrossSellBox cs={data.cross_sell} nomeA={a.nome} nomeB={b.nome} />

      {data.insights.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>💡 Insights do Comparativo</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {data.insights.map((ins, i) => {
              const cor = ins.marca === 'A' ? COR_A : ins.marca === 'B' ? COR_B : 'var(--psh-text-secondary, #6b7280)'
              return (
                <div key={i} style={{ background: INSIGHT_BG[ins.tipo] || 'var(--psh-bg-secondary, #fafbfc)', borderLeft: `4px solid ${INSIGHT_BORDER[ins.tipo] || 'var(--psh-text-secondary, #6b7280)'}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{ins.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{ins.titulo}</span>
                    {ins.marca && <span style={{ padding: '1px 6px', background: cor + '20', color: cor, borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{ins.marca === 'A' ? a.nome.slice(0, 20) : b.nome.slice(0, 20)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', lineHeight: 1.4 }}>{ins.detalhe}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <EvolucaoProdutos a={a} b={b} />

      <ComparativoUfsProd data={data} />

      <TopListasProd a={a} b={b} />
    </div>
  )
}

function KpisProdutos({ a, b }: { a: Resumo; b: Resumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <ProdutoPanel prod={a} cor={COR_A} />
      <ProdutoPanel prod={b} cor={COR_B} />
    </div>
  )
}

function ProdutoPanel({ prod, cor }: { prod: Resumo; cor: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${cor}` }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700 }}>{prod.marca}</span>
          {prod.genero && <span style={{ fontSize: 9, padding: '1px 6px', background: 'var(--psh-bg-secondary, #f3f4f6)', color: 'var(--psh-text-secondary, #6b7280)', borderRadius: 3 }}>{prod.genero}</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', lineHeight: 1.3 }}>{prod.nome}</div>
        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)', fontFamily: 'monospace' }}>{prod.sku}{prod.ean ? ` • EAN ${prod.ean}` : ''}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <Kpi label="Receita" value={fmtBRL(prod.receita)} color={cor} />
        <Kpi label="Unidades" value={prod.unidades.toLocaleString('pt-BR')} color={cor} />
        <Kpi label="Preço médio" value={fmtBRL2(prod.preco_medio)} color={cor} />
        <Kpi label="Pedidos" value={prod.pedidos.toLocaleString('pt-BR')} color={cor} />
      </div>
      {prod.custo > 0 && (
        <div style={{ marginTop: 12, padding: 8, background: prod.margem_pct > 30 ? '#ecfdf5' : prod.margem_pct > 15 ? '#fffbeb' : '#fef2f2', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>Custo: <strong style={{ color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL2(prod.custo)}</strong></span>
          <span style={{ color: prod.margem_pct > 30 ? '#10b981' : prod.margem_pct > 15 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>Margem: {prod.margem_pct.toFixed(0)}%</span>
        </div>
      )}
      {prod.uf_principal && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
          🗺️ Top: <strong style={{ color: 'var(--psh-text-primary, #111827)' }}>{prod.uf_principal}</strong> ({prod.concentracao_uf.toFixed(0)}%)
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

function CrossSellBox({ cs, nomeA, nomeB }: { cs: any; nomeA: string; nomeB: string }) {
  if (cs.orders_com_ambos === 0) {
    return (
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>
        🤝 <strong>Cross-sell:</strong> Nenhum pedido contém ambos os produtos no período. Eles não competem nem se complementam.
      </div>
    )
  }
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>🤝 Cross-sell entre os 2 produtos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Pedidos com A</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{cs.orders_com_a.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Pedidos com B</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ec4899' }}>{cs.orders_com_b.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Pedidos com AMBOS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{cs.orders_com_ambos.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Lift</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: cs.lift > 1.5 ? '#10b981' : cs.lift > 1 ? '#3b82f6' : 'var(--psh-text-secondary, #9ca3af)' }}>{cs.lift.toFixed(2)}x</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Confiança A→B</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{cs.confianca_a_para_b_pct.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase' }}>Confiança B→A</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{cs.confianca_b_para_a_pct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: '#1e40af' }}>
        💡 <strong>Interpretação:</strong> {cs.lift > 2 ? `Lift > 2x: clientes que compram ${nomeA.slice(0, 20)} têm ${cs.lift.toFixed(1)}x mais chance de comprar ${nomeB.slice(0, 20)} também. Excelente candidato a combo!` : cs.lift > 1.5 ? `Lift forte: considere sugerir ${nomeB.slice(0, 20)} na página de ${nomeA.slice(0, 20)}.` : cs.lift > 1 ? `Associação fraca: compartilham público mas não são comprados juntos de forma significativa.` : `Lift < 1: clientes tendem a comprar um OU outro (substitutos).`}
      </div>
    </div>
  )
}

function EvolucaoProdutos({ a, b }: { a: Resumo; b: Resumo }) {
  const mesesSet = new Set([...a.evolucao.map((m) => m.mes), ...b.evolucao.map((m) => m.mes)])
  const meses = Array.from(mesesSet).sort()
  if (meses.length === 0) return null

  const maxReceita = Math.max(...a.evolucao.map((m) => m.receita), ...b.evolucao.map((m) => m.receita), 1)
  const W = 700, H = 200, P = 40
  const stepX = meses.length > 1 ? (W - 2 * P) / (meses.length - 1) : 0

  const points = (arr: { mes: string; receita: number }[]) => arr.map((m) => {
    const idx = meses.indexOf(m.mes)
    return [P + idx * stepX, H - P - (m.receita / maxReceita) * (H - 2 * P), m]
  })
  const ptsA = points(a.evolucao)
  const ptsB = points(b.evolucao)
  const linePath = (pts: any[]) => pts.reduce((acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`), '')

  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>📈 Evolução Mensal (Receita)</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_A }} />{a.nome.slice(0, 30)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_B }} />{b.nome.slice(0, 30)}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <line key={p} x1={P} y1={y} x2={W - P} y2={y} stroke="#e5e7eb" strokeWidth="1" />
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <text key={p} x={P - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtBRL(p * maxReceita)}</text>
        })}
        {meses.map((m, i) => <text key={m} x={P + i * stepX} y={H - P + 14} textAnchor="middle" fontSize="10" fill="#6b7280">{formatMes(m)}</text>)}
        <path d={linePath(ptsA)} stroke={COR_A} strokeWidth="2.5" fill="none" />
        <path d={linePath(ptsB)} stroke={COR_B} strokeWidth="2.5" fill="none" />
        {ptsA.map(([x, y, m]: any) => <circle key={m.mes} cx={x} cy={y} r="3" fill={COR_A}><title>{a.nome} {formatMes(m.mes)}: {fmtBRL(m.receita)}</title></circle>)}
        {ptsB.map(([x, y, m]: any) => <circle key={m.mes} cx={x} cy={y} r="3" fill={COR_B}><title>{b.nome} {formatMes(m.mes)}: {fmtBRL(m.receita)}</title></circle>)}
      </svg>
    </div>
  )
}

function formatMes(mes: string) {
  if (!mes || mes === 'sem-data') return '—'
  const [y, m] = mes.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1]}/${y.slice(2)}`
}

function ComparativoUfsProd({ data }: { data: Data }) {
  const a = data.produto_a
  const b = data.produto_b
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      <CardUfs titulo={`🏆 Onde ${a.nome.slice(0, 20)} GANHA`} cor={COR_A} items={data.comparativo.ufs_onde_a_ganha} prefix="a" a={a} b={b} />
      <CardUfs titulo={`🏆 Onde ${b.nome.slice(0, 20)} GANHA`} cor={COR_B} items={data.comparativo.ufs_onde_b_ganha} prefix="b" a={a} b={b} />
      <CardUfs titulo="⚖️ Onde EMPATAM" cor="#6b7280" items={data.comparativo.ufs_empatadas} prefix="e" a={a} b={b} />
    </div>
  )
}

function CardUfs({ titulo, cor, items, prefix, a, b }: { titulo: string; cor: string; items: any[]; prefix: string; a: any; b: any }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${cor}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: cor, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((c) => (
          <div key={c.uf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
            <div style={{ width: 28, textAlign: 'center', fontWeight: 700, color: cor, fontSize: 11 }}>{c.uf}</div>
            <div style={{ flex: 1, fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>{UF_NOMES[c.uf] || c.uf}</div>
            <div style={{ textAlign: 'right', fontSize: 10 }}>
              {prefix !== 'b' && <div style={{ color: COR_A, fontWeight: 700 }}>{fmtBRL(c.receita_a)}</div>}
              {prefix !== 'a' && <div style={{ color: COR_B, fontWeight: 700 }}>{fmtBRL(c.receita_b)}</div>}
            </div>
          </div>
        ))}
        {items.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum estado</div>}
      </div>
    </div>
  )
}

function TopListasProd({ a, b }: { a: Resumo; b: Resumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>🗺️ Top 10 UFs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopList titulo={a.nome.slice(0, 22)} cor={COR_A} items={a.top_ufs.map((u) => ({ primary: u.uf, secondary: UF_NOMES[u.uf] || u.uf, value: u.receita, pct: u.pct, subValue: `${u.pedidos} ped` }))} />
          <TopList titulo={b.nome.slice(0, 22)} cor={COR_B} items={b.top_ufs.map((u) => ({ primary: u.uf, secondary: UF_NOMES[u.uf] || u.uf, value: u.receita, pct: u.pct, subValue: `${u.pedidos} ped` }))} />
        </div>
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>🏙️ Top 10 Cidades</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopList titulo={a.nome.slice(0, 22)} cor={COR_A} items={a.top_cidades.map((c) => ({ primary: c.cidade, secondary: c.uf, value: c.receita, subValue: `${c.pedidos} ped` }))} />
          <TopList titulo={b.nome.slice(0, 22)} cor={COR_B} items={b.top_cidades.map((c) => ({ primary: c.cidade, secondary: c.uf, value: c.receita, subValue: `${c.pedidos} ped` }))} />
        </div>
      </div>
    </div>
  )
}

function TopList({ titulo, cor, items }: { titulo: string; cor: string; items: any[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: cor, marginBottom: 4, textTransform: 'uppercase' }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.slice(0, 5).map((it, i) => (
          <div key={i} style={{ padding: 4, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{it.primary}</span>
              <span style={{ color: cor, fontWeight: 700, fontSize: 9 }}>{fmtBRL(it.value)}</span>
            </div>
            {it.pct !== undefined && it.pct > 0 && (
              <div style={{ height: 3, background: 'var(--psh-border, #e5e7eb)', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                <div style={{ width: `${it.pct}%`, height: '100%', background: cor }} />
              </div>
            )}
            {it.subValue && <div style={{ fontSize: 8, color: 'var(--psh-text-secondary, #9ca3af)', marginTop: 1 }}>{it.subValue}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
