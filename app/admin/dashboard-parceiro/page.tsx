'use client'

/**
 * /admin/dashboard-parceiro
 *
 * Dashboard focado pra empresas parceiras verem APENAS os KPIs delas:
 *   - Receita bruta, líquida, CMV
 *   - Ticket médio, total vendas
 *   - Margem %
 *   - Comparativo com período anterior (delta %)
 *   - Top 5 produtos
 *   - Status breakdown
 *   - Vendas por dia (gráfico simples)
 */

import { useEffect, useState } from 'react'

type Dashboard = {
  ok: boolean
  company: {
    id: string
    nome_fantasia: string | null
    razao_social: string
    cnpj: string
    account_type: string
    has_ml_token?: boolean
    ml_pending?: boolean
  }
  period_days: number
  kpis: {
    total_vendas: number
    receita_bruta: number
    receita_liquida: number
    cmv_total: number
    ticket_medio: number
    total_entregue: number
    total_cancelado: number
    margem_pct: number
  }
  comparativo: {
    vendas: number
    receita: number
  }
  status_breakdown: { status: string; qty: number }[]
  top_produtos: { sku: string; title: string; qtd: number; receita: number }[]
  vendas_por_dia: { dia: string; vendas: number; receita: number }[]
}

export default function DashboardParceiroPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch(`/api/admin/dashboard-parceiro?days=${days}`, {
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const fmtBRL = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const maxReceita = data ? Math.max(...data.vendas_por_dia.map(d => d.receita), 1) : 1

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            📊 Dashboard
          </h1>
          {data && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
              {data.company.nome_fantasia || data.company.razao_social} · {data.company.cnpj}
              {' · '}Últimos <b>{days} dias</b>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 15, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--psh-border-primary)',
                background: days === d ? '#7c3aed' : 'var(--psh-bg-secondary)',
                color: days === d ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary)',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          padding: 16, borderRadius: 10,
          background: '#fee2e2', color: '#991b1b',
          fontSize: 13, marginBottom: 16,
        }}>
          ⚠️ {error}
          <br />
          <a href="/admin/login-empresa" style={{ color: '#991b1b', textDecoration: 'underline' }}>
            → Fazer login de empresa
          </a>
        </div>
      )}

      {loading || !data ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
          ⏳ Carregando...
        </div>
      ) : !data.company.has_ml_token ? (
        // CTA GRANDE: Conectar ML
        <div style={{
          background: data.company.ml_pending
            ? 'linear-gradient(135deg, #e0f2fe, #bae6fd)'
            : 'linear-gradient(135deg, #fef3c7, #fde68a)',
          border: `2px dashed ${data.company.ml_pending ? '#0284c7' : '#f59e0b'}`,
          borderRadius: 16,
          padding: 48,
          textAlign: 'center',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>
            {data.company.ml_pending ? '⏳' : '🔗'}
          </div>
          <h2 style={{
            margin: '0 0 8px',
            fontSize: 26, fontWeight: 800,
            color: data.company.ml_pending ? '#075985' : '#92400e',
          }}>
            {data.company.ml_pending
              ? 'Conexão com ML pendente'
              : 'Conecte sua conta do Mercado Livre'}
          </h2>
          <p style={{
            fontSize: 14,
            color: data.company.ml_pending ? '#0c4a6e' : '#78350f',
            maxWidth: 520, margin: '0 auto 24px', lineHeight: 1.6,
          }}>
            {data.company.ml_pending
              ? 'Detectamos que você tentou conectar mas houve um bloqueio de rede. As demais funcionalidades do painel estão liberadas. Reconecte o ML quando o problema de internet for resolvido.'
              : 'Pra começar a ver suas vendas aqui, você precisa autorizar o Premium Shine a acessar os pedidos da sua conta ML. É só clicar no botão abaixo e fazer login no ML.'}
          </p>
          <a
            href={`/api/admin/ml-oauth/start?company_id=${data.company.id}`}
            style={{
              display: 'inline-block',
              padding: '16px 32px',
              borderRadius: 12,
              border: 'none',
              background: data.company.ml_pending
                ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: 'var(--psh-bg-primary, #fff)',
              fontSize: 15,
              fontWeight: 800,
              textDecoration: 'none',
              cursor: 'pointer',
              boxShadow: data.company.ml_pending
                ? '0 4px 12px rgba(2, 132, 199, 0.3)'
                : '0 4px 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            {data.company.ml_pending ? '🔄 Tentar conectar de novo' : '🔗 Conectar minha conta ML agora'}
          </a>
          <p style={{ fontSize: 12, color: data.company.ml_pending ? '#0c4a6e' : '#92400e', marginTop: 16 }}>
            ⏱️ Leva menos de 30 segundos. Você pode desconectar quando quiser.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs principais */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            <KpiCard
              label="💰 Receita Bruta"
              value={fmtBRL(data.kpis.receita_bruta)}
              delta={data.comparativo.receita}
              color="#10b981"
            />
            <KpiCard
              label="📦 Total Vendas"
              value={data.kpis.total_vendas.toString()}
              delta={data.comparativo.vendas}
              color="#7c3aed"
            />
            <KpiCard
              label="🎯 Ticket Médio"
              value={fmtBRL(data.kpis.ticket_medio)}
              color="#0ea5e9"
            />
            <KpiCard
              label="📉 CMV Total"
              value={fmtBRL(data.kpis.cmv_total)}
              color="#ef4444"
            />
            <KpiCard
              label="📊 Margem"
              value={`${data.kpis.margem_pct.toFixed(1)}%`}
              color={data.kpis.margem_pct > 30 ? '#10b981' : data.kpis.margem_pct > 15 ? '#f59e0b' : '#ef4444'}
            />
            <KpiCard
              label="💸 Receita Líquida"
              value={fmtBRL(data.kpis.receita_liquida)}
              color="#059669"
            />
          </div>

          {/* Status breakdown */}
          {data.status_breakdown.length > 0 && (
            <div style={{
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                📋 Status das Vendas
              </h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.status_breakdown.map(s => {
                  const cor = s.status === 'entregue' ? '#10b981'
                    : s.status === 'cancelado' ? '#ef4444'
                    : s.status === 'enviado' ? '#3b82f6'
                    : s.status === 'confirmado' ? '#f59e0b'
                    : 'var(--psh-text-secondary, #6b7280)'
                  return (
                    <div key={s.status} style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: `${cor}15`,
                      border: `1px solid ${cor}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span style={{ fontSize: 12, color: cor, fontWeight: 700, textTransform: 'uppercase' }}>
                        {s.status}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: cor }}>
                        {s.qty}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Gráfico de vendas por dia */}
          {data.vendas_por_dia.length > 0 && (
            <div style={{
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                📈 Vendas por Dia
              </h2>
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 2,
                height: 160,
                padding: '0 4px',
                overflowX: 'auto',
              }}>
                {data.vendas_por_dia.map(d => {
                  const h = Math.max(4, (d.receita / maxReceita) * 140)
                  return (
                    <div
                      key={d.dia}
                      title={`${d.dia}: ${d.vendas} vendas · ${fmtBRL(d.receita)}`}
                      style={{
                        minWidth: 16,
                        height: h,
                        background: 'linear-gradient(180deg, #7c3aed, #a78bfa)',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(180deg, #6d28d9, #8b5cf6)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(180deg, #7c3aed, #a78bfa)'}
                    />
                  )
                })}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: 'var(--psh-text-muted)',
                marginTop: 4,
              }}>
                <span>{data.vendas_por_dia[0]?.dia}</span>
                <span>{data.vendas_por_dia[data.vendas_por_dia.length - 1]?.dia}</span>
              </div>
            </div>
          )}

          {/* Top 5 produtos */}
          {data.top_produtos.length > 0 && (
            <div style={{
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 12,
              padding: 20,
            }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                🏆 Top 5 Produtos
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--psh-text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>Produto</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600 }}>Qtd</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600 }}>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_produtos.map((p, i) => (
                    <tr key={p.sku} style={{ borderTop: '1px solid var(--psh-border-secondary)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 700, color: '#7c3aed' }}>{i + 1}</td>
                      <td style={{ padding: '8px 4px', color: 'var(--psh-text-primary)' }}>
                        <div style={{ fontWeight: 600 }}>{p.title || p.sku}</div>
                        {p.title && (
                          <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', fontFamily: 'monospace' }}>
                            {p.sku}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {p.qtd}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                        {fmtBRL(p.receita)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.kpis.total_vendas === 0 && (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 12,
              marginTop: 16,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                Nenhuma venda nos últimos {days} dias
              </div>
              <p style={{ fontSize: 13, color: 'var(--psh-text-secondary)', marginTop: 8 }}>
                Vá em <a href="/admin/empresas" style={{ color: '#7c3aed' }}>Empresas</a> e importe vendas ML.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, delta, color }: {
  label: string
  value: string
  delta?: number
  color: string
}) {
  return (
    <div style={{
      padding: 16,
      background: 'var(--psh-bg-secondary)',
      border: '1px solid var(--psh-border-primary)',
      borderRadius: 10,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: color,
      }} />
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary)', marginTop: 4 }}>
        {value}
      </div>
      {delta !== undefined && delta !== 0 && (
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: delta > 0 ? '#10b981' : '#ef4444',
          marginTop: 4,
        }}>
          {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}% vs período anterior
        </div>
      )}
    </div>
  )
}