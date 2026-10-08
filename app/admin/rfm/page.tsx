'use client'

/**
 * RFM — Segmentação Recency/Frequency/Monetary
 * 11 segmentos clássicos com ações de marketing recomendadas
 * - Champions, Loyal, Potential Loyalists, New Customers, Promising
 * - Need Attention, About to Sleep, Can't Lose Them, At Risk
 * - Hibernating, Lost
 * - Recomenda ação pra cada segmento
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Cliente = {
  id: string; nome: string; email: string | null; telefone: string | null
  recency_days: number; frequency: number; monetary: number
  r_score: number; f_score: number; m_score: number
  rfm_score: string
  segment: string
  acao: string
}

type SegCount = { count: number; monetary: number; avg_recency: number }

type Data = {
  total: number
  segmentos: Record<string, SegCount>
  clientes: Cliente[]
  insights: any[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

// Cores por tipo de segmento
const SEG_COR: any = {
  '🏆 Champions': '#10b981',
  '💎 Loyal Customers': '#3b82f6',
  '🌟 New Customers': '#8b5cf6',
  '🤝 Potential Loyalists': '#06b6d4',
  '🌱 Promising': '#a78bfa',
  '⚠️ Need Attention': '#f59e0b',
  '😴 About to Sleep': '#f97316',
  "🚨 Can't Lose Them": '#dc2626',
  '💔 At Risk': '#ef4444',
  '🪦 Hibernating (high value)': 'var(--psh-text-secondary, #6b7280)',
  '🪦 Lost': 'var(--psh-text-secondary, #9ca3af)',
  '👀 Others': 'var(--psh-text-secondary, #9ca3af)',
}

export default function RFMPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segmentFilter, setSegmentFilter] = useState('todos')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/rfm')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Segmentando clientes RFM...</div>
  }

  const filteredClientes = segmentFilter === 'todos' ? data?.clientes || [] : (data?.clientes || []).filter((c) => c.segment === segmentFilter)
  const segmentList = Object.keys(data?.segmentos || {}).sort((a, b) => (data!.segmentos[b].monetary) - (data!.segmentos[a].monetary))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🎯 Segmentação RFM</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Recency × Frequency × Monetary — 11 segmentos com ações recomendadas</p>
        </div>
        <Link href="/admin/churn" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Churn</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {data && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Resumo por segmento</div>
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

      {/* Segmentos - grid visual */}
      {data && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>📊 Segmentos ({data.total} clientes)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {segmentList.map((seg) => {
              const c = data.segmentos[seg]
              const pct = data.total > 0 ? (c.count / data.total) * 100 : 0
              const cor = SEG_COR[seg] || 'var(--psh-text-secondary, #9ca3af)'
              return (
                <div key={seg} onClick={() => setSegmentFilter(seg)} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, cursor: 'pointer', borderTop: `4px solid ${cor}`, transition: 'transform 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cor }}>{seg}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginTop: 4 }}>{c.count.toLocaleString('pt-BR')}</div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{pct.toFixed(1)}% do total</div>
                  <div style={{ height: 4, background: 'var(--psh-border, #e5e7eb)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: `${pct * 3}%`, maxWidth: '100%', height: '100%', background: cor }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginTop: 6 }}>{fmtBRL(c.monetary)}</div>
                  <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>recém: {c.avg_recency}d atrás</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtro + Tabela */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Filtrar:</span>
        <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} style={selectStyle}>
          <option value="todos">Todos os segmentos ({data?.clientes.length})</option>
          {segmentList.map((seg) => (
            <option key={seg} value={seg}>{seg} ({data?.segmentos[seg].count})</option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
          {filteredClientes.length} cliente(s)
        </div>
      </div>

      {data && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>Cliente</th>
                  <th style={th}>Segmento</th>
                  <th style={{ ...th, textAlign: 'center' }}>R F M</th>
                  <th style={{ ...th, textAlign: 'right' }}>Recência</th>
                  <th style={{ ...th, textAlign: 'right' }}>Freq</th>
                  <th style={{ ...th, textAlign: 'right' }}>Monetário</th>
                  <th style={th}>Ação recomendada</th>
                  <th style={th}>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.slice(0, 100).map((c) => {
                  const cor = SEG_COR[c.segment] || 'var(--psh-text-secondary, #9ca3af)'
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td}>
                        <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>{c.nome}</div>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>{c.email || c.telefone || '—'}</div>
                      </td>
                      <td style={td}>
                        <span style={{ padding: '2px 8px', background: cor + '20', color: cor, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{c.segment}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: c.r_score >= 4 ? '#10b981' : c.r_score >= 2 ? '#f59e0b' : '#ef4444' }}>{c.r_score}</span>
                        <span style={{ color: c.f_score >= 4 ? '#10b981' : c.f_score >= 2 ? '#f59e0b' : '#ef4444' }}>{c.f_score}</span>
                        <span style={{ color: c.m_score >= 4 ? '#10b981' : c.m_score >= 2 ? '#f59e0b' : '#ef4444' }}>{c.m_score}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{c.recency_days}d</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.frequency}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{fmtBRL(c.monetary)}</td>
                      <td style={{ ...td, fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>{c.acao}</td>
                      <td style={td}>
                        {c.telefone && (
                          <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ padding: '3px 8px', background: '#10b981', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>
                            💬
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filteredClientes.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum cliente neste segmento</td>
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

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
