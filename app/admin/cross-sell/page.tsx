'use client'

/**
 * CROSS-SELL AUTOMÁTICO
 * Market Basket Analysis: encontra pares de produtos comprados juntos
 * - Métricas: support, confidence, lift
 * - Top pares (todos)
 * - Cross-brand (pares entre marcas diferentes)
 * - Line extension (mesma marca)
 * - Combos femininos
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Par = {
  sku_a: string; nome_a: string; marca_a: string; genero_a: string | null
  sku_b: string; nome_b: string; marca_b: string; genero_b: string | null
  orders_com_ambos: number
  orders_com_a: number
  orders_com_b: number
  support_pct: number
  confidence_a_para_b: number
  confidence_b_para_a: number
  lift: number
  score: number
}

type Data = {
  filtros: { meses: number; min_support_pct: number; min_lift: number; marca_id: string | null }
  total_orders: number
  total_produtos_unicos: number
  total_pares_analisados: number
  total_pares_acima_threshold: number
  top_pares: Par[]
  cross_brand: Par[]
  same_brand: Par[]
  insights: any[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

export default function CrossSellPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meses, setMeses] = useState(6)
  const [minSupport, setMinSupport] = useState(1)
  const [minLift, setMinLift] = useState(1.2)
  const [tab, setTab] = useState<'todos' | 'cross-brand' | 'same-brand'>('todos')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ meses: String(meses), min_support: String(minSupport), min_lift: String(minLift), top: '100' })
      const r = await apiFetch('/api/admin/relatorios/cross-sell?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [meses, minSupport, minLift])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🤝 Cross-Sell Automático</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Market Basket Analysis: produtos comprados juntos (com lift, confiança e suporte)</p>
        </div>
        <Link href="/admin/comparativo-marcas" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Comparativo Marcas</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Período</label>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={selectStyle}>
            <option value={1}>1 mês</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Suporte mín.</label>
          <select value={minSupport} onChange={(e) => setMinSupport(Number(e.target.value))} style={selectStyle}>
            <option value={0.5}>0.5%</option>
            <option value={1}>1%</option>
            <option value={2}>2%</option>
            <option value={5}>5%</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Lift mín.</label>
          <select value={minLift} onChange={(e) => setMinLift(Number(e.target.value))} style={selectStyle}>
            <option value={1}>1.0x (qualquer)</option>
            <option value={1.2}>1.2x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x (forte)</option>
            <option value={3}>3.0x (muito forte)</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
          {data ? `${data.total_orders.toLocaleString('pt-BR')} pedidos analisados • ${data.total_produtos_unicos} produtos únicos • ${data.total_pares_analisados.toLocaleString('pt-BR')} pares` : '...'}
        </div>
      </div>

      {/* Insights */}
      {data && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Top combinações detectadas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
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

      {/* KPIs */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi label="Pares analisados" value={data.total_pares_analisados.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="Acima do threshold" value={data.total_pares_acima_threshold.toLocaleString('pt-BR')} color="#10b981" />
          <Kpi label="Cross-brand" value={data.cross_brand.length} color="#ec4899" />
          <Kpi label="Same-brand" value={data.same_brand.length} color="#8b5cf6" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {([
          { key: 'todos', label: `🎯 Top Pares (${data?.top_pares.length || 0})` },
          { key: 'cross-brand', label: `🔀 Cross-Brand (${data?.cross_brand.length || 0})` },
          { key: 'same-brand', label: `📦 Same-Brand (${data?.same_brand.length || 0})` },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 14px', background: tab === t.key ? '#3b82f6' : 'transparent', color: tab === t.key ? 'white' : 'var(--psh-text-primary, #374151)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Analisando combinações...</div>
      ) : !data || data.total_orders === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Sem dados no período</div>
      ) : (
        <TabelaPares pares={tab === 'todos' ? data.top_pares : tab === 'cross-brand' ? data.cross_brand : data.same_brand} />
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

function TabelaPares({ pares }: { pares: Par[] }) {
  if (pares.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum par acima do threshold. Tente reduzir o lift mínimo ou suporte.</div>
  }
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>#</th>
              <th style={th}>Produto A</th>
              <th style={th}>Produto B</th>
              <th style={{ ...th, textAlign: 'right' }}>Pedidos c/ ambos</th>
              <th style={{ ...th, textAlign: 'right' }}>Suporte</th>
              <th style={{ ...th, textAlign: 'right' }}>Conf. A→B</th>
              <th style={{ ...th, textAlign: 'right' }}>Conf. B→A</th>
              <th style={{ ...th, textAlign: 'center' }}>Lift</th>
              <th style={th}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {pares.slice(0, 30).map((p, i) => {
              const liftColor = p.lift >= 3 ? '#10b981' : p.lift >= 2 ? '#3b82f6' : p.lift >= 1.5 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)'
              return (
                <tr key={`${p.sku_a}-${p.sku_b}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}><div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 10 }}>#{i + 1}</div></td>
                  <td style={td}>
                    <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{p.nome_a}</div>
                    <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>{p.marca_a} • {p.sku_a}{p.genero_a ? ` • ${p.genero_a}` : ''}</div>
                  </td>
                  <td style={td}>
                    <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{p.nome_b}</div>
                    <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>{p.marca_b} • {p.sku_b}{p.genero_b ? ` • ${p.genero_b}` : ''}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{p.orders_com_ambos.toLocaleString('pt-BR')}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.support_pct.toFixed(2)}%</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.confidence_a_para_b.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.confidence_b_para_a.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ padding: '3px 8px', background: liftColor, color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{p.lift.toFixed(2)}x</span>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {p.lift >= 2 && <span style={{ padding: '2px 6px', background: '#ecfdf5', color: '#065f46', borderRadius: 3, fontSize: 9, fontWeight: 600 }}>🎁 Combo</span>}
                      <Link href={`/admin/comparativo-produtos?sku_a=${p.sku_a}&sku_b=${p.sku_b}`} style={{ padding: '2px 6px', background: '#eff6ff', color: '#1e40af', borderRadius: 3, fontSize: 9, fontWeight: 600, textDecoration: 'none' }}>Ver</Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)', marginTop: 2 }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
