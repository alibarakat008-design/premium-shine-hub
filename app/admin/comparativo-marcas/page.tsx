'use client'

/**
 * COMPARATIVO DE MARCAS
 * Compara 2 marcas lado a lado:
 * - KPIs (receita, pedidos, ticket médio, % genero)
 * - Top UFs / Cidades / Produtos de cada
 * - Evolução mensal (gráfico)
 * - Insights automáticos: onde A ganha, onde B ganha, onde empatam
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Resumo = {
  nome: string
  pedidos: number
  itens: number
  receita: number
  preco_medio: number
  ticket_medio: number
  pct_feminino: number
  pct_masculino: number
  pct_unissex: number
  concentracao_uf: number
  uf_principal: string | null
  top_ufs: { uf: string; pedidos: number; receita: number; unidades: number; pct: number }[]
  top_cidades: { cidade: string; uf: string; pedidos: number; receita: number; unidades: number }[]
  top_produtos: { sku: string; nome: string; unidades: number; receita: number; preco_medio: number }[]
  evolucao: { mes: string; pedidos: number; receita: number; unidades: number }[]
}

type Insight = { emoji: string; tipo: 'positivo' | 'atencao' | 'info'; titulo: string; detalhe: string; marca?: 'A' | 'B' }

type Data = {
  filtros: { meses: number; marca_a: string; marca_b: string }
  marca_a: Resumo
  marca_b: Resumo
  comparativo: {
    receita_diff_pct: number
    ticket_diff_pct: number
    ufs_onde_a_ganha: { uf: string; receita_a: number; receita_b: number; vencedor: string; diff_pct: number }[]
    ufs_onde_b_ganha: any[]
    ufs_empatadas: any[]
    ufs_total: number
  }
  insights: Insight[]
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

const INSIGHT_BG: Record<string, string> = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: Record<string, string> = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

const COR_A = '#3b82f6' // azul
const COR_B = '#ec4899' // rosa

export default function ComparativoMarcasPage() {
  const [marcasList, setMarcasList] = useState<{ id: string; nome: string; total_produtos: number }[]>([])
  const [marcaA, setMarcaA] = useState<string>('ISABELLE LA BELLE')
  const [marcaB, setMarcaB] = useState<string>('BARBOURS')
  const [meses, setMeses] = useState(6)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/admin/marcas-disponiveis')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setMarcasList(j.marcas) })
  }, [])

  const fetchData = useCallback(async () => {
    if (!marcaA || !marcaB || marcaA === marcaB) return
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ marca_a: marcaA, marca_b: marcaB, meses: String(meses) })
      const r = await apiFetch('/api/admin/relatorios/comparativo-marcas?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [marcaA, marcaB, meses])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>⚖️ Comparativo de Marcas</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Compare 2 marcas lado a lado: receita, perfil, geografia e produtos</p>
        </div>
        <Link href="/admin/geografico" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Geografia</Link>
      </div>

      {/* Seletores */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_A }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Marca A</label>
            </div>
            <select value={marcaA} onChange={(e) => setMarcaA(e.target.value)} style={{ ...selectStyle, fontSize: 14, padding: '10px 12px', fontWeight: 600 }}>
              {marcasList.map((m) => <option key={m.id} value={m.nome}>{m.nome} ({m.total_produtos})</option>)}
            </select>
          </div>
          <div style={{ fontSize: 24, color: 'var(--psh-text-secondary, #9ca3af)', fontWeight: 300, paddingBottom: 8 }}>vs</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_B }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Marca B</label>
            </div>
            <select value={marcaB} onChange={(e) => setMarcaB(e.target.value)} style={{ ...selectStyle, fontSize: 14, padding: '10px 12px', fontWeight: 600 }}>
              {marcasList.map((m) => <option key={m.id} value={m.nome}>{m.nome} ({m.total_produtos})</option>)}
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
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Comparando {marcaA} vs {marcaB}...</div>
      ) : !data || (data.marca_a.receita === 0 && data.marca_b.receita === 0) ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          {data ? `Nenhuma venda de ${marcaA} ou ${marcaB} no período. Tente marcas diferentes.` : 'Carregando...'}
        </div>
      ) : (
        <Comparativo data={data} />
      )}
    </div>
  )
}

