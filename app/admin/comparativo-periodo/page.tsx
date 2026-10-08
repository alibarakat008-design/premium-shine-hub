'use client'

/**
 * COMPARATIVO DE PERÍODO
 * Compara 2 janelas temporais (ex: Q1 2026 vs Q2 2026)
 * - KPIs: receita, pedidos, ticket, unidades, cancelamento
 * - Variação % entre A e B
 * - Top UFs / Cidades / Marcas / Produtos
 * - Produtos que MAIS subiram / MAIS caíram
 * - Evolução diária sobreposta
 * - Insights: o que mudou
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type PeriodoResumo = {
  pedidos: number
  pedidos_cancelados: number
  pedidos_validos: number
  receita: number
  unidades: number
  ticket_medio: number
  pct_cancelamento: number
  top_ufs: { uf?: string; pedidos: number; receita: number }[]
  top_cidades: { uf?: string; cidade?: string; pedidos: number; receita: number }[]
  top_marcas: { pedidos: number; receita: number; unidades: number }[]
  top_produtos: { sku: string; nome: string; pedidos: number; receita: number; unidades: number; genero: string | null }[]
  genero: { feminino: number; masculino: number; unissex: number; indefinido: number }
  evolucao: { data: string; pedidos: number; receita: number; unidades: number }[]
}

type Data = {
  filtros: any
  dias_periodo_a: number
  dias_periodo_b: number
  periodo_a: PeriodoResumo
  periodo_b: PeriodoResumo
  variacoes: { receita: number; pedidos: number; unidades: number; ticket: number; cancelamento_pp: number }
  top_subindo: { sku: string; nome: string; receita_a: number; receita_b: number; variacao_pct: number }[]
  top_caindo: { sku: string; nome: string; receita_a: number; receita_b: number; variacao_pct: number }[]
  insights: any[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const COR_A = '#3b82f6'
const COR_B = '#ec4899'
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

export default function ComparativoPeriodoPage() {
  // Preset: Q1 2026 vs Q2 2026
  const [inicioA, setInicioA] = useState('2025-01-01')
  const [fimA, setFimA] = useState('2025-03-31')
  const [inicioB, setInicioB] = useState('2026-01-01')
  const [fimB, setFimB] = useState('2026-03-31')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!inicioA || !fimA || !inicioB || !fimB) return
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ inicio_a: inicioA, fim_a: fimA, inicio_b: inicioB, fim_b: fimB })
      const r = await apiFetch('/api/admin/relatorios/comparativo-periodo?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [inicioA, fimA, inicioB, fimB])

  useEffect(() => { fetchData() }, [fetchData])

  const aplicarPreset = (preset: 'mes_passado' | 'mes_ano_anterior' | 'q1_q2' | 'semestre' | 'custom') => {
    const today = new Date()
    const fmtD = (d: Date) => d.toISOString().slice(0, 10)
    const subDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() - n); return x }
    const subMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() - n); return x }
    if (preset === 'mes_passado') {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - 86400000)
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1)
      setInicioA(fmtD(firstOfLastMonth)); setFimA(fmtD(lastOfLastMonth))
      const twoMonthsAgo = subMonths(firstOfThisMonth, 2)
      setInicioB(fmtD(twoMonthsAgo)); setFimB(fmtD(new Date(twoMonthsAgo.getFullYear(), twoMonthsAgo.getMonth() + 1, 0)))
    } else if (preset === 'mes_ano_anterior') {
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      const firstOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
      setInicioA(fmtD(firstOfLastMonth)); setFimA(fmtD(lastMonth))
      const anoAnterior = new Date(lastMonth.getFullYear() - 1, lastMonth.getMonth() + 1, 0)
      const inicioAnterior = new Date(anoAnterior.getFullYear(), anoAnterior.getMonth(), 1)
      setInicioB(fmtD(inicioAnterior)); setFimB(fmtD(anoAnterior))
    } else if (preset === 'q1_q2') {
      setInicioA(`${today.getFullYear() - 1}-01-01`); setFimA(`${today.getFullYear() - 1}-03-31`)
      setInicioB(`${today.getFullYear()}-01-01`); setFimB(`${today.getFullYear()}-03-31`)
    } else if (preset === 'semestre') {
      const today6m = subMonths(today, 6)
      setInicioA(fmtD(today6m)); setFimA(fmtD(today))
      const today12m = subMonths(today, 12)
      const today6m_ant = subMonths(today, 12)
      setInicioB(fmtD(subMonths(today6m_ant, 6))); setFimB(fmtD(today6m_ant))
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📅 Comparativo de Período</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Compare 2 janelas temporais: Mês vs Mês, Q1 vs Q2, Ano vs Ano</p>
        </div>
        <Link href="/admin/dashboard" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Dashboard</Link>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => aplicarPreset('mes_passado')} style={presetBtn}>Mês atual vs anterior</button>
          <button onClick={() => aplicarPreset('mes_ano_anterior')} style={presetBtn}>Mês vs mesmo mês ano anterior</button>
          <button onClick={() => aplicarPreset('q1_q2')} style={presetBtn}>Q1 ano atual vs anterior</button>
          <button onClick={() => aplicarPreset('semestre')} style={presetBtn}>6 meses vs 6 meses anteriores</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_A }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Período A</label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={inicioA} onChange={(e) => setInicioA(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
              <span style={{ alignSelf: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>até</span>
              <input type="date" value={fimA} onChange={(e) => setFimA(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: COR_B }} />
              <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, textTransform: 'uppercase' }}>Período B</label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={inicioB} onChange={(e) => setInicioB(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
              <span style={{ alignSelf: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>até</span>
              <input type="date" value={fimB} onChange={(e) => setFimB(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
            </div>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Comparando períodos...</div>
      ) : !data ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Selecione 2 períodos pra comparar</div>
      ) : (
        <Comparativo data={data} />
      )}
    </div>
  )
}

function Comparativo({ data }: { data: Data }) {
  const a = data.periodo_a
  const b = data.periodo_b
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpisPeriodo a={a} b={b} diasA={data.dias_periodo_a} diasB={data.dias_periodo_b} variacoes={data.variacoes} />

      {data.insights.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Insights</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {data.insights.map((ins, i) => (
              <div key={i} style={{ background: INSIGHT_BG[ins.tipo] || 'var(--psh-bg-secondary, #fafbfc)', borderLeft: `4px solid ${INSIGHT_BORDER[ins.tipo] || 'var(--psh-text-secondary, #6b7280)'}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{ins.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{ins.titulo}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', lineHeight: 1.4 }}>{ins.detalhe}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <EvolucaoDiaria a={a} b={b} />

      <SubindoCaindo data={data} />

      <TopListasPeriodo a={a} b={b} />
    </div>
  )
}

function KpisPeriodo({ a, b, diasA, diasB, variacoes }: { a: PeriodoResumo; b: PeriodoResumo; diasA: number; diasB: number; variacoes: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' }}>
      <PeriodoPanel p={a} cor={COR_A} dias={diasA} label="A" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}>
        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Variação B vs A</div>
        <Variacao val={variacoes.receita} label="Receita" cor="#3b82f6" />
        <Variacao val={variacoes.pedidos} label="Pedidos" cor="#3b82f6" />
        <Variacao val={variacoes.ticket} label="Ticket" cor="#3b82f6" />
        <Variacao val={variacoes.unidades} label="Unidades" cor="#3b82f6" />
        <Variacao val={variacoes.cancelamento_pp} label="Cancel. (pp)" cor="#ef4444" />
      </div>
      <PeriodoPanel p={b} cor={COR_B} dias={diasB} label="B" />
    </div>
  )
}

function Variacao({ val, label, cor }: { val: number; label: string; cor: string }) {
  const positivo = val > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
      <span style={{ color: 'var(--psh-text-secondary, #6b7280)', minWidth: 60 }}>{label}</span>
      <span style={{ padding: '2px 8px', background: val > 0 ? '#d1fae5' : val < 0 ? '#fee2e2' : 'var(--psh-bg-secondary, #f3f4f6)', color: val > 0 ? '#065f46' : val < 0 ? '#991b1b' : 'var(--psh-text-primary, #374151)', borderRadius: 4, fontWeight: 700, fontSize: 11, minWidth: 50, textAlign: 'center' }}>
        {positivo ? '↑' : val < 0 ? '↓' : '='} {Math.abs(val).toFixed(1)}{label.includes('pp') ? 'pp' : '%'}
      </span>
    </div>
  )
}

function PeriodoPanel({ p, cor, dias, label }: { p: PeriodoResumo; cor: string; dias: number; label: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: cor, color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{label}</div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Período {label}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{dias} dias</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <Kpi label="Receita" value={fmtBRL(p.receita)} color={cor} />
        <Kpi label="Pedidos" value={p.pedidos.toLocaleString('pt-BR')} color={cor} />
        <Kpi label="Ticket médio" value={fmtBRL2(p.ticket_medio)} color={cor} />
        <Kpi label="Unidades" value={p.unidades.toLocaleString('pt-BR')} color={cor} />
      </div>
      <div style={{ marginTop: 12, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
        Cancelados: {p.pedidos_cancelados} ({p.pct_cancelamento.toFixed(1)}%) • Válidos: {p.pedidos_validos}
      </div>
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

function EvolucaoDiaria({ a, b }: { a: PeriodoResumo; b: PeriodoResumo }) {
  const maxReceita = Math.max(...a.evolucao.map((d) => d.receita), ...b.evolucao.map((d) => d.receita), 1)
  const W = 800, H = 220, P = 40
  const maxDias = Math.max(a.evolucao.length, b.evolucao.length, 1)
  const stepX = maxDias > 1 ? (W - 2 * P) / (maxDias - 1) : 0

  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>📈 Evolução Diária (Receita)</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_A }} />Período A ({a.evolucao.length} dias)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 3, background: COR_B }} />Período B ({b.evolucao.length} dias)</span>
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
        {/* A */}
        <path
          d={a.evolucao.map((d, i) => {
            const x = P + i * stepX
            const y = H - P - (d.receita / maxReceita) * (H - 2 * P)
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          }).join(' ')}
          stroke={COR_A} strokeWidth="2" fill="none"
        />
        {/* B */}
        <path
          d={b.evolucao.map((d, i) => {
            const x = P + i * stepX
            const y = H - P - (d.receita / maxReceita) * (H - 2 * P)
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          }).join(' ')}
          stroke={COR_B} strokeWidth="2" fill="none" strokeDasharray="4 2"
        />
      </svg>
    </div>
  )
}

