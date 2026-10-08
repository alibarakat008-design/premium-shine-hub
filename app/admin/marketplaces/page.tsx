'use client'

/**
 * MARKETPLACES - Hub central com 3 abas
 * - Mercado Livre (multi-conta)
 * - Shopee (multi-conta, quando ativar)
 * - Site Próprio (publicação manual)
 *
 * Cada aba mostra:
 * - Contas conectadas
 * - Botão de conectar nova
 * - Listagem de listings da conta
 * - Botão "Sincronizar"
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

type Tab = 'ml' | 'shopee' | 'site'

interface Account {
  id: string
  nickname: string
  account_id: string
  ativa: boolean
  total_listings: number
  total_vendas: number
  receita_total: number
  token_expira_em: string | null
  ultima_sincronizacao: string | null
  plataforma: string
}

interface Listing {
  id: string
  listing_id: string
  product_id: string | null
  permalink: string | null
  status: string | null
  preco_atual: number | null
  preco_promocional: number | null
  stock_disponivel_ml: number | null
  vendas_total: number | null
  health: number | null
  condition: string | null
  listing_type: string | null
  products: { sku: string; nome: string; foto_principal_url: string | null } | null
}

interface Product {
  id: string
  sku: string
  nome: string
  foto_principal_url: string | null
  publicado_site: boolean
  url_site: string | null
  preco_venda: number | null
  estoque: number | null
}

const TAB_INFO: Record<Tab, { label: string; emoji: string; cor: string; oauthUrl: string | null; desc: string }> = {
  ml: { label: 'Mercado Livre', emoji: '🏪', cor: '#f59e0b', oauthUrl: '/api/ml/auth', desc: 'OAuth oficial Mercado Livre. Cada conta tem suas credenciais próprias.' },
  shopee: { label: 'Shopee', emoji: '🛒', cor: '#ee4d2d', oauthUrl: '/api/shopee/auth', desc: 'Open Platform Shopee. Cada loja tem suas credenciais próprias.' },
  site: { label: 'Site Próprio', emoji: '🌐', cor: '#ec4899', oauthUrl: null, desc: 'Publicação manual no seu site (WordPress, Shopify, Nuvemshop, etc).' },
}

export default function MarketplacesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ml')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string>('all')
  const [listings, setListings] = useState<Listing[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ etapa: '', pct: 0, total: 0, criados: 0, atualizados: 0, erros: 0 })

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Carregar contas da aba atual
  useEffect(() => {
    loadAccounts()
    if (tab === 'site') loadSiteProducts()
  }, [tab])

  useEffect(() => {
    if (tab === 'site') return
    if (activeAccountId === 'all') loadListings()
    else loadListings(activeAccountId)
  }, [activeAccountId, tab])

  function loadAccounts() {
    const plataforma = tab === 'ml' ? 'mercado_livre' : tab === 'shopee' ? 'shopee' : null
    if (!plataforma) return
    fetch(`/api/ml/accounts-hub?plataforma=${plataforma}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setAccounts(j.data)
          // Reset to all if active account isn't of this plataforma
          if (j.data.length === 0) setActiveAccountId('all')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function loadListings(accountId?: string) {
    const plataforma = tab === 'ml' ? 'mercado_livre' : 'shopee'
    const url = `/api/ml/account-listings?plataforma=${plataforma}${accountId ? `&account_id=${accountId}` : ''}`
    fetch(url).then(r => r.json()).then(j => { if (j.success) setListings(j.data) })
  }

  function loadSiteProducts() {
    fetch('/api/site/products')
      .then(r => r.json())
      .then(j => { if (j.success) setProducts(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function sincronizar() {
    if (tab === 'site') return
    setSyncing(true)
    setSyncProgress({ etapa: 'Iniciando...', pct: 0, total: 0, criados: 0, atualizados: 0, erros: 0 })
    try {
      const res = await apiFetch('/api/ml/sync-products-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plataforma: tab,
          account_id: activeAccountId === 'all' ? undefined : activeAccountId,
        }),
      })
      const j = await res.json()
      if (j.success) {
        setSyncProgress({ etapa: 'Concluído!', pct: 100, ...j.data })
        if (activeAccountId === 'all') loadListings()
        else loadListings(activeAccountId)
        loadAccounts()
      } else {
        alert('❌ ' + j.error)
      }
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function toggleSiteProduct(productId: string, currentStatus: boolean) {
    await apiFetch('/api/site/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, publicado: !currentStatus }),
    })
    loadSiteProducts()
  }

  if (status === 'loading' || loading) {
    return <div style={{ padding: 40, color: 'var(--psh-text-secondary, #6b7280)' }}>Carregando marketplaces...</div>
  }

  const totalReceita = accounts.reduce((acc, a) => acc + a.receita_total, 0)
  const totalListings = accounts.reduce((acc, a) => acc + a.total_listings, 0)
  const totalVendas = accounts.reduce((acc, a) => acc + a.total_vendas, 0)
  const tabInfo = TAB_INFO[tab]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>🏪 Marketplaces</h1>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em', marginTop: 2 }}>Conecte, sincronize e gerencie todas as contas</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab !== 'site' && (
            <button
              onClick={sincronizar}
              disabled={syncing}
              style={{ padding: '10px 20px', background: tabInfo.cor, color: 'var(--psh-bg-primary, #fff)', border: 'none', borderRadius: 8, cursor: syncing ? 'wait' : 'pointer', fontSize: '0.9em', fontWeight: 600, opacity: syncing ? 0.7 : 1 }}
            >
              {syncing ? '⏳ Sincronizando...' : `🔄 Sincronizar ${tabInfo.label}`}
            </button>
          )}
          {tabInfo.oauthUrl ? (
            <a href={tabInfo.oauthUrl} style={{ padding: '10px 20px', background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', color: 'var(--psh-text-primary, #374151)', borderRadius: 8, textDecoration: 'none', fontSize: '0.9em', fontWeight: 500 }}>
              + Conectar Conta
            </a>
          ) : (
            <a href="/admin/site/config" style={{ padding: '10px 20px', background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', color: 'var(--psh-text-primary, #374151)', borderRadius: 8, textDecoration: 'none', fontSize: '0.9em', fontWeight: 500 }}>
              ⚙️ Configurar Site
            </a>
          )}
        </div>
      </div>

      {/* Tabs de Marketplace */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {(['ml', 'shopee', 'site'] as Tab[]).map(t => {
          const info = TAB_INFO[t]
          const active = t === tab
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setActiveAccountId('all') }}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                color: active ? info.cor : 'var(--psh-text-secondary, #6b7280)',
                border: 'none',
                borderBottom: active ? `2px solid ${info.cor}` : '2px solid transparent',
                fontSize: '0.9em', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: '1.2em' }}>{info.emoji}</span>
              {info.label}
            </button>
          )
        })}
      </div>

      <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid #a78bfa30', borderRadius: 8, padding: 10, marginBottom: 12, color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.8em' }}>
        💡 {tabInfo.desc}
      </div>

      {/* Progresso de Sync */}
      {syncing && (
        <div style={{ background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#1e40af', fontSize: '0.9em', fontWeight: 600 }}>🔄 {syncProgress.etapa}</span>
            <span style={{ color: '#1e40af', fontSize: '0.8em' }}>{syncProgress.pct}%</span>
          </div>
          <div style={{ height: 6, background: '#bfdbfe', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${syncProgress.pct}%`, height: '100%', background: '#3b82f6' }} />
          </div>
          {syncProgress.total > 0 && (
            <div style={{ color: '#1e40af', fontSize: '0.75em', marginTop: 6 }}>
              Total: {syncProgress.total} | Criados: {syncProgress.criados} | Atualizados: {syncProgress.atualizados} | Erros: {syncProgress.erros}
            </div>
          )}
        </div>
      )}

      {/* Resumo Top */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>{tabInfo.emoji} Contas</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1.4em', fontWeight: 700 }}>{accounts.length}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>📦 Listings/Produtos</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1.4em', fontWeight: 700 }}>{tab === 'site' ? products.length : totalListings}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>🛒 Vendas</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1.4em', fontWeight: 700 }}>{totalVendas}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>💵 Receita</div>
          <div style={{ color: '#10b981', fontSize: '1.4em', fontWeight: 700 }}>R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Conteúdo por aba */}
      {tab === 'site' ? (
        <SiteTab products={products} onToggle={toggleSiteProduct} />
      ) : (
        <MLShopeeTab
          accounts={accounts}
          activeAccountId={activeAccountId}
          setActiveAccountId={setActiveAccountId}
          listings={listings}
        />
      )}
    </div>
  )
}

function MLShopeeTab({ accounts, activeAccountId, setActiveAccountId, listings }: { accounts: Account[]; activeAccountId: string; setActiveAccountId: (id: string) => void; listings: Listing[] }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', overflow: 'auto' }}>
        <button
          onClick={() => setActiveAccountId('all')}
          style={{
            padding: '12px 18px',
            background: activeAccountId === 'all' ? 'var(--psh-bg-secondary, #f9fafb)' : 'transparent',
            borderBottom: activeAccountId === 'all' ? '2px solid #7c3aed' : '2px solid transparent',
            color: activeAccountId === 'all' ? '#7c3aed' : 'var(--psh-text-secondary, #6b7280)',
            fontSize: '0.85em', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Todas ({listings.length})
        </button>
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveAccountId(a.id)}
            style={{
              padding: '12px 18px',
              background: activeAccountId === a.id ? 'var(--psh-bg-secondary, #f9fafb)' : 'transparent',
              borderBottom: activeAccountId === a.id ? '2px solid #7c3aed' : '2px solid transparent',
              color: activeAccountId === a.id ? '#7c3aed' : 'var(--psh-text-secondary, #6b7280)',
              fontSize: '0.85em', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            🏪 {a.nickname} ({a.total_listings})
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {accounts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
            <div style={{ fontSize: '2em', marginBottom: 8 }}>🔌</div>
            <div style={{ fontSize: '0.9em', marginBottom: 12 }}>Nenhuma conta conectada</div>
            <a href="/api/ml/auth" style={{ display: 'inline-block', padding: '10px 20px', background: '#7c3aed', color: 'var(--psh-bg-primary, #fff)', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
              + Conectar primeira conta
            </a>
          </div>
        ) : listings.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
            <div style={{ fontSize: '2em', marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: '0.9em', marginBottom: 12 }}>Nenhum listing sincronizado</div>
            <div style={{ fontSize: '0.8em' }}>Clique em "🔄 Sincronizar" acima pra puxar os produtos</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {listings.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function ListingCard({ listing: l }: { listing: Listing }) {
  const health = Number(l.health || 0)
  const healthCor = health >= 80 ? '#10b981' : health >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, cursor: 'pointer' }} onClick={() => l.permalink && window.open(l.permalink, '_blank')}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {l.products?.foto_principal_url ? (
          <img src={l.products.foto_principal_url} style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--psh-bg-secondary, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📦</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.8em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {l.products?.nome || l.listing_id}
          </div>
          <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.7em' }}>{l.products?.sku || l.listing_id}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <div>
          {l.preco_promocional ? (
            <div>
              <span style={{ color: 'var(--psh-text-secondary, #9ca3af)', textDecoration: 'line-through', fontSize: '0.7em' }}>R$ {l.preco_atual?.toFixed(0)}</span>{' '}
              <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9em' }}>R$ {l.preco_promocional.toFixed(0)}</span>
            </div>
          ) : (
            <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontWeight: 700 }}>R$ {l.preco_atual?.toFixed(0) || '-'}</div>
          )}
        </div>
        <span style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.7em' }}>Stock: {l.stock_disponivel_ml || 0}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ padding: '2px 6px', background: l.status === 'active' ? '#dcfce7' : '#fee2e2', color: l.status === 'active' ? '#166534' : '#991b1b', borderRadius: 3, fontSize: '0.65em', fontWeight: 600 }}>
          {l.status}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 30, height: 4, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${health}%`, height: '100%', background: healthCor }} />
          </div>
          <span style={{ color: healthCor, fontSize: '0.7em', fontWeight: 600 }}>{health.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

function SiteTab({ products, onToggle }: { products: Product[]; onToggle: (id: string, current: boolean) => void }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'publicados' | 'nao'>('todos')

  const filtrados = products.filter(p => {
    if (filtro === 'publicados' && !p.publicado_site) return false
    if (filtro === 'nao' && p.publicado_site) return false
    if (busca && !p.sku.toLowerCase().includes(busca.toLowerCase()) && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar produto..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85em' }}
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85em', background: 'var(--psh-bg-primary, #fff)' }}>
          <option value="todos">Todos</option>
          <option value="publicados">✅ Publicados</option>
          <option value="nao">❌ Não publicados</option>
        </select>
      </div>

      {products.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
          <div style={{ fontSize: '2em', marginBottom: 8 }}>🌐</div>
          <div style={{ fontSize: '0.9em' }}>Nenhum produto cadastrado ainda. Sincronize do Mercado Livre primeiro.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtrados.map(p => (
            <div key={p.id} style={{ background: p.publicado_site ? '#f0fdf4' : 'var(--psh-bg-primary, #fff)', border: `1px solid ${p.publicado_site ? '#10b981' : 'var(--psh-border, #e5e7eb)'}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                {p.foto_principal_url ? (
                  <img src={p.foto_principal_url} style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--psh-bg-secondary, #f3f4f6)' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.8em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.nome}</div>
                  <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.7em' }}>{p.sku}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75em', color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 6 }}>
                <span>R$ {Number(p.preco_venda || 0).toFixed(2)}</span>
                <span>📦 {p.estoque || 0}</span>
              </div>
              <button
                onClick={() => onToggle(p.id, p.publicado_site)}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: p.publicado_site ? '#fee2e2' : '#10b981',
                  color: p.publicado_site ? '#991b1b' : 'var(--psh-bg-primary, #fff)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.75em',
                  fontWeight: 600,
                }}
              >
                {p.publicado_site ? '❌ Despublicar' : '✅ Publicar no Site'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
