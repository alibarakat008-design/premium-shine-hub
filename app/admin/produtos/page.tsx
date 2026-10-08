'use client'

/**
 * =====================================================
 * PÃGINA DE PRODUTOS â€” Lista com Filtros
 * Premium Shine Hub
 * =====================================================
 * Lista todos os 528 SKUs com busca, filtros e aÃ§Ãµes
 * Consome a API /api/products
 *
 * Caminho: app/admin/produtos/page.tsx
 * =====================================================
 */

import { useState, useEffect, Component, ReactNode, useRef } from 'react'
import { useRouter } from 'next/navigation'
import ProductDetailPanel from './ProductDetailPanel'
import { apiFetch } from '@/lib/api-fetch'

// Helper seguro: Decimal do Prisma → number (escopo global)
const toNum = (v: any): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n }
  if (typeof v === 'object') {
    if (typeof v.toNumber === 'function') return v.toNumber()
    if (typeof v.toString === 'function') { const n = parseFloat(v.toString()); return isNaN(n) ? null : n }
  }
  return null
}

// Limpa [DUPLICADO-depreciado] e tags similares do nome do produto
const cleanName = (name: string): string => {
  return name
    .replace(/\[DUPLICADO-depreciado\]\s*/gi, '')
    .replace(/\[DUPLICADO\]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Error Boundary pra capturar erro de render e mostrar mensagem Ãºtil
class ProdutosErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[Produtos] Erro de render:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#e8e8f0', background: '#0a0a1a', minHeight: '100vh' }}>
          <h2 style={{ color: '#ef4444' }}>Erro ao carregar produtos</h2>
          <pre style={{ background: '#1a1a2e', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#a78bfa', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Tentar de novo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface Product {
  id: string
  sku: string
  ean: string | null
  nome: string
  genero: string | null
  volume: string | null
  foto_principal_url: string | null
  ativo: boolean
  destaque: boolean
  marca: { id: string; nome: string; is_marca_propria: boolean }
  categoria: { id: string; nome: string; slug: string } | null
  inventory: {
    quantidade_atual: number
    quantidade_minima: number
  } | null
  prices: { canal: string; preco_venda: number; preco_promocional: number | null; custo: number | null }[]
  marketplace_listings?: Array<{
    id: string
    listing_id: string
    permalink: string | null
    status: string | null
    preco_atual: number | null
    vendas_total: number | null
    listing_type: string | null
    health: number | null
    condition: string | null
    modo_compra: string | null
  }>
  _count?: { marketplace_listings: number; order_items: number }
  // Campos crus do banco (com nomes em plural)
  brands?: { id: string; nome: string; is_marca_propria: boolean }
  categories?: { id: string; nome: string; slug: string } | null
  product_prices?: { canal: string; preco_venda: number; preco_promocional: number | null; custo: number | null }[]
  notas_olfativas: any
}

interface Brand {
  id: string
  nome: string
}

export default function ProdutosPageWrapper() {
  return (
    <ProdutosErrorBoundary>
      <ProdutosPage />
    </ProdutosErrorBoundary>
  )
}

function ProdutosPage() {
  const router = useRouter()

  // Estados
  const [products, setProducts] = useState<Product[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [authChecked, setAuthChecked] = useState(false)

  // Filtros
  const [search, setSearch] = useState('')

  const [filterMarca, setFilterMarca] = useState('')

  const [filterGenero, setFilterGenero] = useState('')

  const [filterStatus, setFilterStatus] = useState('ativos')

  const [settings, setSettings] = useState({ aliquota: 4 })
  const [filterEstoque, setFilterEstoque] = useState('')

  // Verificar auth (substituiu useSession do next-auth)
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok || !j.user) {
          router.push('/login-parceiro')
          return
        }
        setAuthChecked(true)
      })
      .catch(() => router.push('/login-parceiro'))
  }, [router])

  // Estado do painel de detalhes
  const [detalheOpen, setDetalheOpen] = useState<Product | null>(null)

  // Buscar marcas (pra filtro)
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((d) => setBrands(d.data || []))
      .catch(() => {})
  }, [])

  // Buscar produtos
  async function fetchProducts() {
    setLoading(true)
    // Cancelar request anterior se existir
    if (typeof window !== 'undefined' && (window as any).__abortController) {
      (window as any).__abortController.abort()
    }
    const ac = new AbortController()
    ;(window as any).__abortController = ac

    const params = new URLSearchParams()
    if (search) params.append('q', search)
    if (filterMarca) params.append('marca_id', filterMarca)
    if (filterGenero) params.append('genero', filterGenero)
    if (filterEstoque === 'baixo') params.append('estoque_baixo', 'true')
    if (filterEstoque === 'sem') params.append('em_estoque', 'false')
    params.append('order_by', 'vendas')  // PadrÃ£o: mais vendidos primeiro
    params.append('order_dir', 'desc')
    params.append('page', String(page))
    params.append('limit', '24')

    try {
      const res = await apiFetch(`/api/products?${params}`, { signal: ac.signal })
      const json = await res.json()
      // Mapear nomes do banco (plurais) pra camelCase (singulares) que a UI espera
      // Helper seguro: Decimal do Prisma → number
      const mapped = (json.data || []).map((p: any) => ({
        ...p,
        marca: p.brands,
        categoria: p.categories,
        // Estoque com number seguro
        inventory: p.inventory ? {
          ...p.inventory,
          quantidade_atual: toNum(p.inventory.quantidade_atual),
          quantidade_minima: toNum(p.inventory.quantidade_minima),
        } : null,
        // Converter prices (Prisma Decimal) pra number
        prices: (p.product_prices || []).map((pr: any) => ({
          ...pr,
          preco_venda: toNum(pr.preco_venda),
          preco_promocional: toNum(pr.preco_promocional),
          custo: toNum(pr.custo),
        })),
        // Converter Decimals de marketplace_listings
        marketplace_listings: (p.marketplace_listings || []).map((ml: any) => ({
          ...ml,
          preco_atual: toNum(ml.preco_atual),
          vendas_total: toNum(ml.vendas_total),
        })),
      }))
      setProducts(mapped)
      setTotal(json.pagination?.total || 0)
      setTotalPages(json.pagination?.total_pages || 1)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Erro ao buscar produtos:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  // Recarregar quando filtros mudam
  useEffect(() => {
    if (authChecked) {
      fetchProducts()
    }
  }, [authChecked, page, filterMarca, filterGenero, filterEstoque])

  // Busca com debounce
  useEffect(() => {
    if (!authChecked) return
    const timer = setTimeout(() => {
      setPage(1)
      fetchProducts()
    }, 400)
    return () => clearTimeout(timer)
  }, [search, authChecked])

  // Listener de atualização quando voltar pra tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && authChecked) fetchProducts()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authChecked])

  if (!authChecked || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#7070a0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando produtos...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>

        {/* Header estilo Marcas (dark) */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ color: '#d0c0ff', fontSize: '1.2em', fontWeight: 700, margin: 0 }}>🛍️ Produtos</h1>
              <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
                Margem prospectiva por SKU
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => fetchProducts()}
                style={{ padding: '8px 14px', background: '#1e1e3a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
                title="Recarregar lista"
              >
                <span>🔄</span> Atualizar
              </button>
              <button
                onClick={() => alert('Modal: Importar produtos em massa (CSV ou do ML)')}
                style={{ padding: '8px 14px', background: '#1e1e3a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>📥</span> Importar produto
              </button>
              <button
                onClick={() => alert('Modal: Editar produtos em massa (preço, estoque, custo)')}
                style={{ padding: '8px 14px', background: '#1e1e3a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>✏️</span> Editar em massa
              </button>
              <ImportarProdutosButton onImported={() => fetchProducts()} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#1e1e3a', border: '1px solid #2a2a4a', borderRadius: 6, fontSize: '0.8em' }}>
                <span style={{ color: '#7070a0' }}>Alíquota da Conta:</span>
                <strong style={{ color: '#d0c0ff' }}>{settings.aliquota}%</strong>
                <button style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer' }}>✏️</button>
              </div>
              <button
                onClick={() => router.push('/admin/produtos/novo')}
                style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85em' }}
              >
                + Novo Produto
              </button>
            </div>
          </div>
        </div>

        {/* Filtros (dark) */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por título ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '10px 12px', background: '#0d0d22', border: '1px solid #2a2a4a', borderRadius: 8, color: '#d0c0ff', fontSize: '0.9em' }}
          />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '10px 12px', background: '#0d0d22', border: '1px solid #2a2a4a', borderRadius: 8, color: '#d0c0ff', fontSize: '0.9em' }}
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>

          <button style={{ padding: '10px 14px', background: '#0d0d22', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>⚙</span> Filtros
          </button>

          <select
            value={filterGenero}
            onChange={(e) => setFilterGenero(e.target.value)}
            style={{ padding: '10px 12px', background: '#0d0d22', border: '1px solid #2a2a4a', borderRadius: 8, color: '#d0c0ff', fontSize: '0.9em' }}
          >
            <option value="">Todos os gêneros</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="unissex">Unissex</option>
          </select>

          <select
            value={filterEstoque}
            onChange={(e) => setFilterEstoque(e.target.value)}
            style={{
              padding: 10,
              background: '#0d0d25',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              color: '#e8e8f0',
              fontSize: '0.9em',
            }}
          >
            <option value="">Todos os estoques</option>
            <option value="baixo">⚠️ Estoque baixo</option>
            <option value="sem">✖ Sem estoque</option>
          </select>
        </div>

        {/* Grid de produtos */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 20,
          }}
        >
          {products.length === 0 && !loading && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: 60,
                color: '#7070a0',
              }}
            >
              Nenhum produto encontrado com esses filtros
            </div>
          )}

          {products.map((product) => {
            const mlPrice = product.prices?.find((p) => p.canal === 'mercado_livre')
            const mlListing = product.marketplace_listings?.[0]
            const listingType = mlListing?.listing_type
            const isCatalog = listingType === 'gold_special' || listingType === 'catalog'
            const vendasTotal = Number(mlListing?.vendas_total ?? 0)
            const estoqueBaixo =
              product.inventory &&
              product.inventory.quantidade_atual <= product.inventory.quantidade_minima

            // Determinar quais marketplaces o produto estÃ¡
            const hasML = !!mlListing
            const hasShopee = false // TODO: integrar quando tiver shopee_listings
            const hasSite = false // TODO: integrar quando tiver site_listings

            return (
              <ProdutoCardMetrify
                key={product.id}
                product={product}
                mlPrice={mlPrice}
                mlListing={mlListing}
                isCatalog={isCatalog}
                vendasTotal={vendasTotal}
                estoqueBaixo={!!estoqueBaixo}
                hasML={hasML}
                hasShopee={hasShopee}
                hasSite={hasSite}
                onClick={() => setDetalheOpen(product)}
              />
            )
          })}
        </div>

        {/* PaginaÃ§Ã£o */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              marginTop: 30,
            }}
          >
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                padding: '8px 16px',
                background: '#12122a',
                border: '1px solid #2a2a4a',
                color: page === 1 ? '#666' : '#d0c0ff',
                borderRadius: 8,
                cursor: page === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Anterior
            </button>
            <span style={{ color: '#b0b0cc', padding: '0 16px' }}>
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={{
                padding: '8px 16px',
                background: '#12122a',
                border: '1px solid #2a2a4a',
                color: page === totalPages ? '#666' : '#d0c0ff',
                borderRadius: 8,
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Próxima »
            </button>
          </div>
        )}
      </div>

      {/* Painel de detalhes (abre ao clicar no card) */}
      {detalheOpen && (
        <ProductDetailPanel
          product={detalheOpen}
          onClose={() => setDetalheOpen(null)}
        />
      )}
    </div>
  )
}

