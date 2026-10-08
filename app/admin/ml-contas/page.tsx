'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Account {
  id: string
  nome: string
  nickname: string | null
  email: string | null
  ativo: boolean
  conectado: boolean
  token_expira_em: string
  token_expirado: boolean
  expira_hoje: boolean
  total_listings: number
  total_vendas: number
  receita_total: number
  ultima_venda: string | null
  last_sync: string | null
}

export default function MLContasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState<string>('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    // Cache-busting: timestamp na URL impede Next.js fetch cache + browser HTTP cache
    const ts = Date.now()
    fetch(`/api/ml/accounts-hub?_=${ts}`)
      .then(r => {
        if (!r.ok) {
          console.error('[ml-contas] fetch error:', r.status, r.statusText)
          setLoading(false)
          return null
        }
        return r.json()
      })
      .then(j => {
        if (!j) return
        const liura = j.data?.find((a: any) => a.id === 'a1b80278-bc5c-4d3c-a2bc-e3c03f136228')
        setDebugInfo(`DEBUG: ${j.data?.length} contas, LIURA conectado=${liura?.conectado}, expira=${liura?.token_expira_em}`)
        console.log('[ml-contas] load result:', j.data?.length, 'accounts, first:', j.data?.[0]?.nickname, 'conectado:', j.data?.[0]?.conectado)
        if (j.success) setAccounts(j.data)
        setLoading(false)
      })
      .catch(e => { console.error('[ml-contas] fetch exception:', e); setLoading(false) })
  }

  // Atualiza uma conta específica no estado local sem refazer fetch completo
  // (evita stale read do Prisma pool em serverless)
  function atualizarContaLocal(accountId: string, novaExpira?: Date) {
    setAccounts(prev => prev.map(a => {
      if (a.id !== accountId) return a
      const novoExpiraEm = novaExpira
        ? Math.floor((novaExpira.getTime() - Date.now()) / (1000 * 60 * 60))
        : a.token_expirado ? 0 : (a.expira_hoje ? 5 : 0)
      const tokenExpirado = novoExpiraEm !== null && novoExpiraEm <= 0
      const expiraHoje = novoExpiraEm !== null && !tokenExpirado && novoExpiraEm < 6
      return {
        ...a,
        conectado: true,
        token_expirado: tokenExpirado,
        expira_hoje: expiraHoje,
        token_expira_em: novaExpira
          ? (novoExpiraEm < 24 ? `expira em ${novoExpiraEm}h` : `expira em ${Math.floor(novoExpiraEm / 24)}d`)
          : a.token_expira_em,
      }
    }))
  }

  useEffect(load, [])

  if (status === 'loading' || loading) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando contas ML...</div>
  }

  {debugInfo && (
    <div style={{ background: '#1a1a3a', border: '1px solid #4a4a8a', borderRadius: 8, padding: '8px 16px', marginBottom: 16, fontFamily: 'monospace', fontSize: '0.8em', color: '#a0a0ff' }}>
      {debugInfo}
    </div>
  )}

  const totalListings = accounts.reduce((acc, a) => acc + a.total_listings, 0)
  const totalVendas = accounts.reduce((acc, a) => acc + a.total_vendas, 0)
  const totalReceita = accounts.reduce((acc, a) => acc + a.receita_total, 0)
  const contasExpirando = accounts.filter(a => a.conectado && a.expira_hoje).length
  const contasExpiradas = accounts.filter(a => a.conectado && a.token_expirado).length

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📡 MRKTPLC — Contas Mercado Livre</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Gerencie todas as contas ML conectadas, tokens, listings e vendas</div>
          </div>
          <a href="/admin/mercado-livre" style={{ padding: '12px 24px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
            + Conectar Nova Conta
          </a>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="🏪 Contas Conectadas" value={accounts.filter(a => a.conectado).length} color="#a78bfa" />
          <Card label="📦 Listings Totais" value={totalListings} color="#60a5fa" />
          <Card label="💰 Vendas" value={totalVendas.toLocaleString('pt-BR')} color="#22c55e" />
          <Card label="💵 Receita Total" value={`R$ ${totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="#eab308" />
        </div>

        {/* Alerta de tokens expirados (vermelho, mais urgente) */}
        {contasExpiradas > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 12, padding: 16, marginBottom: 16, color: '#ef4444' }}>
            🔴 <strong>{contasExpiradas}</strong> conta(s) com token JÁ EXPIRADO! A sincronização dessas contas está parada — clique em "Renovar Token" ou reconecte.
          </div>
        )}

        {/* Alerta de tokens prestes a expirar (laranja) */}
        {contasExpirando > 0 && (
          <div style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid #f97316', borderRadius: 12, padding: 16, marginBottom: 16, color: '#f97316' }}>
            ⚠️ <strong>{contasExpirando}</strong> conta(s) com token expirando em menos de 6 horas! Renove para evitar interrupção.
          </div>
        )}

        {/* Cards de Contas */}
        {accounts.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 60, textAlign: 'center', color: '#7070a0' }}>
            Nenhuma conta ML conectada.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
            {accounts.map(a => {
              const accountStatus = !a.conectado ? 'desconectada' : a.token_expirado ? 'expirada' : 'conectada'
              // Se conectado mas expirando em breve, usa cor laranja
              const cor = accountStatus === 'conectada'
                ? (a.expira_hoje ? '#f97316' : '#22c55e')
                : '#ef4444'
              return (
                <div key={a.id} style={{ background: '#12122a', border: `1px solid ${cor}30`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1.05em' }}>🏪 {a.nome}</div>
                      {a.nickname && <div style={{ color: '#a78bfa', fontSize: '0.85em' }}>@{a.nickname}</div>}
                      {a.email && <div style={{ color: '#7070a0', fontSize: '0.75em' }}>{a.email}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ padding: '3px 10px', background: `${cor}20`, color: cor, borderRadius: 4, fontSize: '0.7em', fontWeight: 700, textTransform: 'uppercase' }}>
                        {accountStatus}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.85em', marginBottom: 10 }}>
                    <div><span style={{ color: '#7070a0' }}>Listings:</span> <span style={{ color: '#60a5fa', fontWeight: 600 }}>{a.total_listings}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Vendas:</span> <span style={{ color: '#a78bfa', fontWeight: 600 }}>{a.total_vendas.toLocaleString('pt-BR')}</span></div>
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#7070a0' }}>Receita:</span> <span style={{ color: '#22c55e', fontWeight: 700 }}>R$ {a.receita_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  </div>

                  <div style={{ background: '#0a0a1a', padding: 8, borderRadius: 6, fontSize: '0.75em' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7070a0' }}>
                      <span>🔑 Token:</span>
                      <span style={{ color: cor, fontWeight: 600 }}>{a.token_expira_em}</span>
                    </div>
                    {a.ultima_venda && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7070a0', marginTop: 4 }}>
                        <span>🛒 Última venda:</span>
                        <span style={{ color: '#b0b0cc' }}>{new Date(a.ultima_venda).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {a.last_sync && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7070a0', marginTop: 4 }}>
                        <span>🔄 Último sync:</span>
                        <span style={{ color: '#b0b0cc' }}>{new Date(a.last_sync).toLocaleString('pt-BR').slice(0, 16)}</span>
                      </div>
                    )}
                  </div>

                  {/* Botão Renovar Token — mostra só se desconectada ou token expirado */}
                  {(!a.conectado || a.token_expirado) && (
                    <RenewButton accountId={a.id} onRenewed={atualizarContaLocal} />
                  )}
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

function RenewButton({ accountId, onRenewed }: { accountId: string; onRenewed: (accountId: string, novaExpira?: Date) => void }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function renew() {
    setLoading(true)
    setMsg(null)
    setSuccess(false)
    try {
      const r = await fetch('/api/admin/renew-ml-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg('✅ Token renovado com sucesso!')
        setSuccess(true)
        // Atualiza estado local diretamente com os dados do renew — sem refazer fetch
        // (evita stale read do Prisma pool)
        if (d.expires_at) {
          const novaData = new Date(d.expires_at)
          onRenewed(accountId, novaData)
        } else {
          setTimeout(() => onRenewed(accountId), 1200)
        }
      } else {
        setMsg('❌ ' + d.error)
      }
    } catch {
      setMsg('❌ Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={renew}
        disabled={loading}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '8px 12px',
          background: success ? '#22c55e' : loading ? '#374151' : '#f97316',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.8em',
          fontWeight: 700,
          transition: 'background 0.3s',
        }}
      >
        {loading ? '⏳ Renovando...' : success ? '✅ Sucesso!' : '🔄 Renovar Token'}
      </button>
      {msg && (
        <div style={{
          marginTop: 6,
          fontSize: '0.8em',
          fontWeight: 600,
          color: msg.startsWith('✅') ? '#22c55e' : '#ef4444',
          background: msg.startsWith('✅') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          padding: '6px 10px',
          borderRadius: 6,
          textAlign: 'center',
        }}>
          {msg}
        </div>
      )}
    </>
  )
}