function SubindoCaindo({ data }: { data: Data }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: '4px solid #10b981' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>📈 Top 5 que MAIS SUBIRAM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.top_subindo.map((p, i) => (
            <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: '#ecfdf5', borderRadius: 4 }}>
              <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: '#10b981', fontSize: 11 }}>#{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 9 }}>{fmtBRL(p.receita_a)} → {fmtBRL(p.receita_b)}</div>
              </div>
              <div style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>↑ {p.variacao_pct.toFixed(0)}%</div>
            </div>
          ))}
          {data.top_subindo.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum produto com crescimento</div>}
        </div>
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: '4px solid #ef4444' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>📉 Top 5 que MAIS CAÍRAM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.top_caindo.map((p, i) => (
            <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: '#fef2f2', borderRadius: 4 }}>
              <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: '#ef4444', fontSize: 11 }}>#{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 9 }}>{fmtBRL(p.receita_a)} → {fmtBRL(p.receita_b)}</div>
              </div>
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>↓ {Math.abs(p.variacao_pct).toFixed(0)}%</div>
            </div>
          ))}
          {data.top_caindo.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Nenhum produto com queda</div>}
        </div>
      </div>
    </div>
  )
}

function TopListasPeriodo({ a, b }: { a: PeriodoResumo; b: PeriodoResumo }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
      <TopPanel titulo="🗺️ Top UFs" corA={COR_A} corB={COR_B} itemsA={a.top_ufs} itemsB={b.top_ufs} labelA="A" labelB="B" keyName="uf" />
      <TopPanel titulo="🏙️ Top Cidades" corA={COR_A} corB={COR_B} itemsA={a.top_cidades} itemsB={b.top_cidades} labelA="A" labelB="B" keyName="cidade" />
      <TopPanelMarcas titulo="🏷️ Top Marcas" corA={COR_A} corB={COR_B} itemsA={a.top_marcas} itemsB={b.top_marcas} labelA="A" labelB="B" />
      <TopPanel titulo="🛍️ Top Produtos" corA={COR_A} corB={COR_B} itemsA={a.top_produtos} itemsB={b.top_produtos} labelA="A" labelB="B" keyName="nome" />
    </div>
  )
}

