'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Cliente {
  customer_id: string
  total_pedidos: number
  total_gasto: number
  primeira_compra: string
  ultima_compra: string
  canais: string[]
  ticket_medio: number
  recompra: boolean
}

type Tab = 'ltv' | 'recompra' | 'ticket'

export default function ClientesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ topLTV: Cliente[]; topRecompra: Cliente[]; topTicket: Cliente[]; resumo: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('ltv')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/relatorios/clientes').then(r => r.json()).then(j => {
      if (j.success) setData(j.data)
      setLoading(false)
    })
  }, [])

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  const list = tab === 'ltv' ? data.topLTV : tab === 'recompra' ? data.topRecompra : data.topTicket

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>👥 Top Clientes (LTV)</h1>
          <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Identifique os clientes mais valiosos, recompra e ticket médio</div>
        </div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="👥 Total Clientes" value={data.resumo.total_clientes_unicos.toLocaleString('pt-BR')} color="#a78bfa" />
          <Card label="🔄 Recompraram" value={data.resumo.clientes_recompraram.toLocaleString('pt-BR')} color="#22c55e" />
          <Card label="📊 Taxa Recompra" value={`${data.resumo.taxa_recompra.toFixed(1)}%`} color="#60a5fa" />
          <Card label="💰 LTV Médio" value={`R$ ${data.resumo.ltv_medio.toFixed(2)}`} color="#eab308" />
          <Card label="🏆 Top 10 %" value={`${data.resumo.top_10_pct_faturamento.toFixed(1)}%`} color="#f472b6" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <TabBtn active={tab === 'ltv'} onClick={() => setTab('ltv')}>💰 Por LTV</TabBtn>
          <TabBtn active={tab === 'recompra'} onClick={() => setTab('recompra')}>🔄 Por Recompra</TabBtn>
          <TabBtn active={tab === 'ticket'} onClick={() => setTab('ticket')}>🎯 Por Ticket</TabBtn>
        </div>

        {/* Tabela */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0a1a', borderBottom: '1px solid #2a2a4a' }}>
                <th style={th}>#</th>
                <th style={th}>Cliente</th>
                <th style={th}>Pedidos</th>
                <th style={th}>LTV</th>
                <th style={th}>Ticket Médio</th>
                <th style={th}>Última Compra</th>
                <th style={th}>Canais</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.customer_id} onClick={() => router.push(`/admin/clientes/${c.customer_id}`)} style={{ borderBottom: '1px solid #1a1a3a', cursor: 'pointer' }}>
                  <td style={td}>
                    <div style={{ width: 26, height: 26, borderRadius: 4, background: i < 3 ? '#eab308' : '#2a2a4a', color: i < 3 ? '#000' : '#7070a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85em' }}>
                      {i + 1}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ color: '#d0c0ff', fontFamily: 'monospace', fontSize: '0.85em' }}>
                      {c.customer_id.slice(0, 8)}...
                    </div>
                    <div style={{ color: '#7070a0', fontSize: '0.7em' }}>
                      Desde {new Date(c.primeira_compra).toLocaleDateString('pt-BR')}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{ color: '#a78bfa', fontWeight: 700 }}>{c.total_pedidos}</span>
                  </td>
                  <td style={td}>
                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.05em' }}>
                      R$ {c.total_gasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ color: '#eab308' }}>R$ {c.ticket_medio.toFixed(2)}</span>
                  </td>
                  <td style={td}>
                    <span style={{ color: '#b0b0cc' }}>{new Date(c.ultima_compra).toLocaleDateString('pt-BR')}</span>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.canais.map(canal => (
                        <span key={canal} style={{ padding: '2px 6px', background: '#0a0a1a', color: '#b0b0cc', borderRadius: 3, fontSize: '0.7em' }}>
                          {canal}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={td}>
                    {c.recompra ? (
                      <span style={{ padding: '3px 8px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, fontSize: '0.75em', fontWeight: 600 }}>🔄 Recompra</span>
                    ) : (
                      <span style={{ padding: '3px 8px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: 4, fontSize: '0.75em' }}>1ª vez</span>
                    )}
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

const th: React.CSSProperties = { padding: '12px', textAlign: 'left', color: '#7070a0', fontSize: '0.75em', fontWeight: 600 }
const td: React.CSSProperties = { padding: '12px', fontSize: '0.85em' }

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px',
      background: active ? '#a78bfa' : 'transparent',
      color: active ? '#000' : '#b0b0cc',
      border: `1px solid ${active ? '#a78bfa' : '#2a2a4a'}`,
      borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85em',
    }}>
      {children}
    </button>
  )
}
