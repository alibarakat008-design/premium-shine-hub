'use client'

/**
 * =====================================================
 * DASHBOARD DO AFILIADO
 * =====================================================
 * Caminho: app/afiliado/page.tsx
 * (não loga — afiliado acessa via login)
 * =====================================================
 */

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface AfiliadoData {
  id: string
  nome: string
  slug: string
  comissao_pct: number
  pix_key: string
  saldo: number
  total_vendas: number
  total_comissao: number
}

interface LinkData {
  id: string
  slug: string
  url_completa: string
  cliques: number
  vendas: number
  comissao_gerada: number
}

export default function AfiliadoDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [afiliado, setAfiliado] = useState<AfiliadoData | null>(null)
  const [links, setLinks] = useState<LinkData[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login?callbackUrl=/afiliado')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchData()
  }, [status])

  async function fetchData() {
    try {
      const [afiliadoRes, linksRes] = await Promise.all([
        fetch('/api/afiliados/dashboard'),
        fetch('/api/affiliate-links'),
      ])
      const [afiliadoJson, linksJson] = await Promise.all([afiliadoRes.json(), linksRes.json()])
      setAfiliado(afiliadoJson.data)
      setLinks(linksJson.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(''), 2000)
  }

  async function solicitarSaque() {
    if (!afiliado || afiliado.saldo < 50) {
      alert('Saldo mínimo pra saque: R$ 50,00')
      return
    }
    if (!confirm(`Solicitar saque de R$ ${afiliado.saldo.toFixed(2)}?`)) return

    const res = await fetch('/api/afiliados/saque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: afiliado.saldo }),
    })
    const json = await res.json()
    if (json.success) {
      alert('Saque solicitado! PIX será enviado em até 24h úteis.')
      fetchData()
    } else {
      alert('Erro: ' + json.error)
    }
  }

  if (loading || status === 'loading') {
    return <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  if (!afiliado) {
    return <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 40, textAlign: 'center' }}>Afiliado não encontrado</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <h1 style={{ color: '#d0c0ff', fontSize: '2em', marginBottom: 4 }}>🔗 Painel do Afiliado</h1>
        <div style={{ color: '#7070a0', fontSize: '0.9em', marginBottom: 24 }}>
          Olá, <strong style={{ color: '#f472b6' }}>{afiliado.nome}</strong> · Slug: <code style={{ background: '#0d0d25', padding: '2px 8px', borderRadius: 4 }}>{afiliado.slug}</code>
        </div>

        {/* Cards de stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={statBox}>
            <div style={statLabel}>Saldo Disponível</div>
            <div style={{ ...statValue, color: '#22c55e', fontSize: '1.6em' }}>R$ {afiliado.saldo.toFixed(2)}</div>
            {afiliado.saldo >= 50 && (
              <button onClick={solicitarSaque} style={btnPrimary}>💸 Sacar via PIX</button>
            )}
          </div>
          <div style={statBox}>
            <div style={statLabel}>Total de Vendas</div>
            <div style={{ ...statValue, color: '#a78bfa' }}>{afiliado.total_vendas}</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>Comissão Total</div>
            <div style={{ ...statValue, color: '#60a5fa' }}>R$ {afiliado.total_comissao.toFixed(2)}</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>Sua Comissão</div>
            <div style={{ ...statValue, color: '#eab308' }}>{afiliado.comissao_pct}%</div>
          </div>
        </div>

        {/* Links de indicação */}
        <div style={cardStyle}>
          <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>🔗 Seus Links de Indicação</h2>

          {/* Link geral */}
          <div style={{ background: '#0d0d25', borderRadius: 10, padding: 16, marginBottom: 12, borderLeft: '3px solid #f472b6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#a78bfa', fontSize: '0.85em', textTransform: 'uppercase', marginBottom: 4 }}>Link Geral</div>
                <code style={{ color: '#d0c0ff', fontSize: '0.9em', wordBreak: 'break-all' }}>https://premiumshine.com.br/?ref={afiliado.slug}</code>
                <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 6 }}>
                  👁️ {links.find(l => !l.slug.includes('-'))?.cliques || 0} cliques · 🛒 {links.find(l => !l.slug.includes('-'))?.vendas || 0} vendas · 💰 R$ {links.find(l => !l.slug.includes('-'))?.comissao_gerada.toFixed(2) || '0,00'}
                </div>
              </div>
              <button onClick={() => copyLink(`https://premiumshine.com.br/?ref=${afiliado.slug}`)} style={btnSecondary}>
                {copied === `https://premiumshine.com.br/?ref=${afiliado.slug}` ? '✓ Copiado!' : '📋 Copiar'}
              </button>
            </div>
          </div>

          {/* Banners de marketing */}
          <h3 style={{ color: '#a78bfa', marginTop: 24, marginBottom: 12, fontSize: '1em' }}>📱 Banners Prontos</h3>
          <div style={{ background: '#0d0d25', borderRadius: 8, padding: 16, fontSize: '0.9em', color: '#b0b0cc' }}>
            <p style={{ marginBottom: 8 }}>💡 Mensagem pronta pra Instagram/WhatsApp:</p>
            <div style={{ background: '#12122a', padding: 12, borderRadius: 6, fontStyle: 'italic', borderLeft: '3px solid #f472b6' }}>
              "Descobri os melhores perfumes árabes do Brasil! 🌹 Comprei meu favorito e tá aprovadíssimo. Use meu link e ganhe desconto: https://premiumshine.com.br/?ref={afiliado.slug}"
            </div>
            <button onClick={() => copyLink(`Descobri os melhores perfumes árabes do Brasil! 🌹 Use meu link: https://premiumshine.com.br/?ref=${afiliado.slug}`)} style={{ ...btnSecondary, marginTop: 12 }}>
              📋 Copiar Mensagem
            </button>
          </div>
        </div>

        {/* Como funciona */}
        <div style={{ ...cardStyle, marginTop: 20, background: 'rgba(96,165,250,0.05)' }}>
          <h3 style={{ color: '#60a5fa', marginBottom: 8 }}>💡 Como funciona</h3>
          <ol style={{ color: '#b0b0cc', fontSize: '0.9em', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Compartilhe seu link nas redes sociais, WhatsApp, blogs</li>
            <li>Cliente clica e é marcado por 30 dias (cookie)</li>
            <li>Quando o cliente comprar, você ganha <strong style={{ color: '#a78bfa' }}>{afiliado.comissao_pct}% de comissão</strong></li>
            <li>Sua comissão fica disponível pra saque após confirmação do pagamento</li>
            <li>Saque via PIX quando atingir R$ 50,00 (mínimo)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const statBox = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' as const }
const statLabel = { color: '#7070a0', fontSize: '0.7em', textTransform: 'uppercase' as const, marginBottom: 4 }
const statValue = { fontSize: '1.4em', fontWeight: 'bold' as const }
const btnPrimary = { marginTop: 8, padding: '6px 12px', background: 'linear-gradient(90deg,#a78bfa,#f472b6)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.8em', fontWeight: 600, cursor: 'pointer', width: '100%' } as const
const btnSecondary = { padding: '8px 14px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6, cursor: 'pointer', fontSize: '0.85em' } as const
