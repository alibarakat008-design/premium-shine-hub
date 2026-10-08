'use client'

/**
 * LTV AVANÇADO
 * - Curva ABC de clientes (Pareto: 20% = 80%)
 * - Churn rate global
 * - LTV projetado 12 meses
 * - Concentração de receita (top 10%, top 1%)
 * - Lista dos top 50 clientes classe A
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

export default function LtvAvancadoPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/admin/relatorios/ltv-avancado')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Calculando LTV...</div>
  if (!data) return null

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>💰 LTV Avançado</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Curva ABC, churn rate real, LTV projetado 12 meses</p>
        </div>
        <Link href="/admin/rfm" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← RFM</Link>
      </div>

      {data.insights && data.insights.length > 0 && (
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi label="Total Clientes" value={data.total_clientes.toLocaleString('pt-BR')} color="#3b82f6" />
        <Kpi label="Receita Histórica" value={fmtBRL(data.receita_historica_total)} color="#10b981" />
        <Kpi label="LTV Projetado 12m" value={fmtBRL(data.ltv_total_projetado_12m)} color="#8b5cf6" />
        <Kpi label="Churn Rate" value={`${data.churn_rate_global.toFixed(0)}%`} color={data.churn_rate_global < 30 ? '#10b981' : data.churn_rate_global < 50 ? '#f59e0b' : '#ef4444'} />
      </div>

      {/* Curva ABC */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>📊 Curva ABC (Pareto)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <CardClasse classe="A" data={data.curva_abc.classe_a} cor="#10b981" desc="Top clientes que geram 80% da receita" />
          <CardClasse classe="B" data={data.curva_abc.classe_b} cor="#3b82f6" desc="Clientes que geram 15% da receita" />
          <CardClasse classe="C" data={data.curva_abc.classe_c} cor="#9ca3af" desc="Clientes com 5% da receita" />
        </div>
      </div>

      {/* Concentração */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🎯 Concentração de Receita</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <ConcentracaoCard label="Top 10% dos clientes" pct={data.concentracao.top_10_pct} cor="#3b82f6" desc="da receita total vem dos 10% maiores" />
          <ConcentracaoCard label="Top 1 cliente" pct={data.concentracao.top_1_pct} cor="#8b5cf6" desc="é o % da receita total" />
        </div>
      </div>

      {/* Top 50 clientes classe A */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🏆 Top 50 Clientes (Classe A)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                <th style={th}>#</th>
                <th style={th}>Cliente ID</th>
                <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
                <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                <th style={{ ...th, textAlign: 'right' }}>Ticket</th>
                <th style={{ ...th, textAlign: 'right' }}>LTV 12m</th>
                <th style={{ ...th, textAlign: 'right' }}>Freq/mês</th>
                <th style={{ ...th, textAlign: 'center' }}>Risco Churn</th>
              </tr>
            </thead>
            <tbody>
              {data.top_clientes.map((c: any) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: c.posicao <= 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)' }}>#{c.posicao}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{c.id.slice(0, 8)}...</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.total_pedidos}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmtBRL(c.receita_total)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(c.ticket_medio)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>{fmtBRL(c.ltv_projetado)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.freq_mensal.toFixed(2)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ width: 50, height: 6, background: 'var(--psh-border, #e5e7eb)', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
                      <div style={{ width: `${c.churn_risk * 100}%`, height: '100%', background: c.churn_risk < 0.3 ? '#10b981' : c.churn_risk < 0.6 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', marginLeft: 4 }}>{(c.churn_risk * 100).toFixed(0)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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

function CardClasse({ classe, data, cor, desc }: { classe: string; data: any; cor: string; desc: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: cor }}>Classe {classe}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{data.count.toLocaleString('pt-BR')}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{data.pct_clientes.toFixed(1)}% dos clientes</div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 600, marginTop: 6 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
        <div>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>% Receita</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{data.pct_receita.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>LTV médio</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6' }}>{fmtBRL(data.ltv_medio)}</div>
        </div>
      </div>
    </div>
  )
}

function ConcentracaoCard({ label, pct, cor, desc }: { label: string; pct: number; cor: string; desc: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: cor, marginTop: 4 }}>{pct.toFixed(1)}%</div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{desc}</div>
      <div style={{ height: 8, background: 'var(--psh-border, #e5e7eb)', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor }} />
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }
