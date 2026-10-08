'use client'

/**
 * FORECAST DE DEMANDA POR PRODUTO
 * - Projeção de unidades e receita para os próximos N dias
 * - Algoritmo: média móvel + tendência + sazonalidade
 * - Intervalo de confiança (mín/máx)
 * - Top 30 produtos por receita prevista
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Forecast = {
  sku: string; nome: string; marca: string
  historico: { mes: string; unidades: number; receita: number }[]
  media_mensal: number
  tendencia: 'crescimento' | 'estavel' | 'queda'
  variacao_pct: number
  previsao: { periodo: string; unidades_min: number; unidades_media: number; unidades_max: number; receita_media: number }[]
  total_unidades: number
  total_receita: number
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }
const TEND_COR: any = { crescimento: '#10b981', estavel: 'var(--psh-text-secondary, #6b7280)', queda: '#ef4444' }
const TEND_ICON: any = { crescimento: '↑', estavel: '→', queda: '↓' }

export default function ForecastDemandaPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(90)
  const [top, setTop] = useState(30)
  const [expandido, setExpandido] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/forecast-demanda?dias=${dias}&top=${top}')
      const j = await r.json()
      if (j.ok) setData(j)
    } finally { setLoading(false) }
  }, [dias, top])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🔮 Forecast de Demanda</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Previsão de vendas por produto (média + tendência + sazonalidade)</p>
        </div>
        <Link href="/admin/insights" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Insights</Link>
      </div>

      {data?.insights && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Insights</div>
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

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Período:</label>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={selectStyle}>
          <option value={30}>30 dias</option>
          <option value={60}>60 dias</option>
          <option value={90}>90 dias</option>
          <option value={180}>180 dias</option>
        </select>
        <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Top:</label>
        <select value={top} onChange={(e) => setTop(Number(e.target.value))} style={selectStyle}>
          <option value={20}>20 produtos</option>
          <option value={30}>30 produtos</option>
          <option value={50}>50 produtos</option>
          <option value={100}>100 produtos</option>
        </select>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="Produtos analisados" value={data.total_produtos_analisados} color="#3b82f6" />
          <Kpi label="Em crescimento" value={data.em_crescimento} color="#10b981" />
          <Kpi label="Em queda" value={data.em_queda} color="#ef4444" />
          <Kpi label={`Receita prevista ${dias}d`} value={fmtBRL(data.total_receita_prevista)} color="#8b5cf6" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Calculando forecast...</div>
      ) : data && data.produtos ? (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                  <th style={th}>Produto</th>
                  <th style={th}>Marca</th>
                  <th style={{ ...th, textAlign: 'right' }}>Média mensal</th>
                  <th style={{ ...th, textAlign: 'center' }}>Tendência</th>
                  <th style={{ ...th, textAlign: 'right' }}>Previsão total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Receita prevista</th>
                  <th style={th}>Por mês</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.produtos.map((p: Forecast) => {
                  const expandidoAqui = expandido === p.sku
                  return (
                    <>
                      <tr key={p.sku} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...td, maxWidth: 220 }}>
                          <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                          <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)', fontFamily: 'monospace' }}>{p.sku}</div>
                        </td>
                        <td style={td}>{p.marca}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{p.media_mensal.toFixed(1)} un</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', background: TEND_COR[p.tendencia] + '20', color: TEND_COR[p.tendencia], borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            {TEND_ICON[p.tendencia]} {p.variacao_pct.toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>{p.total_unidades.toLocaleString('pt-BR')} un</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmtBRL(p.total_receita)}</td>
                        <td style={td}>
                          <button onClick={() => setExpandido(expandidoAqui ? null : p.sku)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
                            {expandidoAqui ? 'Ocultar ▲' : 'Ver ▼'}
                          </button>
                        </td>
                        <td style={td}>
                          <Link href={`/admin/comparativo-produtos?sku_a=${p.sku}`} style={{ padding: '4px 8px', background: '#eff6ff', color: '#1e40af', borderRadius: 4, fontSize: 10, textDecoration: 'none' }}>🔬</Link>
                        </td>
                      </tr>
                      {expandidoAqui && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--psh-bg-secondary, #fafbfc)', padding: 12 }}>
                            <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 700, marginBottom: 6 }}>📅 HISTÓRICO + PREVISÃO</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 4 }}>
                              {p.historico.map((h) => (
                                <div key={h.mes} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 4, padding: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{h.mes}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{h.unidades}</div>
                                  <div style={{ fontSize: 8, color: '#10b981' }}>{fmtBRL(h.receita)}</div>
                                </div>
                              ))}
                              {p.previsao.map((pr) => (
                                <div key={pr.periodo} style={{ background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: 4, padding: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700 }}>🔮 {pr.periodo}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{pr.unidades_media}</div>
                                  <div style={{ fontSize: 8, color: 'var(--psh-text-secondary, #6b7280)' }}>{pr.unidades_min}-{pr.unidades_max}</div>
                                  <div style={{ fontSize: 8, color: '#10b981' }}>{fmtBRL(pr.receita_media)}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
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

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
