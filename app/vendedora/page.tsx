'use client'

/**
 * =====================================================
 * DASHBOARD DA VENDEDORA
 * =====================================================
 * Caminho: app/vendedora/page.tsx
 *
 * Vendedora logada vê:
 *   - Suas vendas do mês
 *   - Progresso da meta
 *   - Comissões ganhas
 *   - Ranking
 *   - Catálogo rápido pra fazer pedido
 * =====================================================
 */

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface VendedoraData {
  id: string
  nome: string
  vendas_mes: {
    quantidade: number
    valor: number
    comissao: number
  }
  meta: {
    valor: number
    percentual_atingido: number
  }
  comissao_config: {
    pct: number
  }
  ranking_posicao?: number
}

export default function VendedoraDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [data, setData] = useState<VendedoraData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login?callbackUrl=/vendedora')
    if (status === 'authenticated' && session?.user?.role !== 'vendedora') {
      router.push('/admin')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') fetchData()
  }, [status])

  async function fetchData() {
    try {
      const [meRes, rankRes] = await Promise.all([
        fetch('/api/vendedoras/me'),
        fetch('/api/vendedoras/ranking'),
      ])
      const meJson = await meRes.json()
      const rankJson = await rankRes.json()

      const myRank = rankJson.data?.find((r: any) => r.vendedora_id === session?.user?.id)

      setData({
        ...meJson.data,
        ranking_posicao: myRank?.posicao,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || status === 'loading' || !data) {
    return <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <h1 style={{ color: '#d0c0ff', fontSize: '2em', marginBottom: 4 }}>👩‍💼 Painel da Vendedora</h1>
        <div style={{ color: '#7070a0', fontSize: '0.9em', marginBottom: 24 }}>
          Olá, <strong style={{ color: '#f472b6' }}>{data.nome}</strong> 💕
        </div>

        {/* Cards de performance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={statBox}>
            <div style={statLabel}>Vendas Mês</div>
            <div style={{ ...statValue, color: '#a78bfa' }}>{data.vendas_mes.quantidade}</div>
            <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>pedidos</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>Faturado</div>
            <div style={{ ...statValue, color: '#22c55e' }}>R$ {data.vendas_mes.valor.toFixed(0)}</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>Comissão</div>
            <div style={{ ...statValue, color: '#eab308' }}>R$ {data.vendas_mes.comissao.toFixed(2)}</div>
            <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>{data.comissao_config.pct}%</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>Ranking</div>
            <div style={{ ...statValue, color: '#f472b6' }}>
              {data.ranking_posicao ? `${data.ranking_posicao}º` : '—'}
            </div>
            <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>do mês</div>
          </div>
        </div>

        {/* Barra de progresso da meta */}
        <div style={cardStyle}>
          <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 12 }}>🎯 Meta do Mês</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9em' }}>
            <span style={{ color: '#b0b0cc' }}>R$ {data.vendas_mes.valor.toFixed(0)} de R$ {data.meta.valor.toFixed(0)}</span>
            <strong style={{ color: data.meta.percentual_atingido >= 100 ? '#22c55e' : '#a78bfa' }}>
              {data.meta.percentual_atingido.toFixed(1)}%
            </strong>
          </div>
          <div style={{ background: '#0d0d25', borderRadius: 8, height: 20, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, data.meta.percentual_atingido)}%`,
              background: data.meta.percentual_atingido >= 100
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : 'linear-gradient(90deg, #a78bfa, #f472b6)',
              transition: 'width 0.5s',
            }} />
          </div>
          {data.meta.percentual_atingido >= 100 && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(34,197,94,0.1)', borderRadius: 8, color: '#22c55e', fontSize: '0.9em' }}>
              🎉 Você bateu a meta! Bônus será creditado no próximo pagamento.
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>⚡ Ações Rápidas</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <button onClick={() => router.push('/vendedora/novo-pedido')} style={actionBtn}>📱 Fazer Pedido</button>
            <button onClick={() => router.push('/vendedora/meus-pedidos')} style={actionBtn}>📦 Meus Pedidos</button>
            <button onClick={() => router.push('/vendedora/catalogo')} style={actionBtn}>🌸 Ver Catálogo</button>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 20, background: 'rgba(96,165,250,0.05)' }}>
          <h3 style={{ color: '#60a5fa', marginBottom: 8 }}>💡 Dicas de Venda</h3>
          <ul style={{ color: '#b0b0cc', fontSize: '0.9em', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Poste stories no Instagram mostrando os perfumes com link na bio</li>
            <li>Atenda clientes pelo WhatsApp com catálogo atualizado</li>
            <li>Bata a meta todo mês pra ganhar bônus extra</li>
            <li>Quanto mais vendas, mais alto no ranking 🏆</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const statBox = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' as const }
const statLabel = { color: '#7070a0', fontSize: '0.7em', textTransform: 'uppercase' as const, marginBottom: 4 }
const statValue = { fontSize: '1.4em', fontWeight: 'bold' as const }
const actionBtn = { background: '#1a1a35', border: '1px solid #2a2a4a', color: '#d0c0ff', padding: 16, borderRadius: 8, cursor: 'pointer', fontSize: '0.9em' } as const