function TopPanel({ titulo, corA, corB, itemsA, itemsB, labelA, labelB, keyName }: { titulo: string; corA: string; corB: string; itemsA: any[]; itemsB: any[]; labelA: string; labelB: string; keyName: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: corA, marginBottom: 4, textTransform: 'uppercase' }}>A</div>
          {itemsA.slice(0, 5).map((it: any, i) => (
            <div key={i} style={{ padding: 3, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{it[keyName] || it.uf || '—'}</span>
                <span style={{ color: corA, fontWeight: 700 }}>{fmtBRL(it.receita)}</span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: corB, marginBottom: 4, textTransform: 'uppercase' }}>B</div>
          {itemsB.slice(0, 5).map((it: any, i) => (
            <div key={i} style={{ padding: 3, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{it[keyName] || it.uf || '—'}</span>
                <span style={{ color: corB, fontWeight: 700 }}>{fmtBRL(it.receita)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TopPanelMarcas({ titulo, corA, corB, itemsA, itemsB, labelA, labelB }: { titulo: string; corA: string; corB: string; itemsA: any[]; itemsB: any[]; labelA: string; labelB: string }) {
  // Pra marcas, itemsA não tem nome... vou ter que buscar
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: corA, marginBottom: 4, textTransform: 'uppercase' }}>A</div>
          {itemsA.slice(0, 5).map((it: any, i) => (
            <div key={i} style={{ padding: 3, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>Marca #{i + 1}</span>
                <span style={{ color: corA, fontWeight: 700 }}>{fmtBRL(it.receita)}</span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: corB, marginBottom: 4, textTransform: 'uppercase' }}>B</div>
          {itemsB.slice(0, 5).map((it: any, i) => (
            <div key={i} style={{ padding: 3, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>Marca #{i + 1}</span>
                <span style={{ color: corB, fontWeight: 700 }}>{fmtBRL(it.receita)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const presetBtn: React.CSSProperties = { padding: '6px 12px', background: 'var(--psh-bg-primary, white)', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, color: 'var(--psh-text-primary, #374151)', cursor: 'pointer', fontWeight: 500 }
