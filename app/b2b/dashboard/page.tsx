'use client'

/**
 * B2B DASHBOARD
 * - KPIs: pedidos, receita, ticket, hoje
 * - Gráfico de evolução diária
 * - Top produtos
 * - Por marketplace
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type DashboardData = {
  ok: boolean
  empty?: boolean
  message?: string
  contas: number
  resumo: { pedidos: number; receita: number; unidades: number; ticket_medio: number; pedidos_hoje: number; receita_hoje: number }
  evolucao: { data: string; pedidos: number; receita: number; unidades: number }[]
  top_produtos: { sku: string; nome: string; marca: string; unidades: number; receita: number; pedidos: number }[]
  por_marketplace: { plataforma: string; nickname: string; pedidos: number; receita: number; unidades: number }[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function B2bDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(6)

  useEffect(() => {
    fetch(`/api/b2b/dashboard?meses=${meses}`)
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false) })
  }, [meses])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
  if (!data) return null

  if (data.empty) {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '40px auto' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Bem-vindo!</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{data.message}</p>
          <Link href="/b2b/marketplace" style={{ display: 'inline-block', padding: '10px 20px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            🔗 Vincular conta de marketplace
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>📊 Dashboard</h1>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0 0' }}>{data.contas} conta(s) vinculada(s)</p>
        </div>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
          <option value={1}>Último mês</option>
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi label="Pedidos" value={data.resumo.pedidos.toLocaleString('pt-BR')} color="#3b82f6" />
        <Kpi label="Receita" value={fmtBRL(data.resumo.receita)} color="#10b981" />
        <Kpi label="Ticket médio" value={fmtBRL(data.resumo.ticket_medio)} color="#8b5cf6" />
        <Kpi label="Hoje" value={`${data.resumo.pedidos_hoje} (${fmtBRL(data.resumo.receita_hoje)})`} color="#f59e0b" />
      </div>

      {data.evolucao.length > 0 && <GraficoEvolucao data={data.evolucao} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>🏆 Top 10 Produtos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.top_produtos.map((p, i) => (
              <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: '#fafbfc', borderRadius: 4 }}>
                <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : '#9ca3af', fontSize: 11 }}>#{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#111827', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  <div style={{ fontSize: 9, color: '#6b7280' }}>{p.marca} • {p.pedidos} vendas</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>{fmtBRL(p.receita)}</div>
                  <div style={{ fontSize: 9, color: '#6b7280' }}>×{p.unidades}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>🔗 Por Marketplace</div>
          {data.por_marketplace.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: 20 }}>Nenhuma conta vinculada</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.por_marketplace.map((m, i) => (
                <div key={i} style={{ padding: 10, background: '#fafbfc', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{m.nickname}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'capitalize' }}>{m.plataforma}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{fmtBRL(m.receita)}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{m.pedidos} pedidos</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GrafitoChartPlaceholder() { return null }

function GraficoEvolucao({ data }: { data: { data: string; pedidos: number; receita: number }[] }) {
  const W = 1300, H = 220, P = 40
  const maxReceita = Math.max(...data.map((d) => d.receita), 1)
  const stepX = data.length > 1 ? (W - 2 * P) / (data.length - 1) : 0

  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb', marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>📈 Evolução de Receita ({data.length} dias)</div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <line key={p} x1={P} y1={y} x2={W - P} y2={y} stroke="#e5e7eb" strokeWidth="1" />
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = H - P - p * (H - 2 * P)
          return <text key={p} x={P - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtBRL(p * maxReceita)}</text>
        })}
        {data.length > 1 && (
          <path
            d={data.map((d, i) => {
              const x = P + i * stepX
              const y = H - P - (d.receita / maxReceita) * (H - 2 * P)
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ')}
            stroke="#3b82f6"
            strokeWidth="2"
            fill="none"
          />
        )}
        {data.map((d, i) => {
          const x = P + i * stepX
          const y = H - P - (d.receita / maxReceita) * (H - 2 * P)
          return <circle key={d.data} cx={x} cy={y} r="3" fill="#3b82f6"><title>{d.data}: {fmtBRL(d.receita)}</title></circle>
        })}
      </svg>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  )
}