// =================== BOTÃƒO: IMPORTAR PRODUTOS DO ML ===================
function ImportarProdutosButton({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [progress, setProgress] = useState<{ status: string; pct: number; msg: string }>({ status: '', pct: 0, msg: '' })

  useEffect(() => {
    if (showModal) {
      fetch('/api/ml/accounts')
        .then(r => r.json())
        .then(j => { if (j.success) setAccounts(j.data || []) })
    }
  }, [showModal])

  async function importar() {
    if (accounts.length === 0) {
      setProgress({ status: 'error', pct: 0, msg: 'Nenhuma conta ML conectada. VÃ¡ em Admin â†’ Mercado Livre.' })
      return
    }

    setImporting(true)
    const acc = accounts[0] // primeira conta ativa
    setProgress({ status: 'running', pct: 0, msg: 'Iniciando importaÃ§Ã£o...' })

    // Disparar sync em modo sync (sÃ­ncrono, retorna quando termina)
    try {
      const res = await apiFetch('/api/ml/sync/products?sync=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: acc.id, limit: 10 }),
      })
      const json = await res.json()
      if (json.success) {
        setProgress({ status: 'completed', pct: 100, msg: `✅ ${json.message}` })
        onImported()
      } else {
        setProgress({ status: 'error', pct: 0, msg: '❌ ' + (json.error || 'Erro') })
      }
    } catch (err: any) {
      setProgress({ status: 'error', pct: 0, msg: '❌ ' + err.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={importing}
        style={{
          padding: '10px 18px',
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid #22c55e',
          color: '#22c55e',
          borderRadius: 8,
          cursor: importing ? 'wait' : 'pointer',
          fontWeight: 600,
          fontSize: '0.85em',
        }}
      >
        {importing ? '⏳ Importando...' : '📥 Importar do ML'}
      </button>

      {showModal && (
        <div
          onClick={() => !importing && setShowModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12,
              padding: 24, maxWidth: 500, width: '90%',
            }}
          >
            <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>📥 Importar Produtos do Mercado Livre</h3>
            <p style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 16 }}>
              Puxa os produtos cadastrados no seu ML e salva no sistema. Importa 10 produtos por vez (pode demorar ~10s).
              Repita o processo pra importar mais.
            </p>
            {accounts.length > 0 ? (
              <div style={{ marginBottom: 16, padding: 12, background: '#0d0d25', borderRadius: 8, fontSize: '0.85em' }}>
                <div style={{ color: '#a78bfa', marginBottom: 4 }}>Conta selecionada:</div>
                <div style={{ color: '#d0c0ff' }}>🏢 {accounts[0].nickname} ({accounts[0].total_listings} anúncios)</div>
              </div>
            ) : (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: '0.85em' }}>
                ⚠️ Nenhuma conta ML conectada
              </div>
            )}

            {progress.msg && (
              <div style={{
                marginBottom: 12, padding: 10, borderRadius: 6,
                background: progress.status === 'completed' ? 'rgba(34,197,94,0.1)' :
                            progress.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)',
                color: progress.status === 'completed' ? '#22c55e' :
                       progress.status === 'error' ? '#ef4444' : '#60a5fa',
                fontSize: '0.85em',
              }}>
                {progress.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={importing}
                style={{
                  padding: '10px 18px', background: 'transparent',
                  border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 8,
                  cursor: importing ? 'not-allowed' : 'pointer', fontSize: '0.85em',
                }}
              >
                Fechar
              </button>
              <button
                onClick={importar}
                disabled={importing || accounts.length === 0}
                style={{
                  padding: '10px 18px', background: '#22c55e', border: 'none',
                  color: '#000', borderRadius: 8, cursor: importing ? 'wait' : 'pointer',
                  fontWeight: 600, fontSize: '0.85em', opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? '⏳ Importando...' : '🚀 Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// =================== CARD DE PRODUTO — ESTILO PÁGINA MARCAS ===================
function ProdutoCardMetrify({
  product,
  mlPrice,
  mlListing,
  isCatalog,
  vendasTotal,
  estoqueBaixo,
  hasML,
  hasShopee,
  hasSite,
  onClick,
}: {
  product: any
  mlPrice: any
  mlListing: any
  isCatalog: boolean
  vendasTotal: number
  estoqueBaixo: boolean
  hasML: boolean
  hasShopee: boolean
  hasSite: boolean
  onClick: () => void
}) {
  const nomeLimpo = cleanName(product.nome)
  const marcaNome = product.marca?.nome || 'SEM MARCA'
  const avatarLetra = marcaNome.charAt(0).toUpperCase()
  const precoVenda = toNum(mlPrice?.preco_venda) ?? toNum(mlPrice?.preco)
  const qtdEstoque = product?.inventory?.quantidade_atual ?? 0
  const capital = (() => {
    const custo = toNum(mlPrice?.custo)
    if (custo == null || qtdEstoque == null) return null
    return custo * qtdEstoque
  })()
  const receita = (() => {
    if (precoVenda == null || !vendasTotal) return null
    return precoVenda * vendasTotal
  })()
  const fotoPct = product.foto_principal_url ? 100 : 0
  const mlPct = hasML ? 100 : 0
  const completeness = Math.round((mlPct + fotoPct) / 2)

  const barraCor = (pct: number) =>
    pct === 100 ? '#22c55e' : pct > 50 ? '#a78bfa' : '#f59e0b'

  const fmtMoeda = (n: number | null) => {
    if (n == null) return '—'
    if (n >= 1000000) return `R$ ${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: '#12122a',
        border: '1px solid #2a2a4a',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a4a')}
    >
      <div style={{ padding: '18px 18px 14px' }}>

        {/* HEADER: avatar + nome + seta */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          {/* Avatar com letra da marca */}
          <div style={{
            width: 52, height: 52, borderRadius: 10,
            background: '#a78bfa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: '1.4em', fontWeight: 800, color: '#000',
          }}>
            {avatarLetra}
          </div>

          {/* Nome + marca + SKU + volume */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badge da marca */}
            <div style={{
              display: 'inline-block',
              background: '#1a1a3a',
              color: '#a78bfa',
              borderRadius: 4,
              fontSize: '0.62em',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '1px 5px',
              marginBottom: 3,
            }}>
              {marcaNome}
            </div>
            <div style={{
              color: '#d0c0ff', fontWeight: 700, fontSize: '0.95em',
              lineHeight: 1.3, overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }} title={nomeLimpo}>
              {nomeLimpo}
            </div>
            <div style={{ color: '#7070a0', fontSize: '0.68em', marginTop: 2, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <span>{product.sku}</span>
              {product.volume && <span>· {product.volume}</span>}
            </div>
          </div>

          {/* Seta → */}
          <span style={{ color: '#7070a0', fontSize: 16, alignSelf: 'flex-start', marginTop: 2 }}>→</span>
        </div>

        {/* PREÇO + ESTOQUE + CAPITAL (mini row) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {precoVenda != null ? (
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.05em' }}>
              R$ {precoVenda.toFixed(2)}
            </span>
          ) : (
            <span style={{ color: '#7070a0', fontSize: '0.8em' }}>Sem preço</span>
          )}
          <span style={{
            background: qtdEstoque > 0 ? '#0a2a1a' : '#2a0a0a',
            color: qtdEstoque > 0 ? '#22c55e' : '#ef4444',
            borderRadius: 4, fontSize: '0.7em', padding: '1px 5px', fontWeight: 600,
          }}>
            📦 {qtdEstoque.toLocaleString('pt-BR')} un
          </span>
          {capital != null && (
            <span style={{ color: '#eab308', fontSize: '0.8em', fontWeight: 600 }}>
              💰 {fmtMoeda(capital)}
            </span>
          )}
          {vendasTotal > 0 && (
            <span style={{ color: '#a78bfa', fontSize: '0.8em', fontWeight: 600 }}>
              🛒 {vendasTotal} vendas
            </span>
          )}
        </div>

        {/* SKUs Anúncios + Fotos na mesma linha (igual marca) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
          {/* SKUs / Anúncios */}
          <div style={{ background: '#0d0d22', borderRadius: 6, padding: '5px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: '#7070a0', fontSize: '0.65em' }}>📢 Anúncios</span>
              <span style={{ color: barraCor(mlPct), fontWeight: 700, fontSize: '0.75em' }}>{mlPct}%</span>
            </div>
            <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '0.75em' }}>
              {hasML ? '1' : '0'}<span style={{ color: '#4a4a6a', fontWeight: 400 }}>/1</span>
              {hasML && <span style={{ color: '#22c55e', marginLeft: 4 }}>✓</span>}
            </div>
            <div style={{ marginTop: 4, height: 3, background: '#1a1a3a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${mlPct}%`, height: '100%',
                background: barraCor(mlPct), borderRadius: 2,
              }} />
            </div>
          </div>

          {/* Fotos */}
          <div style={{ background: '#0d0d22', borderRadius: 6, padding: '5px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: '#7070a0', fontSize: '0.65em' }}>📷 Fotos</span>
              <span style={{ color: barraCor(fotoPct), fontWeight: 700, fontSize: '0.75em' }}>{fotoPct}%</span>
            </div>
            <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '0.75em' }}>
              {product.foto_principal_url ? '1' : '0'}<span style={{ color: '#4a4a6a', fontWeight: 400 }}>/1</span>
              {product.foto_principal_url && <span style={{ color: '#22c55e', marginLeft: 4 }}>✓</span>}
            </div>
            <div style={{ marginTop: 4, height: 3, background: '#1a1a3a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${fotoPct}%`, height: '100%',
                background: barraCor(fotoPct), borderRadius: 2,
              }} />
            </div>
          </div>
        </div>

        {/* Barra de completude + footer */}
        <div style={{
          height: 4, background: '#0a0a1a', borderRadius: 2, overflow: 'hidden', marginTop: 4,
        }}>
          <div style={{
            width: `${completeness}%`, height: '100%',
            background: completeness === 100
              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
              : completeness > 50
                ? 'linear-gradient(90deg, #a78bfa, #6366f1)'
                : 'linear-gradient(90deg, #f59e0b, #ef4444)',
            borderRadius: 2,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
          <span style={{ color: '#3a3a5a', fontSize: '0.62em' }}>
            completude {completeness}%
          </span>
          {receita != null && (
            <span style={{ color: '#22c55e', fontSize: '0.68em', fontWeight: 600 }}>
              {fmtMoeda(receita)} receita
            </span>
          )}
        </div>

        {/* Badges marketplace */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <MarketplaceIcon plataforma="ml" ativo={hasML} />
          <MarketplaceIcon plataforma="shopee" ativo={hasShopee} />
          <MarketplaceIcon plataforma="site" ativo={hasSite} />
        </div>
      </div>
    </div>
  )
}

// =================== ÍCONE DE MARKETPLACE (DARK) ===================
function MarketplaceIcon({ plataforma, ativo }: { plataforma: 'ml' | 'shopee' | 'site'; ativo: boolean }) {
  const config = {
    ml: { label: 'ML', cor: '#ffe600', textoCor: '#000' },
    shopee: { label: 'SP', cor: '#ee4d2d', textoCor: '#fff' },
    site: { label: 'ST', cor: '#ec4899', textoCor: '#fff' },
  }[plataforma]

  return (
    <div
      title={ativo ? `Publicado em ${plataforma.toUpperCase()}` : `Não publicado em ${plataforma.toUpperCase()}`}
      style={{
        width: 32,
        height: 22,
        borderRadius: 4,
        border: `1px solid ${ativo ? config.cor : '#2a2a4a'}`,
        background: ativo ? config.cor : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.65em',
        fontWeight: 800,
        color: ativo ? config.textoCor : '#4040a0',
        cursor: 'help',
        transition: 'all 0.15s',
      }}
    >
      {config.label}
    </div>
  )
}

