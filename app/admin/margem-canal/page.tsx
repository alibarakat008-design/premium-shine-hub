'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Canal {
  canal: string
  pedidos: number
  receita: number
  cmv: number
  comissao: number
  lucro: number
  margem_pct: number
}

const CANAL_INFO: Record<string, { emoji: string; cor: string }> = {
  mercado_livre: { emoji: '🏪', cor: '#ffe600' },
  shopee: { emoji: '🛒', cor: '#ee4d2d' },
  site_b2c: { emoji: '🌐', cor: '#a78bfa' },
  whatsapp: { emoji: '💬', cor: '#22c55e' },
  b2b: { emoji: '📋', cor: '#60a5fa' },
  vendedora: { emoji: '👩‍💼', cor: '#f472b6' },
  outros: { emoji: '📦', cor: '#7070a0' },
}

export default function MargemCanalPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ canais: Canal[]; resumo: any; comissoes: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(6)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch(`/api/relatorios/margem-canal?meses=${meses}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [meses])

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📊 Margem por Canal de Venda</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Compare rentabilidade: ML, Shopee, Site, B2B, Vendedoras</div>
          </div>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={selectStyle}>
            <option value={1}>Último mês</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último ano</option>
          </select>
        </div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="💰 Receita Total" value={`R$ ${data.resumo.receita_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#22c55e" />
          <Card label="💵 Lucro Total" value={`R$ ${data.resumo.lucro_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#a78bfa" />
          <Card label="📊 Margem Média" value={`${data.resumo.margem_media.toFixed(1)}%`} color="#eab308" />
          <Card label="🏆 Melhor Canal" value={CANAL_INFO[data.resumo.melhor_canal]?.emoji + ' ' + (data.resumo.melhor_canal || '-')} color="#22c55e" />
        </div>

        {/* Tabela comparativa */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0a1a', borderBottom: '1px solid #2a2a4a' }}>
                <th style={th}>Canal</th>
                <th style={th}>Pedidos</th>
                <th style={th}>Receita</th>
                <th style={th}>CMV</th>
                <th style={th}>Comissão</th>
                <th style={th}>Lucro</th>
                <th style={th}>Margem</th>
                <th style={th}>% Receita</th>
              </tr>
            </thead>
            <tbody>
              {data.canais.map(c => {
                const info = CANAL_INFO[c.canal] || { emoji: '📦', cor: '#7070a0' }
                const margemCor = c.margem_pct > 30 ? '#22c55e' : c.margem_pct > 15 ? '#eab308' : '#ef4444'
                const pctReceita = data.resumo.receita_total > 0 ? (c.receita / data.resumo.receita_total) * 100 : 0
                return (
                  <tr key={c.canal} style={{ borderBottom: '1px solid #1a1a3a' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: '1.3em' }}>{info.emoji}</div>
                        <div style={{ color: '#d0c0ff', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em' }}>{c.canal}</div>
                      </div>
                    </td>
                    <td style={td}>{c.pedidos}</td>
                    <td style={td}>
                      <div style={{ color: '#22c55e', fontWeight: 600 }}>R$ {c.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td style={td}>
                      <div style={{ color: '#f97316' }}>R$ {c.cmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td style={td}>
                      <div style={{ color: '#ef4444', fontSize: '0.85em' }}>R$ {c.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.7em' }}>{data.comissoes[c.canal] || 5}%</div>
                    </td>
                    <td style={td}>
                      <div style={{ color: c.lucro > 0 ? '#a78bfa' : '#ef4444', fontWeight: 700 }}>R$ {c.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td style={td}>
                      <div style={{ color: margemCor, fontWeight: 700, fontSize: '1.1em' }}>{c.margem_pct.toFixed(1)}%</div>
                      <div style={{ height: 6, background: '#0a0a1a', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(c.margem_pct, 100)}%`, height: '100%', background: margemCor }} />
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ color: '#b0b0cc' }}>{pctReceita.toFixed(1)}%</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Insights */}
        <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#a78bfa', margin: '0 0 12px 0' }}>💡 Insights</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {data.canais.map(c => {
              const info = CANAL_INFO[c.canal] || { emoji: '📦', cor: '#7070a0' }
              let insight = ''
              if (c.margem_pct > 35) insight = '✅ Margem saudável'
              else if (c.margem_pct > 20) insight = '⚠️ Margem ok, pode melhorar'
              else if (c.margem_pct > 0) insight = '🚨 Margem apertada'
              else insight = '❌ Prejuízo!'

              return (
                <div key={c.canal} style={{ background: '#0a0a1a', padding: 12, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '1.2em' }}>{info.emoji}</span>
                    <span style={{ color: '#d0c0ff', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.85em' }}>{c.canal}</span>
                  </div>
                  <div style={{ color: '#b0b0cc', fontSize: '0.9em' }}>{insight}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8 }
const th: React.CSSProperties = { padding: '12px', textAlign: 'left', color: '#7070a0', fontSize: '0.75em', fontWeight: 600 }
const td: React.CSSProperties = { padding: '12px', fontSize: '0.85em' }

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
