'use client'

/**
 * =====================================================
 * PÁGINA DE GESTÃO MERCADO LIVRE
 * Premium Shine Hub
 * =====================================================
 * Conecta/desconecta contas ML
 * Mostra status, última sync, ações rápidas
 *
 * Caminho: app/admin/mercado-livre/page.tsx
 * =====================================================
 */

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface MLAccount {
  id: string
  nickname: string
  account_id: string
  company: { id: string; cnpj: string; nome_fantasia: string } | null
  ativa: boolean
  total_listings: number
  token_expira_em: string | null
  token_expirado: boolean
  ultima_sincronizacao: string | null
}

interface SyncResult {
  success: boolean
  message: string
  data?: any
}

function MercadoLivreContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [accounts, setAccounts] = useState<MLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [accountStats, setAccountStats] = useState<Record<string, any>>({})

  // Mensagens vindas do callback OAuth
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const nickname = searchParams.get('nickname')

    if (success === 'true' && nickname) {
      setMessage({ type: 'success', text: `Conta "${decodeURIComponent(nickname)}" conectada com sucesso!` })
    } else if (error) {
      setMessage({ type: 'error', text: `Erro: ${error}` })
    }

    // Limpar parâmetros da URL depois de 3s
    if (success || error) {
      setTimeout(() => {
        router.replace('/admin/mercado-livre')
      }, 3000)
    }
  }, [searchParams, router])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status !== 'loading') {
      fetchAccounts()
    }
  }, [status, router])

  // Carregar stats de cada conta (faturamento, vendas, etc)
  async function fetchAccountStats(accountId: string) {
    try {
      const res = await fetch(`/api/ml/account-stats?account_id=${accountId}`)
      const json = await res.json()
      if (json.success) {
        setAccountStats((prev) => ({ ...prev, [accountId]: json.data }))
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err)
    }
  }

  useEffect(() => {
    if (accounts.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const acc of accounts) {
        if (cancelled) return
        if (!accountStats[acc.id]) {
          try {
            const res = await fetch(`/api/ml/account-stats?account_id=${acc.id}`)
            const json = await res.json()
            if (json.success && !cancelled) {
              setAccountStats((prev) => ({ ...prev, [acc.id]: json.data }))
            }
          } catch (err) {
            console.error('Erro stats:', err)
          }
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  async function fetchAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/ml/accounts')
      const json = await res.json()
      setAccounts(json.data || [])
    } catch (err) {
      console.error('Erro ao buscar contas:', err)
    } finally {
      setLoading(false)
    }
  }

  // Conectar nova conta (redireciona pro OAuth)
  function connectAccount() {
    if (!session?.user?.id) return
    const state = session.user.id
    window.location.href = `/api/ml/auth?state=${state}`
  }

  // Desconectar conta
  async function disconnectAccount(accountId: string) {
    if (!confirm('Tem certeza que deseja desconectar esta conta? Você terá que reconectar depois.')) return

    try {
      const res = await apiFetch(`/api/ml/accounts/${accountId}`, { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Conta desconectada' })
        fetchAccounts()
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  // Renovar token ML
  async function renewToken(accountId: string) {
    setMessage(null)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/renew-ml-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ account_id: accountId }),
      })
      const d = await res.json()
      if (d.ok) {
        setMessage({ type: 'success', text: '✅ Token renovado! Expira em: ' + new Date(d.expires_at).toLocaleString('pt-BR') })
        fetchAccounts()
      } else {
        setMessage({ type: 'error', text: '❌ ' + (d.error || 'Erro desconhecido') })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: '❌ Erro: ' + err.message })
    }
  }

  // Sincronizar produtos
  async function syncProducts(accountId: string) {
    setSyncing(`${accountId}-products`)
    setMessage(null)
    try {
      const res = await apiFetch('/api/ml/sync/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, limit: 50 }),
      })
      const json: SyncResult = await res.json()
      if (json.success) {
        setMessage({ type: 'success', text: json.message + ' Acompanhe o progresso no card da conta.' })
        // Polling do status
        const pollInterval = setInterval(async () => {
          try {
            const s = await fetch(`/api/ml/sync/products?account_id=${accountId}`).then(r => r.json())
            if (s.data?.status === 'completed' || s.data?.status === 'error') {
              clearInterval(pollInterval)
              setSyncing(null)
              fetchAccounts()
              if (s.data?.resultado) {
                setMessage({
                  type: 'success',
                  text: `Sync concluído! ${s.data.resultado.criados} criados, ${s.data.resultado.atualizados} atualizados, ${s.data.resultado.erros?.length || 0} erros`
                })
              }
            }
          } catch {}
        }, 5000)
      } else {
        setMessage({ type: 'error', text: json.message || 'Erro desconhecido' })
        setSyncing(null)
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
      setSyncing(null)
    }
  }

  // Sincronizar pedidos
  async function syncOrders(accountId: string) {
    setSyncing(`${accountId}-orders`)
    setMessage(null)
    try {
      const res = await apiFetch('/api/ml/sync/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, days: 7 }),
      })
      const json: SyncResult = await res.json()
      if (json.success) {
        setMessage({ type: 'success', text: json.message })
        fetchAccounts()
      } else {
        setMessage({ type: 'error', text: json.message || 'Erro desconhecido' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSyncing(null)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 16, fontSize: '0.85em' }}>
          <a href="/admin" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Voltar ao Dashboard</a>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>
              🏪 Mercado Livre
            </h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>
              Gerencie suas contas conectadas e sincronize produtos/pedidos
            </div>
          </div>
          <button onClick={connectAccount} style={btnPrimary}>
            + Conectar Nova Conta
          </button>
        </div>

        {/* Mensagem de feedback */}
        {message && (
          <div style={{
            background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: message.type === 'success' ? '#22c55e' : '#ef4444',
            padding: 14,
            borderRadius: 8,
            marginBottom: 20,
            fontSize: '0.9em',
          }}>
            {message.type === 'success' ? '✅' : '❌'} {message.text}
          </div>
        )}

        {/* Empty state */}
        {accounts.length === 0 && (
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: '3em', marginBottom: 16 }}>🏪</div>
              <h2 style={{ color: '#d0c0ff', marginBottom: 8 }}>Nenhuma conta conectada</h2>
              <p style={{ color: '#7070a0', marginBottom: 20, fontSize: '0.9em' }}>
                Conecte sua conta do Mercado Livre para começar a sincronizar produtos e pedidos.
              </p>
              <button onClick={connectAccount} style={btnPrimary}>
                Conectar Primeira Conta
              </button>
              <div style={{ marginTop: 20, fontSize: '0.8em', color: '#7070a0' }}>
                <a href="/GUIA_HOMOLOGACAO_ML.html" target="_blank" style={{ color: '#a78bfa', textDecoration: 'none' }}>
                  📖 Como criar um app no Mercado Livre?
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Lista de contas conectadas */}
        {accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {accounts.map((account) => {
              const isSyncingProd = syncing === `${account.id}-products`
              const isSyncingOrders = syncing === `${account.id}-orders`
              const isAnySync = isSyncingProd || isSyncingOrders

              return (
                <div key={account.id} style={cardStyle}>
                  {/* Header da conta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h2 style={{ color: '#d0c0ff', fontSize: '1.2em' }}>
                          {account.nickname || `Conta ${account.account_id}`}
                        </h2>
                        {account.token_expirado ? (
                          <span style={badgeRed}>Token expirado</span>
                        ) : (
                          <span style={badgeGreen}>Online</span>
                        )}
                        {!account.ativa && <span style={badgeYellow}>Pausada</span>}
                      </div>
                      <div style={{ color: '#7070a0', fontSize: '0.85em' }}>
                        ID: {account.account_id} ·{' '}
                        {account.company
                          ? `${account.company.nome_fantasia} (${account.company.cnpj})`
                          : 'Sem CNPJ vinculado'}
                      </div>
                    </div>

                    <button
                      onClick={() => disconnectAccount(account.id)}
                      style={btnDanger}
                      disabled={isAnySync}
                    >
                      Desconectar
                    </button>
                    {account.token_expirado && (
                      <button
                        onClick={() => renewToken(account.id)}
                        style={{
                          padding: '8px 16px',
                          background: '#f97316',
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.85em',
                          fontWeight: 700,
                        }}
                      >
                        🔄 Renovar Token
                      </button>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                    <div style={statBox}>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Produtos Anunciados</div>
                      <div style={{ color: '#a78bfa', fontSize: '1.6em', fontWeight: 'bold' }}>
                        {account.total_listings}
                      </div>
                    </div>
                    <div style={statBox}>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Última Sincronização</div>
                      <div style={{ color: '#d0c0ff', fontSize: '0.9em', fontWeight: 600 }}>
                        {account.ultima_sincronizacao
                          ? new Date(account.ultima_sincronizacao).toLocaleString('pt-BR')
                          : 'Nunca'}
                      </div>
                    </div>
                    <div style={statBox}>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Token Expira</div>
                      <div style={{ color: account.token_expirado ? '#ef4444' : '#22c55e', fontSize: '0.9em', fontWeight: 600 }}>
                        {account.token_expira_em
                          ? new Date(account.token_expira_em).toLocaleString('pt-BR')
                          : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Stats detalhadas (carregadas sob demanda) */}
                  {accountStats[account.id] && (
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(167,139,250,0.1), rgba(34,197,94,0.05))',
                      border: '1px solid rgba(167,139,250,0.2)',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 16,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>💰 Faturamento Total</div>
                          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>
                            R$ {accountStats[account.id].faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>📦 Total de Vendas</div>
                          <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700 }}>
                            {accountStats[account.id].totalVendas.toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>🔵 Catálogos</div>
                          <div style={{ color: '#1e88e5', fontSize: '1.1em', fontWeight: 600 }}>
                            {accountStats[account.id].catalogos}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>🟢 Tradicionais</div>
                          <div style={{ color: '#22c55e', fontSize: '1.1em', fontWeight: 600 }}>
                            {accountStats[account.id].tradicionais}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>📊 Estoque Total</div>
                          <div style={{ color: '#d0c0ff', fontSize: '1.1em', fontWeight: 600 }}>
                            {accountStats[account.id].estoqueTotal.toLocaleString('pt-BR')} un.
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 2 }}>❤️ Saúde Média</div>
                          <div style={{ color: '#d0c0ff', fontSize: '1.1em', fontWeight: 600 }}>
                            {accountStats[account.id].saudeMedia}/100
                          </div>
                        </div>
                      </div>

                      {/* Top 10 mais vendidos */}
                      {accountStats[account.id].top10?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ color: '#a78bfa', fontSize: '0.85em', fontWeight: 600, marginBottom: 8 }}>
                            🏆 Top 10 Mais Vendidos
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {accountStats[account.id].top10.map((item: any, idx: number) => (
                              <a
                                key={item.listing_id}
                                href={item.permalink || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 10px',
                                  background: '#0d0d25',
                                  borderRadius: 6,
                                  textDecoration: 'none',
                                  color: '#d0c0ff',
                                  fontSize: '0.8em',
                                }}
                              >
                                <span style={{ color: '#7070a0', minWidth: 20 }}>#{idx + 1}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.nome}
                                </span>
                                <span style={{
                                  color: item.listing_type === 'gold_special' ? '#1e88e5' : '#22c55e',
                                  fontWeight: 700,
                                  minWidth: 18,
                                  textAlign: 'center',
                                }}>
                                  {item.listing_type === 'gold_special' ? 'C' : 'T'}
                                </span>
                                <span style={{ color: '#22c55e', fontWeight: 600 }}>
                                  🔥 {item.vendas.toLocaleString('pt-BR')}
                                </span>
                                <span style={{ color: '#a78bfa' }}>
                                  R$ {item.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #2a2a4a', paddingTop: 16 }}>
                    <button
                      onClick={() => syncProducts(account.id)}
                      disabled={isAnySync}
                      style={{
                        ...btnSecondary,
                        opacity: isAnySync ? 0.5 : 1,
                        cursor: isAnySync ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSyncingProd ? '⏳ Sincronizando...' : '🔄 Sincronizar Produtos'}
                    </button>
                    <button
                      onClick={() => syncOrders(account.id)}
                      disabled={isAnySync}
                      style={{
                        ...btnSecondary,
                        opacity: isAnySync ? 0.5 : 1,
                        cursor: isAnySync ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSyncingOrders ? '⏳ Sincronizando...' : '📦 Sincronizar Pedidos (7 dias)'}
                    </button>
                    <a
                      href={`https://www.mercadolivre.com.br/perfil/${account.nickname}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...btnSecondary, textDecoration: 'none' }}
                    >
                      👤 Ver Perfil no ML
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Info Box */}
        {accounts.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 20, background: 'rgba(96,165,250,0.05)' }}>
            <h3 style={{ color: '#60a5fa', marginBottom: 8 }}>💡 Dicas</h3>
            <ul style={{ color: '#b0b0cc', fontSize: '0.9em', paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Sincronize produtos após criar/atualizar no ML — puxa tudo pro sistema</li>
              <li>Sincronize pedidos semanalmente — mantém histórico de vendas atualizado</li>
              <li>O sistema renova tokens automaticamente, mas se der erro, reconecte a conta</li>
              <li>Configure o webhook pra receber vendas em tempo real (veja guia de homologação)</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// =================== ESTILOS ===================
const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const statBox = { background: '#0d0d25', padding: 14, borderRadius: 8, textAlign: 'center' as const }
const btnPrimary = { background: 'linear-gradient(90deg, #ffe600, #ee4d2d)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.9em' } as const
const btnSecondary = { background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const
const btnDanger = { background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const
const badgeRed = { background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgeGreen = { background: 'rgba(34,197,94,0.2)', color: '#22c55e', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgeYellow = { background: 'rgba(234,179,8,0.2)', color: '#eab308', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const

// Suspense wrapper (Next.js 14 requirement pra useSearchParams)
export default function MercadoLivrePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#b0b0cc' }}>Carregando...</div>}>
      <MercadoLivreContent />
    </Suspense>
  )
}
