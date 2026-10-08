'use client'

/**
 * COMBO SUGGESTIONS — Preço Sugerido pra Combo
 * Pra cada par de cross-sell detectado:
 * - Calcula preço combo (com desconto inteligente baseado em lift)
 * - Garante margem mínima
 * - Mostra lucro potencial
 * - ROI estimado
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Combo = {
  sku_a: string; nome_a: string; marca_a: string
  sku_b: string; nome_b: string; marca_b: string
  orders_com_ambos: number
  lift: number
  confianca_pct: number
  preco_a: number
  preco_b: number
  custo_a: number
  custo_b: number
  preco_separado: number
  custo_total: number
  margem_atual_pct: number
  desconto_sugerido_pct: number
  preco_combo: number
  economia_cliente: number
  margem_combo_pct: number
  lucro_por_combo: number
  receita_potencial_mensal: number
  lucro_potencial_mensal: number
  roi_estimado_pct: number
  urgencia: 'forte' | 'media' | 'fraca'
}

type Data = {
  filtros: any
  total_combos: number
  total_orders_analisadas: number
  resumo: { receita_potencial_total: number; lucro_potencial_total: number; desconto_medio: number; margem_media: number }
  combos: Combo[]
  insights: any[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

const URGENCIA_COR: any = { forte: '#dc2626', media: '#f59e0b', fraca: 'var(--psh-text-secondary, #9ca3af)' }

export default function ComboSuggestionsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meses, setMeses] = useState(6)
  const [margemMin, setMargemMin] = useState(20)
  const [maxDesconto, setMaxDesconto] = useState(20)
  const [minLift, setMinLift] = useState(1.5)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ meses: String(meses), margem_min: String(margemMin), max_desconto: String(maxDesconto), min_lift: String(minLift) })
      const r = await apiFetch('/api/admin/relatorios/combo-suggestions?${params}')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [meses, margemMin, maxDesconto, minLift])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🎁 Preço Sugerido pra Combo</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Desconto inteligente baseado em lift, garantindo margem mínima</p>
        </div>
        <Link href="/admin/cross-sell" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Cross-Sell</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Slider label="Período" value={meses} min={1} max={12} step={1} suffix="m" onChange={setMeses} format={(v) => `${v} ${v === 1 ? 'mês' : 'meses'}`} />
          <Slider label="Lift mínimo" value={minLift} min={1} max={5} step={0.5} suffix="x" onChange={setMinLift} format={(v) => `${v.toFixed(1)}x`} />
          <Slider label="Margem mínima" value={margemMin} min={5} max={50} step={5} suffix="%" onChange={setMargemMin} format={(v) => `${v}%`} />
          <Slider label="Desconto máximo" value={maxDesconto} min={5} max={40} step={5} suffix="%" onChange={setMaxDesconto} format={(v) => `${v}%`} />
        </div>
      </div>

      {data && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Top oportunidades</div>
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

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="Combos detectados" value={data.total_combos.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="Receita potencial" value={fmtBRL(data.resumo.receita_potencial_total)} color="#10b981" />
          <Kpi label="Lucro potencial" value={fmtBRL(data.resumo.lucro_potencial_total)} color="#8b5cf6" />
          <Kpi label="Desconto médio" value={`${data.resumo.desconto_medio.toFixed(0)}%`} color="#f59e0b" sub={`Margem média: ${data.resumo.margem_media.toFixed(0)}%`} />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Calculando combos sugeridos...</div>
      ) : !data || data.combos.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum combo acima do threshold. Reduza o lift mínimo.</div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>Combo</th>
                  <th style={{ ...th, textAlign: 'center' }}>Lift</th>
                  <th style={{ ...th, textAlign: 'right' }}>Preço separado</th>
                  <th style={{ ...th, textAlign: 'center' }}>Desc. sugerido</th>
                  <th style={{ ...th, textAlign: 'right' }}>Preço combo</th>
                  <th style={{ ...th, textAlign: 'center' }}>Margem</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lucro/combo</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lucro potencial</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.combos.slice(0, 30).map((c, i) => {
                  const liftCor = c.lift >= 3 ? '#10b981' : c.lift >= 2 ? '#3b82f6' : 'var(--psh-text-secondary, #9ca3af)'
                  const margemCor = c.margem_combo_pct >= 30 ? '#10b981' : c.margem_combo_pct >= 20 ? '#f59e0b' : '#ef4444'
                  return (
                    <tr key={`${c.sku_a}-${c.sku_b}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 20, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 10 }}>#{i + 1}</div>
                          <div>
                            <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>{c.nome_a}</div>
                            <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>+ {c.nome_b}</div>
                            <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 9 }}>{c.marca_a} + {c.marca_b}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', background: liftCor, color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{c.lift.toFixed(2)}x</span>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)', marginTop: 2 }}>{c.confianca_pct.toFixed(0)}% conf</div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ color: 'var(--psh-text-secondary, #6b7280)', textDecoration: 'line-through', fontSize: 11 }}>{fmtBRL2(c.preco_separado)}</div>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>Custo: {fmtBRL2(c.custo_total)}</div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>-{c.desconto_sugerido_pct.toFixed(0)}%</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{fmtBRL2(c.preco_combo)}</div>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>Cliente economiza {fmtBRL(c.economia_cliente)}</div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', background: margemCor + '20', color: margemCor, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{c.margem_combo_pct.toFixed(0)}%</span>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)', marginTop: 2 }}>vs {c.margem_atual_pct.toFixed(0)}% atual</div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-primary, #111827)', fontWeight: 700 }}>{fmtBRL2(c.lucro_por_combo)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 13 }}>{fmtBRL(c.lucro_potencial_mensal)}</div>
                        <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>em {c.orders_com_ambos} pedidos</div>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${c.nome_a} + ${c.nome_b}\nCombo: ${fmtBRL2(c.preco_combo)} (${c.desconto_sugerido_pct.toFixed(0)}% off)\nDe: ${fmtBRL2(c.preco_separado)} por ${fmtBRL2(c.preco_combo)}`)
                              alert('Copiado!')
                            }}
                            style={{ padding: '4px 8px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                          >
                            📋 Copiar
                          </button>
                          <Link href={`/admin/comparativo-produtos?sku_a=${c.sku_a}&sku_b=${c.sku_b}`} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #d1d5db', color: 'var(--psh-text-primary, #374151)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                            🔬 Detalhes
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Slider({ label, value, min, max, step, suffix, onChange, format }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</label>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{format(value)}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{sub}</div>}
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
