'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface GiroProduto {
  product_id: string
  sku: string
  nome: string
  marca: string
  estoque: number
  estoque_minimo: number
  custo: number
  preco: number
  capital_empatado: number
  qtd_vendida_periodo: number
  velocidade_diaria: number
  cobertura_dias: number
  dias_sem_venda: number
  ultima_venda: string | null
  status: 'parado' | 'critico' | 'atencao' | 'ok' | 'sem_estoque'
}

interface Resumo {
  total_produtos: number
  sem_estoque: number
  critico: number
  atencao: number
  ok: number
  parado: number
  capital_empatado_total: number
  produtos_sem_venda: number
}

const STATUS_COLORS: Record<string, { bg: string; text: string; emoji: string; label: string }> = {
  sem_estoque: { bg: 'rgba(239,68,68,0.2)', text: '#ef4444', emoji: '❌', label: 'Sem Estoque' },
  critico: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', emoji: '🚨', label: 'Crítico' },
  atencao: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', emoji: '⚠️', label: 'Atenção' },
  ok: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', emoji: '✅', label: 'OK' },
  parado: { bg: 'rgba(107,114,128,0.15)', text: 'var(--psh-text-secondary, #6b7280)', emoji: '💤', label: 'Parado' },
}

export default function GiroPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ produtos: GiroProduto[]; resumo: Resumo } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [filter, setFilter] = useState<'all' | 'parado' | 'critico' | 'atencao' | 'ok' | 'sem_estoque'>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/relatorios/giro-estoque?dias=${days}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (status === 'loading' || (loading && !data)) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando...
      </div>
    )
  }

  const filtered = data?.produtos.filter(p => filter === 'all' || p.status === filter) || []
  // Ordenar por urgência
  const order: any = { sem_estoque: 0, critico: 1, atencao: 2, ok: 3, parado: 4 }
  filtered.sort((a, b) => order[a.status] - order[b.status])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📊 Giro de Estoque</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Análise de velocidade de vendas e cobertura de estoque</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }}>
              <option value={15}>Últimos 15 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }}>
              <option value="all">Todos</option>
              <option value="critico">🚨 Crítico</option>
              <option value="atencao">⚠️ Atenção</option>
              <option value="ok">✅ OK</option>
              <option value="parado">💤 Parados</option>
              <option value="sem_estoque">❌ Sem Estoque</option>
            </select>
          </div>
        </div>

        {data && (
          <>
            {/* Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 20 }}>
              <Card label="Total" value={data.resumo.total_produtos} color="#a78bfa" />
              <Card label="❌ Sem Est" value={data.resumo.sem_estoque} color="#ef4444" />
              <Card label="🚨 Crítico" value={data.resumo.critico} color="#ef4444" />
              <Card label="⚠️ Atenção" value={data.resumo.atencao} color="#f97316" />
              <Card label="✅ OK" value={data.resumo.ok} color="#22c55e" />
              <Card label="💤 Parado" value={data.resumo.parado} color="#6b7280" />
              <Card label="💰 Capital" value={`R$ ${(data.resumo.capital_empatado_total / 1000).toFixed(1)}k`} color="#a78bfa" />
            </div>

            {/* Lista */}
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                <thead>
                  <tr style={{ background: '#0d0d25' }}>
                    <th style={{ padding: 10, textAlign: 'left', color: '#a78bfa' }}>Status</th>
                    <th style={{ padding: 10, textAlign: 'left', color: '#a78bfa' }}>Produto</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Estoque</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Vendas {days}d</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Vel/dia</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Cobertura</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Última Venda</th>
                    <th style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>Capital</th>
                    <th style={{ padding: 10, textAlign: 'center', color: '#a78bfa' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const s = STATUS_COLORS[p.status]
                    return (
                      <tr key={p.product_id} style={{ borderTop: '1px solid #2a2a4a' }}>
                        <td style={{ padding: 10 }}>
                          <span style={{ background: s.bg, color: s.text, padding: '2px 8px', borderRadius: 6, fontSize: '0.85em', fontWeight: 600 }}>{s.emoji} {s.label}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ color: '#d0c0ff' }}>{p.nome.substring(0, 40)}{p.nome.length > 40 ? '...' : ''}</div>
                          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>{p.sku} • {p.marca}</div>
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', color: p.estoque === 0 ? '#ef4444' : p.estoque < p.estoque_minimo ? '#f97316' : '#d0c0ff' }}>
                          {p.estoque} <span style={{ color: '#7070a0', fontSize: '0.8em' }}>(mín {p.estoque_minimo})</span>
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', color: p.qtd_vendida_periodo > 0 ? '#22c55e' : '#7070a0' }}>{p.qtd_vendida_periodo}</td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>{p.velocidade_diaria}</td>
                        <td style={{ padding: 10, textAlign: 'right', color: p.cobertura_dias < 7 ? '#ef4444' : p.cobertura_dias < 15 ? '#f97316' : p.cobertura_dias < 30 ? '#eab308' : '#22c55e' }}>
                          {p.cobertura_dias < 999 ? `${p.cobertura_dias}d` : '∞'}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', color: p.dias_sem_venda > 60 ? 'var(--psh-text-secondary, #6b7280)' : p.dias_sem_venda > 30 ? '#f97316' : '#d0c0ff' }}>
                          {p.ultima_venda || 'Nunca'}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>R$ {p.capital_empatado.toFixed(0)}</td>
                        <td style={{ padding: 10, textAlign: 'center' }}>
                          <button
                            onClick={() => router.push(`/admin/produtos/${p.sku}`)}
                            style={{
                              padding: '4px 8px', background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa',
                              color: '#a78bfa', borderRadius: 4, cursor: 'pointer', fontSize: '0.75em',
                            }}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>
                  Nenhum produto com esse filtro.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
      <div style={{ color: '#7070a0', fontSize: '0.7em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
