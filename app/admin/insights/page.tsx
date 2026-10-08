'use client'

/**
 * INSIGHTS - Painel inteligente com análise automática
 * - Comparativo de hoje vs ontem vs semana passada
 * - Top produtos subindo/descendo
 * - Horário de pico
 * - Insights textuais gerados automaticamente
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Produto = {
  id: string
  sku: string
  nome: string
  foto: string | null
  qtd7: number
  qtdAnt: number
  receita7: number
  receitaAnt: number
  variacao_pct?: number
}

type Data = {
  kpis: any
  insights: string[]
  produtos: {
    subindo: Produto[]
    caindo: Produto[]
    top_7d: Produto[]
  }
  hora_pico: number
  horas: Record<string, number>
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function InsightsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/insights', {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 60000) // 1 min
    return () => clearInterval(i)
  }, [fetchData])

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando insights...</div>
  }

  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Erro: {error}</div>
  }

  const { kpis, insights, produtos, hora_pico, horas } = data
  const maxHora = Math.max(...Object.values(horas).map((v) => Number(v)), 1)
  const varCor = (v: number) => (v > 0 ? '#10b981' : v < 0 ? '#ef4444' : 'var(--psh-text-secondary, #6b7280)')

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>💡 Insights do Negócio</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>
            Análise automática • Atualiza a cada 1 min • {lastUpdate?.toLocaleTimeString('pt-BR') || 'agora'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchData}
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            ↻ Atualizar
          </button>
          <Link
            href="/admin/vendas-ao-vivo"
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            🔴 Ao Vivo
          </Link>
        </div>
      </div>

      {/* Insights textuais */}
      <div
        style={{
          padding: 16,
          background: 'linear-gradient(135deg, #faf5ff, #eff6ff)',
          border: '1px solid #e9d5ff',
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#6b21a8', margin: '0 0 8px 0' }}>🧠 Resumo automático</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {insights.map((line, i) => (
            <div key={i} style={{ fontSize: 14, color: 'var(--psh-text-primary, #111827)' }}>{line}</div>
          ))}
        </div>
      </div>

      {/* KPIs principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiComparativo
          label="📦 Pedidos Hoje"
          atual={kpis.hoje.pedidos}
          anterior={kpis.ontem.pedidos}
          variacao={kpis.variacao_dia_pedidos}
        />
        <KpiComparativo
          label="💰 Receita Hoje"
          atual={kpis.hoje.receita}
          anterior={kpis.ontem.receita}
          variacao={kpis.variacao_dia_receita}
          isCurrency
        />
        <KpiComparativo
          label="📅 Pedidos 7d"
          atual={kpis.ult_7d.pedidos}
          anterior={kpis.ant_7d.pedidos}
          variacao={kpis.variacao_semana_pedidos}
        />
        <KpiComparativo
          label="💵 Receita 7d"
          atual={kpis.ult_7d.receita}
          anterior={kpis.ant_7d.receita}
          variacao={kpis.variacao_semana_receita}
          isCurrency
        />
        <Kpi
          label="🎯 Ticket Médio Hoje"
          value={fmtBRL(kpis.hoje.ticket_medio || 0)}
          color="#3b82f6"
        />
        <Kpi
          label="⏰ Pico de Vendas"
          value={`${hora_pico}h`}
          color="#8b5cf6"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Subindo */}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>📈 Produtos em alta (7d vs 7d anterior)</h2>
          {produtos.subindo.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 13 }}>
              Nenhum produto com alta significativa
            </div>
          ) : (
            produtos.subindo.map((p) => (
              <ProdutoInsightRow key={p.id} produto={p} variacao={p.variacao_pct || 0} />
            ))
          )}
        </div>

        {/* Caindo */}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>📉 Produtos em queda (7d vs 7d anterior)</h2>
          {produtos.caindo.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 13 }}>
              Nenhum produto com queda significativa
            </div>
          ) : (
            produtos.caindo.map((p) => (
              <ProdutoInsightRow key={p.id} produto={p} variacao={p.variacao_pct || 0} />
            ))
          )}
        </div>
      </div>

      {/* Heatmap de horas */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>⏰ Distribuição de vendas por hora (últimos 7 dias)</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, marginTop: 12 }}>
          {Array.from({ length: 24 }, (_, h) => {
            const qtd = Number(horas[String(h)] || 0)
            const isPico = h === hora_pico
            return (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${h}h: ${qtd} vendas`}>
                <div style={{ fontSize: 9, color: isPico ? '#7c3aed' : 'var(--psh-text-secondary, #6b7280)', fontWeight: isPico ? 700 : 400 }}>{qtd || ''}</div>
                <div
                  style={{
                    width: '100%',
                    height: `${(qtd / maxHora) * 100}%`,
                    minHeight: 2,
                    background: isPico ? '#7c3aed' : qtd > 0 ? '#a78bfa' : 'var(--psh-border, #e5e7eb)',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: isPico ? '0 0 8px rgba(124,58,237,0.5)' : 'none',
                  }}
                />
                <div style={{ fontSize: 8, color: isPico ? '#7c3aed' : 'var(--psh-text-secondary, #9ca3af)', marginTop: 4, fontWeight: isPico ? 700 : 400 }}>{h}h</div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>
          💡 O horário <strong style={{ color: '#7c3aed' }}>{hora_pico}h</strong> é o pico de vendas dos últimos 7 dias. Use isso pra programar anúncios e promoções.
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

function KpiComparativo({
  label,
  atual,
  anterior,
  variacao,
  isCurrency,
}: {
  label: string
  atual: number
  anterior: number
  variacao: number
  isCurrency?: boolean
}) {
  const color = variacao > 0 ? '#10b981' : variacao < 0 ? '#ef4444' : 'var(--psh-text-secondary, #6b7280)'
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>
        {isCurrency ? fmtBRL(atual) : atual.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color }}>
        {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao)}% vs anterior ({isCurrency ? fmtBRL(anterior) : anterior})
      </div>
    </div>
  )
}

function ProdutoInsightRow({ produto, variacao }: { produto: Produto; variacao: number }) {
  const cor = variacao > 0 ? '#10b981' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      {produto.foto ? (
        <img src={produto.foto} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{produto.nome}</div>
        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{produto.sku} • {produto.qtd7} un (era {produto.qtdAnt})</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: cor }}>
        {variacao >= 0 ? '+' : ''}{variacao.toFixed(0)}%
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = { background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 8px 0' }
