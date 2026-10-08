'use client'

/**
 * PREVISÃO DE RECOMPRA
 * - Lista de clientes ordenados por urgência (atrasados primeiro)
 * - Cada cliente: dias até próxima compra prevista, probabilidade, melhor dia
 * - Botão WhatsApp direto
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Prev = {
  id: string; nome: string; email: string | null; telefone: string | null
  total_pedidos: number; receita_total: number
  ultima_compra: string
  dias_desde_ultima: number
  intervalo_medio_dias: number
  proxima_compra_prevista: string
  dias_ate_proxima: number
  probabilidade_voltar_pct: number
  confianca: 'alta' | 'media' | 'baixa'
  melhor_dia_semana: string
  melhor_periodo: string
  urgencia: 'atrasado' | 'hoje' | 'em_breve' | 'normal' | 'novo'
  status: 'ativo' | 'risco' | 'churn'
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const URG_BG: any = { atrasado: '#fef2f2', hoje: '#fffbeb', em_breve: '#eff6ff', normal: 'var(--psh-bg-secondary, #fafbfc)', novo: '#f0fdf4' }
const URG_COR: any = { atrasado: '#ef4444', hoje: '#f59e0b', em_breve: '#3b82f6', normal: 'var(--psh-text-secondary, #6b7280)', novo: '#10b981' }
const URG_LABEL: any = { atrasado: '🔴 Atrasado', hoje: '🟡 Hoje', em_breve: '🔵 Em breve', normal: '⚪ Normal', novo: '🟢 Novo' }
const CONF_COR: any = { alta: '#10b981', media: '#f59e0b', baixa: 'var(--psh-text-secondary, #9ca3af)' }

export default function PrevisaoRecompraPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('todos')
  const [limit, setLimit] = useState(200)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/previsao-recompra?segment=${segment}&limit=${limit}')
      const j = await r.json()
      if (j.ok) setData(j)
    } finally { setLoading(false) }
  }, [segment, limit])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🔮 Previsão de Recompra</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Quando cada cliente deve voltar + probabilidade de retorno</p>
        </div>
        <Link href="/admin/churn" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Churn</Link>
      </div>

      {data?.insights && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 10 }}>💡 Alertas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {data.insights.map((ins: any, i: number) => (
              <div key={i} style={{ background: ins.tipo === 'atencao' ? '#fef2f2' : ins.tipo === 'positivo' ? '#ecfdf5' : '#eff6ff', borderLeft: `4px solid ${ins.tipo === 'atencao' ? '#ef4444' : ins.tipo === 'positivo' ? '#10b981' : '#3b82f6'}`, borderRadius: 8, padding: 12 }}>
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
          <Kpi label="Clientes analisados" value={data.total.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="🔴 Atrasados" value={data.atrasados} color="#ef4444" sub={`R$ ${(data.valor_risco || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} />
          <Kpi label="⏰ Em breve (7d)" value={data.em_breve} color="#3b82f6" />
          <Kpi label="🎯 Alta confiança" value={data.alta_confianca} color="#10b981" sub="5+ compras" />
        </div>
      )}

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} style={selectStyle}>
          <option value="todos">Todos</option>
          <option value="ativo">🟢 Ativos</option>
          <option value="risco">⚠️ Em risco</option>
          <option value="churn">🔴 Churn</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={selectStyle}>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={200}>Top 200</option>
          <option value={500}>Top 500</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Calculando previsões...</div>
      ) : data && data.clientes ? (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>Urgência</th>
                  <th style={th}>Cliente</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                  <th style={{ ...th, textAlign: 'center' }}>Prob.</th>
                  <th style={th}>Próxima compra prevista</th>
                  <th style={{ ...th, textAlign: 'center' }}>Conf.</th>
                  <th style={th}>Melhor dia/horário</th>
                  <th style={th}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c: Prev) => (
                  <tr key={c.id} style={{ background: URG_BG[c.urgencia], borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}>
                      <span style={{ padding: '3px 8px', background: URG_COR[c.urgencia] + '30', color: URG_COR[c.urgencia], borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{URG_LABEL[c.urgencia]}</span>
                    </td>
                    <td style={td}>
                      <div style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>{c.nome}</div>
                      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>Última: {new Date(c.ultima_compra).toLocaleDateString('pt-BR')} ({c.dias_desde_ultima}d)</div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.total_pedidos}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(c.receita_total)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: c.probabilidade_voltar_pct >= 70 ? '#10b981' : c.probabilidade_voltar_pct >= 40 ? '#f59e0b' : '#ef4444' }}>{c.probabilidade_voltar_pct}%</div>
                        <div style={{ width: 40, height: 4, background: 'var(--psh-border, #e5e7eb)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                          <div style={{ width: `${c.probabilidade_voltar_pct}%`, height: '100%', background: c.probabilidade_voltar_pct >= 70 ? '#10b981' : c.probabilidade_voltar_pct >= 40 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 600 }}>{new Date(c.proxima_compra_prevista).toLocaleDateString('pt-BR')}</div>
                      <div style={{ fontSize: 10, color: c.dias_ate_proxima < 0 ? '#ef4444' : c.dias_ate_proxima < 7 ? '#f59e0b' : 'var(--psh-text-secondary, #6b7280)' }}>
                        {c.dias_ate_proxima < 0 ? `${Math.abs(c.dias_ate_proxima)}d atrasado` : `em ${c.dias_ate_proxima}d`}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>intervalo médio: {c.intervalo_medio_dias.toFixed(0)}d</div>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ padding: '2px 6px', background: CONF_COR[c.confianca] + '20', color: CONF_COR[c.confianca], borderRadius: 3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{c.confianca}</span>
                    </td>
                    <td style={{ ...td, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
                      {c.melhor_dia_semana} • {c.melhor_periodo}
                    </td>
                    <td style={td}>
                      {c.telefone && (
                        <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', background: '#10b981', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>💬</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{sub}</div>}
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
