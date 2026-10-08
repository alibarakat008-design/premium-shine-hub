'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface DataSaz {
  resumo: { total_pedidos: number; total_receita: number; total_itens: number; ticket_medio: number }
  vendas_por_mes: { key: string; mes: string; pedidos: number; receita: number; itens: number; variacao?: number }[]
  vendas_por_dia_semana: { dia: string; pedidos: number; receita: number }[]
  vendas_por_horario: { hora: number; pedidos: number }[]
  top_por_mes: { mes: string; top: { sku: string; nome: string; qtd: number; receita: number }[] }[]
}

export default function SazonalidadePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DataSaz | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(12)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch(`/api/relatorios/sazonalidade?meses=${meses}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [meses])

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando análise de sazonalidade...</div>
  }

  const maxMesReceita = Math.max(...data.vendas_por_mes.map(m => m.receita), 1)
  const maxDiaReceita = Math.max(...data.vendas_por_dia_semana.map(d => d.receita), 1)
  const maxHoraPedidos = Math.max(...data.vendas_por_horario.map(h => h.pedidos), 1)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📅 Sazonalidade de Vendas</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Identifique padrões, meses fortes, melhores dias e horários</div>
          </div>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último ano</option>
            <option value={24}>Últimos 2 anos</option>
          </select>
        </div>

        {/* Cards de Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="📦 Pedidos" value={data.resumo.total_pedidos.toLocaleString('pt-BR')} color="#a78bfa" />
          <Card label="💰 Receita" value={`R$ ${data.resumo.total_receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#22c55e" />
          <Card label="🛍️ Itens" value={data.resumo.total_itens.toLocaleString('pt-BR')} color="#60a5fa" />
          <Card label="🎯 Ticket Médio" value={`R$ ${data.resumo.ticket_medio.toFixed(2)}`} color="#eab308" />
        </div>

        {/* Vendas por Mês */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>📆 Vendas por Mês</h3>
          {data.vendas_por_mes.length === 0 ? (
            <div style={{ color: '#7070a0', padding: 30, textAlign: 'center' }}>Sem dados no período</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 240, marginTop: 16, padding: '0 4px' }}>
              {data.vendas_por_mes.map((m) => {
                const altura = (m.receita / maxMesReceita) * 200
                const cor = (m.variacao || 0) > 10 ? '#22c55e' : (m.variacao || 0) < -10 ? '#ef4444' : '#a78bfa'
                return (
                  <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 30 }}>
                    <div style={{ fontSize: '0.7em', color: '#b0b0cc', marginBottom: 4 }}>R$ {m.receita.toFixed(0)}</div>
                    <div
                      title={`${m.mes}: R$ ${m.receita.toFixed(2)} (${m.pedidos} pedidos)\nVariação: ${(m.variacao || 0).toFixed(1)}%`}
                      style={{ width: '100%', height: `${altura}px`, background: cor, borderRadius: '4px 4px 0 0', minHeight: 2 }}
                    />
                    <div style={{ fontSize: '0.7em', color: '#7070a0', marginTop: 6 }}>{m.mes}</div>
                    {m.variacao !== undefined && Math.abs(m.variacao) > 5 && (
                      <div style={{ fontSize: '0.65em', color: cor, fontWeight: 700 }}>
                        {m.variacao > 0 ? '↑' : '↓'} {Math.abs(m.variacao).toFixed(0)}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          {/* Vendas por Dia da Semana */}
          <div style={cardStyle}>
            <h3 style={titleStyle}>📅 Por Dia da Semana</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {data.vendas_por_dia_semana.map((d) => {
                const w = (d.receita / maxDiaReceita) * 100
                return (
                  <div key={d.dia}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85em' }}>
                      <span style={{ color: '#d0c0ff' }}>{d.dia}</span>
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>R$ {d.receita.toFixed(0)} • {d.pedidos} pedidos</span>
                    </div>
                    <div style={{ height: 8, background: '#0a0a1a', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${w}%`, height: '100%', background: 'linear-gradient(90deg, #a78bfa, #22c55e)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Vendas por Horário */}
          <div style={cardStyle}>
            <h3 style={titleStyle}>🕐 Por Horário do Dia</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, marginTop: 12 }}>
              {data.vendas_por_horario.map((h) => {
                const altura = (h.pedidos / maxHoraPedidos) * 140
                return (
                  <div key={h.hora} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div title={`${h.hora}h: ${h.pedidos} pedidos`} style={{ width: '100%', height: `${altura}px`, background: h.pedidos > 0 ? '#60a5fa' : '#1a1a3a', borderRadius: '2px 2px 0 0', minHeight: 2 }} />
                    {h.hora % 3 === 0 && <div style={{ fontSize: '0.6em', color: '#7070a0', marginTop: 4 }}>{h.hora}h</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(96,165,250,0.08)', border: '1px solid #60a5fa', borderRadius: 6, fontSize: '0.8em', color: '#b0b0cc' }}>
              💡 <strong style={{ color: '#60a5fa' }}>Pico de vendas:</strong> {
                (() => {
                  const topHora = data.vendas_por_horario.reduce((a, b) => a.pedidos > b.pedidos ? a : b)
                  return `${topHora.hora}h (${topHora.pedidos} pedidos)`
                })()
              }
            </div>
          </div>
        </div>

        {/* Top Produtos por Mês */}
        {data.top_por_mes.length > 0 && (
          <div style={cardStyle}>
            <h3 style={titleStyle}>🏆 Top 5 Produtos por Mês</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.top_por_mes.length}, 1fr)`, gap: 12, marginTop: 16 }}>
              {data.top_por_mes.map((m) => (
                <div key={m.mes}>
                  <h4 style={{ color: '#a78bfa', marginBottom: 8, fontSize: '1em' }}>{m.mes}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {m.top.map((p, i) => (
                      <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#0a0a1a', borderRadius: 4 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 4, background: i === 0 ? '#eab308' : '#2a2a4a', color: i === 0 ? '#000' : '#7070a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75em', fontWeight: 700 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#d0c0ff', fontSize: '0.8em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>{p.qtd} un. • R$ {p.receita.toFixed(0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }
const titleStyle: React.CSSProperties = { color: '#a78bfa', margin: 0 }

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
