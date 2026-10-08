'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface ABCProduct {
  id: string
  sku: string
  nome: string
  marca: string
  receita: number
  comissao: number
  lucro: number
  qtd_vendida: number
  pct: number
  pctAcumulado: number
  classe: 'A' | 'B' | 'C'
}

const CLASSE_COLORS: Record<string, { bg: string; text: string; emoji: string }> = {
  A: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', emoji: '🟢' },
  B: { bg: 'rgba(234,179,8,0.15)', text: '#eab308', emoji: '🟡' },
  C: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', emoji: '🔴' },
}

export default function CurvaABCPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ produtos: ABCProduct[]; resumo: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/products/abc?days=${days}`)
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

  const filtered = data?.produtos.filter(p => filter === 'all' || p.classe === filter) || []

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>
              📈 Curva ABC
            </h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>
              Classificação por faturamento: A = 80% • B = 15% • C = 5%
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }}>
              <option value={30}>Últimos 30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias (recomendado)</option>
              <option value={180}>180 dias</option>
              <option value={365}>1 ano</option>
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }}>
              <option value="all">Todas as classes</option>
              <option value="A">🟢 Só A</option>
              <option value="B">🟡 Só B</option>
              <option value="C">🔴 Só C</option>
            </select>
          </div>
        </div>

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              <Card label="Total Produtos" value={data.resumo.total_produtos} color="#a78bfa" />
              <Card label="🟢 Classe A" value={`${data.resumo.classe_a} (R$ ${(data.resumo.receita_classe_a / 1000).toFixed(1)}k)`} color="#22c55e" />
              <Card label="🟡 Classe B" value={`${data.resumo.classe_b} (R$ ${(data.resumo.receita_classe_b / 1000).toFixed(1)}k)`} color="#eab308" />
              <Card label="🔴 Classe C" value={`${data.resumo.classe_c} (R$ ${(data.resumo.receita_classe_c / 1000).toFixed(1)}k)`} color="#ef4444" />
            </div>

            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                <thead>
                  <tr style={{ background: '#0d0d25' }}>
                    <th style={{ padding: 12, textAlign: 'left', color: '#a78bfa' }}>#</th>
                    <th style={{ padding: 12, textAlign: 'left', color: '#a78bfa' }}>Classe</th>
                    <th style={{ padding: 12, textAlign: 'left', color: '#a78bfa' }}>Produto</th>
                    <th style={{ padding: 12, textAlign: 'right', color: '#a78bfa' }}>Qtd</th>
                    <th style={{ padding: 12, textAlign: 'right', color: '#a78bfa' }}>Receita</th>
                    <th style={{ padding: 12, textAlign: 'right', color: '#a78bfa' }}>Lucro</th>
                    <th style={{ padding: 12, textAlign: 'right', color: '#a78bfa' }}>% Individual</th>
                    <th style={{ padding: 12, textAlign: 'right', color: '#a78bfa' }}>% Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const c = CLASSE_COLORS[p.classe]
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid #2a2a4a' }}>
                        <td style={{ padding: 10, color: '#7070a0' }}>{i + 1}</td>
                        <td style={{ padding: 10 }}>
                          <span style={{ background: c.bg, color: c.text, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{c.emoji} {p.classe}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ color: '#d0c0ff' }}>{p.nome.substring(0, 50)}{p.nome.length > 50 ? '...' : ''}</div>
                          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>{p.sku} • {p.marca}</div>
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#a78bfa' }}>{p.qtd_vendida}</td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>R$ {p.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#22c55e' }}>R$ {p.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: 10, textAlign: 'right', color: '#d0c0ff' }}>{p.pct.toFixed(1)}%</td>
                        <td style={{ padding: 10, textAlign: 'right', color: c.text, fontWeight: 600 }}>{p.pctAcumulado.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
