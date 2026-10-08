'use client'

/**
 * ANÁLISE DE CHURN
 * - Classifica clientes em: Ativo (<30d), Em risco (30-60d), Churn (60-90d), Dormindo (90-180d), Perdido (180+d)
 * - KPIs: total, % ativos, LTV em risco
 * - Funil visual de retenção
 * - Lista priorizada por LTV (clientes mais valiosos em risco primeiro)
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Cliente = {
  id: string; nome: string; email: string | null; telefone: string | null
  total_pedidos: number
  receita_total: number
  ticket_medio: number
  primeira_compra: string
  ultima_compra: string
  dias_sem_comprar: number
  media_dias_entre_compras: number
  segment: 'ativo' | 'risco' | 'churn' | 'dormindo' | 'perdido'
  risco_churn_pct: number
  ltv_estimado: number
  freq_mensal: number
}

type Data = {
  total_clientes: number
  segment_counts: Record<string, number>
  segment_receita: Record<string, number>
  ltv_total_ativos: number
  ltv_total_em_risco: number
  ltv_total_churn: number
  receita_em_risco: number
  clientes: Cliente[]
  insights: any[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

const SEGMENT_COR: any = { ativo: '#10b981', risco: '#f59e0b', churn: '#ef4444', dormindo: 'var(--psh-text-secondary, #6b7280)', perdido: 'var(--psh-text-secondary, #9ca3af)' }
const SEGMENT_LABEL: any = { ativo: '🟢 Ativo', risco: '⚠️ Em risco', churn: '🔴 Churn', dormindo: '😴 Dormindo', perdido: '💀 Perdido' }
const SEGMENT_DAYS: any = { ativo: '< 30d', risco: '30-60d', churn: '60-90d', dormindo: '90-180d', perdido: '180+d' }

export default function ChurnPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segment, setSegment] = useState('todos')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(100)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ segment, search, limit: String(limit) })
      const r = await apiFetch('/api/admin/relatorios/churn?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [segment, search, limit])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Analisando churn...</div>
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>💔 Análise de Churn</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Clientes que pararam de comprar + LTV em risco</p>
        </div>
        <Link href="/admin/rfm" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>RFM →</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {data && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Alertas de Churn</div>
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

      {/* KPIs */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="Total Clientes" value={data.total_clientes.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="Ativos" value={`${data.segment_counts.ativo} (${((data.segment_counts.ativo / data.total_clientes) * 100).toFixed(0)}%)`} color="#10b981" sub={fmtBRL(data.ltv_total_ativos)} />
          <Kpi label="Em risco" value={`${data.segment_counts.risco} (${((data.segment_counts.risco / data.total_clientes) * 100).toFixed(0)}%)`} color="#f59e0b" sub={`LTV: ${fmtBRL(data.ltv_total_em_risco)}`} />
          <Kpi label="Churned" value={`${data.segment_counts.churn + data.segment_counts.dormindo + data.segment_counts.perdido}`} color="#ef4444" sub={`LTV perdido: ${fmtBRL(data.ltv_total_churn)}`} />
        </div>
      )}

      {/* Funil de retenção */}
      {data && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>📊 Funil de Retenção</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {(['ativo', 'risco', 'churn', 'dormindo', 'perdido'] as const).map((seg) => {
              const count = data.segment_counts[seg] || 0
              const total = data.total_clientes || 1
              const pct = (count / total) * 100
              const receita = data.segment_receita[seg] || 0
              return (
                <div key={seg} style={{ background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 8, padding: 12, borderTop: `4px solid ${SEGMENT_COR[seg]}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: SEGMENT_COR[seg], textTransform: 'uppercase' }}>{SEGMENT_LABEL[seg]}</div>
                  <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{SEGMENT_DAYS[seg]}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginTop: 6 }}>{count.toLocaleString('pt-BR')}</div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>{pct.toFixed(1)}% do total</div>
                  <div style={{ height: 6, background: 'var(--psh-border, #e5e7eb)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: SEGMENT_COR[seg] }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-primary, #111827)', fontWeight: 600, marginTop: 6 }}>{fmtBRL(receita)}</div>
                  <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>receita histórica</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 200 }} />
        <select value={segment} onChange={(e) => setSegment(e.target.value)} style={selectStyle}>
          <option value="todos">Todos segmentos</option>
          <option value="ativo">🟢 Ativos</option>
          <option value="risco">⚠️ Em risco</option>
          <option value="churn">🔴 Churn</option>
          <option value="dormindo">😴 Dormindo</option>
          <option value="perdido">💀 Perdido</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={selectStyle}>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={200}>Top 200</option>
          <option value={500}>Top 500</option>
        </select>
      </div>

      {data && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>Cliente</th>
                  <th style={th}>Contato</th>
                  <th style={th}>Segmento</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Receita total</th>
                  <th style={{ ...th, textAlign: 'right' }}>LTV est.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Última compra</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dias s/ comprar</th>
                  <th style={{ ...th, textAlign: 'center' }}>Risco</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}>
                      <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>{c.nome}</div>
                      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)', fontFamily: 'monospace' }}>ID: {c.id.slice(0, 8)}</div>
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{c.email || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{c.telefone || '—'}</div>
                    </td>
                    <td style={td}>
                      <span style={{ padding: '2px 8px', background: SEGMENT_COR[c.segment] + '20', color: SEGMENT_COR[c.segment], borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                        {SEGMENT_LABEL[c.segment]}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.total_pedidos}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(c.receita_total)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>{fmtBRL(c.ltv_estimado)}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 10 }}>{new Date(c.ultima_compra).toLocaleDateString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right', color: c.dias_sem_comprar > 60 ? '#ef4444' : c.dias_sem_comprar > 30 ? '#f59e0b' : 'var(--psh-text-primary, #111827)', fontWeight: 700 }}>{c.dias_sem_comprar}d</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: `conic-gradient(${c.risco_churn_pct >= 75 ? '#ef4444' : c.risco_churn_pct >= 50 ? '#f59e0b' : c.risco_churn_pct >= 25 ? '#3b82f6' : '#10b981'} ${c.risco_churn_pct * 3.6}deg, #e5e7eb 0deg)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{c.risco_churn_pct}%</div>
                      </div>
                    </td>
                    <td style={td}>
                      {c.telefone && c.segment !== 'ativo' && (
                        <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', background: '#10b981', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                          💬 WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {data.clientes.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum cliente neste segmento</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{sub}</div>}
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
