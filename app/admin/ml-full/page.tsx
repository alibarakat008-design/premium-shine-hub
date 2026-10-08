'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Listing {
  id: string
  listing_id: string
  sku?: string
  nome?: string
  foto?: string | null
  preco_atual: number | null
  preco_promocional: number | null
  stock_ml: number | null
  estoque_local: number | null
  health: number | null
  condition: string | null
  vendas_total: number | null
}

export default function MLFullPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ listings: Listing[]; stats: any } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch('/api/ml/full')
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
  }

  useEffect(load, [])

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando dados do Mercado Envios Full...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📦 Mercado Envios Full</h1>
          <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Produtos armazenados e enviados pelo Mercado Livre (estoque terceirizado)</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Card label="📦 Produtos no FULL" value={data.stats.total_produtos} color="#a78bfa" />
          <Card label="💰 Receita de Vendas" value={`R$ ${data.stats.receita_total.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="#22c55e" />
          <Card label="📈 Vendas FULL" value={data.stats.total_vendas.toLocaleString('pt-BR')} color="#60a5fa" />
          <Card label="💸 Custo Armazenagem" value={`R$ ${data.stats.custo_armazenagem_estimado}/mês`} color="#f97316" />
        </div>

        {/* Saúde */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="✅ Saudável (Health ≥ 80%)" value={data.stats.healthy} color="#22c55e" />
          <Card label="⚠️ Atenção (50-80%)" value={data.stats.warning} color="#eab308" />
          <Card label="🚨 Crítico (< 50%)" value={data.stats.critical} color="#ef4444" />
        </div>

        {/* Margem FULL */}
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e', borderRadius: 12, padding: 16, marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.75em' }}>📊 Unidades Vendidas</div>
            <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700 }}>{data.stats.unidades_vendidas}</div>
          </div>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.75em' }}>🎯 Ticket Médio</div>
            <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>R$ {data.stats.ticket_medio.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.75em' }}>🏷️ Estoque no FULL</div>
            <div style={{ color: '#eab308', fontSize: '1.4em', fontWeight: 700 }}>{data.stats.estoque_total_full} un.</div>
          </div>
        </div>

        {/* Lista */}
        {data.listings.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 60, textAlign: 'center', color: '#7070a0' }}>
            Nenhum produto no Mercado Envios Full.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {data.listings.map(l => {
              const health = Number(l.health || 0)
              const healthCor = health >= 80 ? '#22c55e' : health >= 50 ? '#eab308' : '#ef4444'
              const emPromo = l.preco_promocional && l.preco_atual && l.preco_promocional < l.preco_atual
              return (
                <div key={l.id} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    {l.foto ? (
                      <img src={l.foto} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 8, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em' }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0c0ff', fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome || 'Sem nome'}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.7em' }}>{l.sku}</div>
                      {emPromo ? (
                        <div>
                          <span style={{ color: '#7070a0', textDecoration: 'line-through', fontSize: '0.7em' }}>R$ {l.preco_atual?.toFixed(2)}</span>{' '}
                          <span style={{ color: '#22c55e', fontWeight: 700 }}>R$ {l.preco_promocional?.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div style={{ color: '#a78bfa', fontWeight: 600 }}>R$ {l.preco_atual?.toFixed(2) || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.8em' }}>
                    <div><span style={{ color: '#7070a0' }}>Stock FULL:</span> <span style={{ color: '#eab308', fontWeight: 600 }}>{l.stock_ml || 0}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Estoque local:</span> <span style={{ color: '#b0b0cc' }}>{l.estoque_local || 0}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Vendas:</span> <span style={{ color: '#a78bfa' }}>{l.vendas_total || 0}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Health:</span> <span style={{ color: healthCor, fontWeight: 700 }}>{health.toFixed(0)}%</span></div>
                  </div>
                  <div style={{ height: 4, background: '#0a0a1a', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(health, 100)}%`, height: '100%', background: healthCor }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