function Comparativo({ data }: { data: Data }) {
  const a = data.marca_a
  const b = data.marca_b

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header com KPIs lado a lado */}
      <KpisHeader a={a} b={b} />

      {/* Insights */}
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
                    {ins.marca && <span style={{ padding: '1px 6px', background: cor + '20', color: cor, borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{ins.marca === 'A' ? a.nome : b.nome}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', lineHeight: 1.4 }}>{ins.detalhe}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gênero (pizza comparativa) */}
      <GeneroComparativo a={a} b={b} />

      {/* Evolução mensal (gráfico de linhas) */}
      <EvolucaoComparativa a={a} b={b} />

      {/* Onde A ganha / B ganha / Empatam */}
      <ComparativoUfs data={data} />

      {/* Top UFs / Cidades / Produtos (3 colunas) */}
      <TopListasComparativas a={a} b={b} />
    </div>
  )
}

function KpisHeader({ a, b }: { a: Resumo; b: Resumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <MarcaPanel marca={a} cor={COR_A} />
      <MarcaPanel marca={b} cor={COR_B} />
    </div>
  )
}

function MarcaPanel({ marca, cor }: { marca: Resumo; cor: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: cor, color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{marca.nome.charAt(0)}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{marca.nome}</div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{marca.itens} un. vendidas</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <Kpi label="Receita" value={fmtBRL(marca.receita)} color={cor} />
        <Kpi label="Pedidos" value={marca.pedidos.toLocaleString('pt-BR')} color={cor} />
        <Kpi label="Ticket médio" value={fmtBRL2(marca.ticket_medio)} color={cor} />
        <Kpi label="Preço médio" value={fmtBRL2(marca.preco_medio)} color={cor} />
      </div>
      <div style={{ marginTop: 12, padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span>♀ {marca.pct_feminino.toFixed(0)}%</span>
        <span>♂ {marca.pct_masculino.toFixed(0)}%</span>
        <span>◇ {marca.pct_unissex.toFixed(0)}%</span>
      </div>
      {marca.uf_principal && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
          🗺️ Top: <strong style={{ color: 'var(--psh-text-primary, #111827)' }}>{marca.uf_principal}</strong> ({marca.concentracao_uf.toFixed(0)}% concentração)
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

function GeneroComparativo({ a, b }: { a: Resumo; b: Resumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <PizzaGenero marca={a} cor={COR_A} titulo="Perfil de público — A" />
      <PizzaGenero marca={b} cor={COR_B} titulo="Perfil de público — B" />
    </div>
  )
}

function PizzaGenero({ marca, cor, titulo }: { marca: Resumo; cor: string; titulo: string }) {
  const total = marca.pct_feminino + marca.pct_masculino + marca.pct_unissex
  if (total === 0) {
    return (
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>{titulo}</div>
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 12 }}>Sem dados de gênero</div>
      </div>
    )
  }

  const pctF = marca.pct_feminino / total
  const pctM = marca.pct_masculino / total
  const pctU = marca.pct_unissex / total

  // Pizza SVG
  const cx = 80, cy = 80, r = 60
  const angleF = pctF * 360
  const angleM = pctM * 360
  const angleU = pctU * 360

  const polar = (cx: number, cy: number, r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const arc = (start: number, end: number) => {
    if (end - start >= 360) end = start + 359.99
    const [x1, y1] = polar(cx, cy, r, start)
    const [x2, y2] = polar(cx, cy, r, end)
    const large = end - start > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
  }

  let acc = 0
  const pathF = pctF > 0 ? arc(acc, acc + angleF) : ''
  acc += angleF
  const pathM = pctM > 0 ? arc(acc, acc + angleM) : ''
  acc += angleM
  const pathU = pctU > 0 ? arc(acc, acc + angleU) : ''

  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          {pathF && <path d={pathF} fill="#ec4899" />}
          {pathM && <path d={pathM} fill="#3b82f6" />}
          {pathU && <path d={pathU} fill="#a78bfa" />}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <LegendItem color="#ec4899" label="Feminino" pct={marca.pct_feminino} />
          <LegendItem color="#3b82f6" label="Masculino" pct={marca.pct_masculino} />
          <LegendItem color="#a78bfa" label="Unissex" pct={marca.pct_unissex} />
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
      <span style={{ flex: 1, color: 'var(--psh-text-primary, #374151)' }}>{label}</span>
      <span style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 700 }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function EvolucaoComparativa({ a, b }: { a: Resumo; b: Resumo }) {
  // Pega união de meses
  const mesesSet = new Set([...a.evolucao.map((m) => m.mes), ...b.evolucao.map((m) => m.mes)])
  const meses = Array.from(mesesSet).sort()
  if (meses.length === 0) return null

  const maxReceita = Math.max(...a.evolucao.map((m) => m.receita), ...b.evolucao.map((m) => m.receita), 1)
  const W = 700, H = 200, P = 40
  const stepX = meses.length > 1 ? (W - 2 * P) / (meses.length - 1) : 0

  const points = (arr: { mes: string; receita: number }[]) => {
    return arr.map((m, i) => {
      const idx = meses.indexOf(m.mes)
      const x = P + idx * stepX
      const y = H - P - (m.receita / maxReceita) * (H - 2 * P)
      return [x, y, m]
    })
  }
  const ptsA = points(a.evolucao)
  const ptsB = points(b.evolucao)

  const linePath = (pts: (number | { mes: string; receita: number })[][]) => {
    if (pts.length === 0) return ''
    return pts.reduce((acc, p, i) => {
      const [x, y] = p as number[]
      return acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`)
    }, '')
  }

  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>📈 Evolução Mensal (Receita)</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_A }} />{a.nome}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_B }} />{b.nome}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <line key={p} x1={P} y1={y} x2={W - P} y2={y} stroke="#e5e7eb" strokeWidth="1" />
        })}
        {/* Labels eixo Y */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <text key={p} x={P - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtBRL(p * maxReceita)}</text>
        })}
        {/* Labels eixo X */}
        {meses.map((m, i) => {
          const x = P + i * stepX
          return <text key={m} x={x} y={H - P + 14} textAnchor="middle" fontSize="10" fill="#6b7280">{formatMes(m)}</text>
        })}
        {/* Linhas */}
        <path d={linePath(ptsA)} stroke={COR_A} strokeWidth="2.5" fill="none" />
        <path d={linePath(ptsB)} stroke={COR_B} strokeWidth="2.5" fill="none" />
        {/* Pontos */}
        {ptsA.map(([x, y, m]: any) => (
          <g key={m.mes}>
            <circle cx={x} cy={y} r="3" fill={COR_A} />
            <title>{a.nome} {formatMes(m.mes)}: {fmtBRL(m.receita)}</title>
          </g>
        ))}
        {ptsB.map(([x, y, m]: any) => (
          <g key={m.mes}>
            <circle cx={x} cy={y} r="3" fill={COR_B} />
            <title>{b.nome} {formatMes(m.mes)}: {fmtBRL(m.receita)}</title>
          </g>
        ))}
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

function ComparativoUfs({ data }: { data: Data }) {
  const a = data.marca_a
  const b = data.marca_b
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      {/* Onde A ganha */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${COR_A}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COR_A, marginBottom: 8 }}>🏆 Onde {a.nome} GANHA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.comparativo.ufs_onde_a_ganha.map((c) => (
            <div key={c.uf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
              <div style={{ width: 28, textAlign: 'center', fontWeight: 700, color: COR_A, fontSize: 11 }}>{c.uf}</div>
              <div style={{ flex: 1, fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>{UF_NOMES[c.uf] || c.uf}</div>
              <div style={{ textAlign: 'right', fontSize: 10 }}>
                <div style={{ color: COR_A, fontWeight: 700 }}>{fmtBRL(c.receita_a)}</div>
                <div style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>vs {fmtBRL(c.receita_b)}</div>
              </div>
            </div>
          ))}
          {data.comparativo.ufs_onde_a_ganha.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum estado</div>}
        </div>
      </div>

      {/* Onde B ganha */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${COR_B}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COR_B, marginBottom: 8 }}>🏆 Onde {b.nome} GANHA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.comparativo.ufs_onde_b_ganha.map((c: any) => (
            <div key={c.uf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
              <div style={{ width: 28, textAlign: 'center', fontWeight: 700, color: COR_B, fontSize: 11 }}>{c.uf}</div>
              <div style={{ flex: 1, fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>{UF_NOMES[c.uf] || c.uf}</div>
              <div style={{ textAlign: 'right', fontSize: 10 }}>
                <div style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>{fmtBRL(c.receita_a)}</div>
                <div style={{ color: COR_B, fontWeight: 700 }}>vs {fmtBRL(c.receita_b)}</div>
              </div>
            </div>
          ))}
          {data.comparativo.ufs_onde_b_ganha.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum estado</div>}
        </div>
      </div>

      {/* Onde empatam */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: '4px solid #6b7280' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 8 }}>⚖️ Onde EMPATAM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.comparativo.ufs_empatadas.map((c: any) => (
            <div key={c.uf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
              <div style={{ width: 28, textAlign: 'center', fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)', fontSize: 11 }}>{c.uf}</div>
              <div style={{ flex: 1, fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>{UF_NOMES[c.uf] || c.uf}</div>
              <div style={{ textAlign: 'right', fontSize: 10 }}>
                <div style={{ color: 'var(--psh-text-primary, #374151)' }}>{fmtBRL(c.receita_a)} ≈ {fmtBRL(c.receita_b)}</div>
                <div style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>diff {c.diff_pct.toFixed(0)}%</div>
              </div>
            </div>
          ))}
          {data.comparativo.ufs_empatadas.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum empate</div>}
        </div>
      </div>
    </div>
  )
}

function TopListasComparativas({ a, b }: { a: Resumo; b: Resumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      {/* Top UFs */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>🗺️ Top 10 UFs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopList titulo={a.nome} cor={COR_A} items={a.top_ufs.map((u) => ({ primary: u.uf, secondary: UF_NOMES[u.uf] || u.uf, value: u.receita, pct: u.pct, subValue: `${u.pedidos} ped` }))} />
          <TopList titulo={b.nome} cor={COR_B} items={b.top_ufs.map((u) => ({ primary: u.uf, secondary: UF_NOMES[u.uf] || u.uf, value: u.receita, pct: u.pct, subValue: `${u.pedidos} ped` }))} />
        </div>
      </div>

      {/* Top Cidades */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>🏙️ Top 10 Cidades</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopList titulo={a.nome} cor={COR_A} items={a.top_cidades.map((c) => ({ primary: c.cidade, secondary: c.uf, value: c.receita, subValue: `${c.pedidos} ped` }))} />
          <TopList titulo={b.nome} cor={COR_B} items={b.top_cidades.map((c) => ({ primary: c.cidade, secondary: c.uf, value: c.receita, subValue: `${c.pedidos} ped` }))} />
        </div>
      </div>

      {/* Top Produtos */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>🛍️ Top 10 Produtos</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopList titulo={a.nome} cor={COR_A} items={a.top_produtos.map((p) => ({ primary: p.nome, value: p.receita, subValue: `×${p.unidades} • ${fmtBRL2(p.preco_medio)}` }))} />
          <TopList titulo={b.nome} cor={COR_B} items={b.top_produtos.map((p) => ({ primary: p.nome, value: p.receita, subValue: `×${p.unidades} • ${fmtBRL2(p.preco_medio)}` }))} />
        </div>
      </div>
    </div>
  )
}

function TopList({ titulo, cor, items }: { titulo: string; cor: string; items: { primary: string; secondary?: string; value: number; pct?: number; subValue?: string }[] }) {
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
