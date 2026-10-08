'use client'

/**
 * ANÁLISE DE COHORT
 * - Matriz visual: cohort (linha) × mês relativo (coluna)
 * - Cores por % retenção
 * - Identifica melhor/pior cohort
 * - LTV médio por cohort
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

const colorFor = (pct: number) => {
  if (pct >= 50) return '#10b981'
  if (pct >= 30) return '#84cc16'
  if (pct >= 20) return '#eab308'
  if (pct >= 10) return '#f97316'
  if (pct > 0) return '#ef4444'
  return 'var(--psh-border, #e5e7eb)'
}

export default function CohortPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(12)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/cohort?meses=${meses}')
      const j = await r.json()
      if (j.ok) setData(j)
    } finally { setLoading(false) }
  }, [meses])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Calculando cohort...</div>
  if (!data) return null

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📊 Análise de Cohort</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Retenção mês a mês de cada cohort (mês da 1ª compra)</p>
        </div>
        <Link href="/admin/rfm" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← RFM</Link>
      </div>

      {data.insights && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Insights de Retenção</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {data.insights.map((ins: any, i: number) => (
              <div key={i} style={{ background: INSIGHT_BG[ins.tipo], borderLeft: `4px solid ${INSIGHT_BORDER[ins.tipo]}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{ins.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{ins.titulo}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', marginTop: 4, lineHeight: 1.4 }}>{ins.detalhe}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="Cohorts analisados" value={data.total_cohorts} color="#3b82f6" />
          <Kpi label="Retenção M1" value={`${data.retencao_media.m1.toFixed(0)}%`} color={data.retencao_media.m1 > 30 ? '#10b981' : '#f59e0b'} />
          <Kpi label="Retenção M3" value={`${data.retencao_media.m3.toFixed(0)}%`} color="#8b5cf6" />
          <Kpi label="Retenção M6" value={`${data.retencao_media.m6.toFixed(0)}%`} color="#ec4899" />
        </div>
      )}

      {/* Matriz de retenção */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🔥 Matriz de Retenção (cohort × mês relativo)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--psh-bg-secondary, #fafbfc)', zIndex: 1, minWidth: 90 }}>Cohort</th>
                <th style={{ ...th, minWidth: 60 }}>Clientes</th>
                <th style={{ ...th, minWidth: 60 }}>LTV</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} style={{ ...th, minWidth: 50, color: '#3b82f6' }}>M{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matriz.map((row: any) => (
                <tr key={row.cohort}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--psh-bg-secondary, #fafbfc)', fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{row.cohort}</td>
                  <td style={{ ...td, textAlign: 'center', fontSize: 10 }}>{row.total_clientes}</td>
                  <td style={{ ...td, textAlign: 'right', fontSize: 10, color: '#10b981', fontWeight: 600 }}>{fmtBRL(row.receita_total)}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const cell = row.retencao[i]
                    if (!cell) return <td key={i} style={{ ...td, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>—</td>
                    const cor = colorFor(cell.retencao_pct)
                    const isFirst = i === 0
                    return (
                      <td key={i} style={{ ...td, textAlign: 'center', background: cor, color: cell.retencao_pct > 30 ? 'white' : 'var(--psh-text-primary, #111827)', fontWeight: isFirst ? 700 : 500, fontSize: 10 }}>
                        {isFirst ? '100%' : `${cell.retencao_pct.toFixed(0)}%`}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
          <span>Fraca</span>
          {['#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981'].map((c) => <div key={c} style={{ width: 20, height: 12, background: c, borderRadius: 2 }} />)}
          <span>Forte</span>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 4px', textAlign: 'center', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '6px 4px', fontSize: 10 }
