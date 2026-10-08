'use client'

/**
 * PARTE 1: Página de Detalhe do Produto (estrutura + tabs info/preços)
 * Caminho: app/admin/produtos/[id]/page.tsx
 */

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { PromocaoManager } from './PromocaoManager'
import { apiFetch } from '@/lib/api-fetch'

interface Product {
  id: string
  sku: string
  ean: string | null
  nome: string
  descricao_curta: string | null
  descricao_completa: string | null
  genero: string | null
  volume: string | null
  ncm: string | null
  ativo: boolean
  destaque: boolean
  foto_principal_url: string | null
  fotos_adicionais: string[] | null
  brands: { id: string; nome: string; is_marca_propria: boolean }
  categories: { id: string; nome: string; slug: string } | null
  suppliers: { id: string; nome: string; prazo_entrega_dias: number } | null
  notas_olfativas: {
    familia?: string
    topo?: string
    coracao?: string
    base?: string
    inspiracao?: string
  } | null
  inventory: {
    quantidade_atual: number
    quantidade_minima: number
    quantidade_maxima: number | null
    custo_medio: number | null
    localizacao_fisica: string | null
    ultima_entrada: string | null
    ultima_saida: string | null
  } | null
  prices: {
    id: string
    canal: string
    company: { id: string; cnpj: string; nome_fantasia: string }
    custo: number | null
    preco_venda: number
    preco_promocional: number | null
    preco_minimo: number | null
    preco_maximo: number | null
    preco_dinamico_ativo: boolean
  }[]
  marketplace_listings?: Array<{
    id: string
    listing_id: string
    permalink: string | null
    status: string | null
    preco_atual: number | null
    preco_original: number | null
    vendas_total: number | null
    listing_type: string | null
    health: number | null
    condition: string | null
    modo_compra: string | null
    categoria_id_ml: string | null
    data_criacao_ml: string | null
    preco_promocional: number | null
    promocao_inicio: string | null
    promocao_fim: string | null
    tags: string[]
    last_sync_at: string | null
  }>
  _count: { order_items: number }
}

const CANAL_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  mercado_livre: { label: 'Mercado Livre', emoji: '🏪', color: '#ffe600' },
  shopee: { label: 'Shopee', emoji: '🛒', color: '#ee4d2d' },
  site_b2c: { label: 'Site B2C', emoji: '🌐', color: '#a78bfa' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#22c55e' },
  b2b: { label: 'Atacado B2B', emoji: '📋', color: '#60a5fa' },
  vendedora: { label: 'Vendedora', emoji: '👩‍💼', color: '#f472b6' },
}

type Tab = 'info' | 'ml' | 'precos' | 'estoque' | 'historico'

export default function ProdutoDetalhePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const sku = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('info')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated' && sku) fetchProduct()
  }, [status, sku])

  async function fetchProduct() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/products/${sku}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Produto nao encontrado')
        return
      }
      // Converter Decimals (string) pra number
      const p = json.data
      if (p?.prices) {
        p.prices = p.prices.map((pr: any) => ({
          ...pr,
          preco_venda: Number(pr.preco_venda),
          preco_promocional: pr.preco_promocional != null ? Number(pr.preco_promocional) : null,
          custo: pr.custo != null ? Number(pr.custo) : null,
        }))
      }
      if (p?.inventory?.custo_medio != null) {
        p.inventory.custo_medio = Number(p.inventory.custo_medio)
      }
      if (p?.marketplace_listings) {
        p.marketplace_listings = p.marketplace_listings.map((ml: any) => ({
          ...ml,
          preco_atual: ml.preco_atual != null ? Number(ml.preco_atual) : null,
          preco_original: ml.preco_original != null ? Number(ml.preco_original) : null,
          health: ml.health != null ? Number(ml.health) : null,
        }))
      }
      setProduct(p)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Desativar "${product?.nome}"?`)) return
    const res = await apiFetch(`/api/products/${sku}`, { method: 'DELETE' })
    if (res.ok) {
      alert('Produto desativado!')
      router.push('/admin/produtos')
    }
  }

  async function handleToggleDestaque() {
    await apiFetch(`/api/products/${sku}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destaque: !product?.destaque }),
    })
    fetchProduct()
  }

  if (loading || status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando...
      </div>
    )
  }

  if (error || !product) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 40, textAlign: 'center' }}>
        <h1>Erro</h1>
        <p>{error || 'Produto nao encontrado'}</p>
        <button onClick={() => router.push('/admin/produtos')} style={{ marginTop: 20, padding: '10px 20px', background: '#a78bfa', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Voltar
        </button>
      </div>
    )
  }

  const estoqueBaixo = product.inventory && product.inventory.quantidade_atual <= product.inventory.quantidade_minima

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ marginBottom: 16, fontSize: '0.85em' }}>
          <a href="/admin/produtos" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Produtos</a>
          <span style={{ color: '#7070a0', margin: '0 8px' }}>/</span>
          <span style={{ color: '#b0b0cc' }}>{product.sku}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 8 }}>{product.nome}</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>📦 {product.brands.nome}</span>
              {product.volume && <span>💧 {product.volume}</span>}
              {product.genero && <span>👤 {product.genero}</span>}
              {product.categories && <span>🏷️ {product.categories.nome}</span>}
              {product.ean && <span>🔢 EAN: {product.ean}</span>}
              <span>📊 {product._count.order_items} vendas</span>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {product.destaque && <span style={badgePink}>⭐ Destaque</span>}
              {product.brands.is_marca_propria && <span style={badgePurple}>✨ Sua Marca</span>}
              {product.ativo ? <span style={badgeGreen}>✓ Ativo</span> : <span style={badgeRed}>❌ Inativo</span>}
              {estoqueBaixo && <span style={badgeYellow}>⚠️ Estoque Baixo</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleToggleDestaque} style={btnSecondary}>
              {product.destaque ? '⭐ Remover destaque' : '⭐ Marcar destaque'}
            </button>
            <button onClick={() => router.push(`/admin/produtos/${product.sku}/editar`)} style={btnSecondary}>
              ✏️ Editar
            </button>
            <button onClick={handleDelete} style={btnDanger}>
              🗑️ Desativar
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
          {/* Foto */}
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, height: 'fit-content', position: 'sticky', top: 20 }}>
            <div style={{ width: '100%', aspectRatio: '1/1', background: '#0d0d25', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4em', marginBottom: 12 }}>
              {product.foto_principal_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.foto_principal_url} alt={product.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ opacity: 0.3 }}>🌸</span>
              )}
            </div>
          </div>

          {/* View única com tudo (sem abas) */}
          <ProdutoViewCompleta product={product} onUpdate={fetchProduct} />
        </div>
      </div>
    </div>
  )
}

// =================== ESTILOS ===================
const badgePink = { background: 'rgba(244,114,182,0.2)', color: '#f472b6', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgePurple = { background: 'rgba(167,139,250,0.2)', color: '#a78bfa', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgeGreen = { background: 'rgba(34,197,94,0.2)', color: '#22c55e', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgeRed = { background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const badgeYellow = { background: 'rgba(234,179,8,0.2)', color: '#eab308', padding: '3px 10px', borderRadius: 12, fontSize: '0.75em' } as const
const btnSecondary = { padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const
const btnDanger = { padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const
const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24 } as const

// =================== TAB: INFORMAÇÕES ===================
// =================== TAB: MERCADO LIVRE ===================
function TabML({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  const ml = product.marketplace_listings?.[0]
  const mlPrice = product.prices?.find((p) => p.canal === 'mercado_livre')

  if (!ml) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>
          <div style={{ fontSize: '3em', marginBottom: 12 }}>🏪</div>
          <p>Produto não está vinculado a nenhum anúncio do Mercado Livre.</p>
          <p style={{ fontSize: '0.85em', marginTop: 8 }}>
            Vá em <strong>Admin → Mercado Livre</strong> e clique em <strong>Sincronizar Produtos</strong>.
          </p>
        </div>
      </div>
    )
  }

  const isCatalog = ml.listing_type === 'gold_special' || ml.listing_type === 'catalog'
  const vendas = ml.vendas_total || 0
  const precoAtual = ml.preco_atual || 0
  const faturamento = vendas * precoAtual

  return (
    <div style={cardStyle}>
      {/* Header com tipo do anúncio */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        padding: 16, background: 'rgba(30,136,229,0.05)', borderRadius: 8,
        borderLeft: `4px solid ${isCatalog ? '#1e88e5' : '#22c55e'}`
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: isCatalog ? '#1e88e5' : '#22c55e',
          color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '1.4em'
        }}>
          {isCatalog ? 'C' : 'T'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#d0c0ff', fontWeight: 600 }}>
            {isCatalog ? 'Anúncio de Catálogo' : 'Anúncio Tradicional'}
          </div>
          <div style={{ color: '#7070a0', fontSize: '0.85em' }}>
            {isCatalog
              ? 'Mercado Livre gerencia o estoque'
              : 'Você gerencia o estoque manualmente'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
          {ml.permalink && (
            <a
              href={ml.permalink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px', background: 'rgba(255,230,0,0.1)', border: '1px solid #ffe600',
                color: '#ffe600', borderRadius: 6, textDecoration: 'none', fontSize: '0.8em', textAlign: 'center'
              }}
            >
              🔗 Ver no ML
            </a>
          )}
        </div>
      </div>

      {/* Métricas em destaque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💰 Preço Atual</div>
          <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>
            R$ {precoAtual.toFixed(2)}
          </div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>🔥 Vendidos</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>
            {vendas.toLocaleString('pt-BR')}
          </div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>📦 Estoque</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>
            {product.inventory?.quantidade_atual ?? 0}
          </div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💵 Faturamento</div>
          <div style={{ color: '#22c55e', fontSize: '1.2em', fontWeight: 700, marginTop: 4 }}>
            R$ {faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Detalhes técnicos do anúncio */}
      <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>Detalhes do Anúncio</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.9em', marginBottom: 20 }}>
        <InfoRow label="ID do Anúncio" valor={ml.listing_id} />
        <InfoRow label="Status" valor={ml.status || 'N/A'} />
        <InfoRow label="Listing Type" valor={ml.listing_type || 'N/A'} />
        <InfoRow label="Modo de Compra" valor={ml.modo_compra || 'buy_it_now'} />
        <InfoRow label="Condição" valor={ml.condition || 'new'} />
        <InfoRow label="Saúde" valor={ml.health != null ? `${ml.health}/100` : 'N/A'} />
        <InfoRow label="Categoria ML" valor={ml.categoria_id_ml || 'N/A'} />
        <InfoRow label="Criado em" valor={ml.data_criacao_ml ? new Date(ml.data_criacao_ml).toLocaleDateString('pt-BR') : 'N/A'} />
        <InfoRow label="EAN" valor={product.ean || 'Não cadastrado'} />
        <InfoRow label="Última Sync" valor={ml.last_sync_at ? new Date(ml.last_sync_at).toLocaleString('pt-BR') : 'Nunca'} />
      </div>

      {/* Análise de Margem + Form de Custo */}
      <MargemCalculator product={product} mlPrice={mlPrice} precoAtual={precoAtual} onSaved={onUpdate} />

      {/* Botão de atualizar estoque no ML */}
      <div style={{ marginTop: 20, padding: 16, background: 'rgba(167,139,250,0.05)', border: '1px solid #2a2a4a', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.95em' }}>🔄 Atualizar Estoque no Mercado Livre</div>
            <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
              {isCatalog
                ? '⚠️ Catálogo: o estoque é gerenciado pelo Mercado Livre (não pode ser alterado por aqui)'
                : `Envia o estoque atual do sistema (${product.inventory?.quantidade_atual ?? 0} un.) pro ML`}
            </div>
          </div>
          <UpdateStockButton
            listingId={ml.listing_id}
            productId={product.id}
            currentStock={product.inventory?.quantidade_atual ?? 0}
            isCatalog={isCatalog}
            onUpdated={onUpdate}
          />
        </div>
      </div>
    </div>
  )
}

// =================== COMPONENTE: MARGEM + FORM DE CUSTO ===================
function MargemCalculator({ product, mlPrice, precoAtual, onSaved }: {
  product: Product; mlPrice: any; precoAtual: number; onSaved: () => void
}) {
  const [custo, setCusto] = useState<string>(mlPrice?.custo?.toString() || '')
  const [editing, setEditing] = useState(!mlPrice?.custo)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const custoN = parseFloat(custo) || 0
  const lucro = precoAtual - custoN
  const margem = precoAtual > 0 ? ((precoAtual - custoN) / precoAtual) * 100 : 0
  const margemColor = margem > 30 ? '#22c55e' : margem > 15 ? '#eab308' : margem > 0 ? '#f97316' : '#7070a0'

  async function save() {
    if (!mlPrice) return
    setSaving(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          company_id: mlPrice.company?.id || mlPrice.company_id,
          canal: 'mercado_livre',
          preco_venda: precoAtual,
          custo: custo ? parseFloat(custo) : null,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setMsg('✅ Custo salvo!')
        setEditing(false)
        setTimeout(() => onSaved(), 500)
      } else {
        setMsg('❌ ' + (json.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: custoN > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.05)', border: `1px solid ${custoN > 0 ? '#22c55e' : '#eab308'}`, borderRadius: 8, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: custoN > 0 || editing ? 12 : 0 }}>
        <div style={{ color: custoN > 0 ? '#22c55e' : '#eab308', fontSize: '0.95em', fontWeight: 600 }}>
          📊 Análise de Margem (Mercado Livre)
        </div>
        {!editing && custoN > 0 && (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '6px 12px', background: 'rgba(167,139,250,0.15)',
              border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: 6,
              cursor: 'pointer', fontSize: '0.8em', fontWeight: 600,
            }}
          >
            ✏️ Editar Custo
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>
                💰 Custo (R$)
              </label>
              <input
                type="number" step="0.01" value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', padding: '8px 10px', background: '#0a0a1a',
                  border: '1px solid #2a2a4a', color: '#e8e8f0', borderRadius: 6, fontSize: '0.95em',
                }}
                autoFocus
              />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>
                💵 Preço Venda (atual)
              </label>
              <div style={{ padding: '8px 10px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6, fontSize: '0.95em' }}>
                R$ {precoAtual.toFixed(2)}
              </div>
            </div>
          </div>
          {custoN > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              <StatBox label="Custo" value={`R$ ${custoN.toFixed(2)}`} color="#d0c0ff" />
              <StatBox label="Lucro/un" value={`R$ ${lucro.toFixed(2)}`} color="#22c55e" />
              <StatBox label="Margem" value={`${margem.toFixed(1)}%`} color={margemColor} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '8px 16px', background: '#22c55e', border: 'none',
                color: '#000', borderRadius: 6, cursor: 'pointer',
                fontWeight: 600, fontSize: '0.9em', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvando...' : '💾 Salvar Custo'}
            </button>
            {custoN > 0 && (
              <button
                onClick={() => { setEditing(false); setCusto(mlPrice?.custo?.toString() || ''); setMsg('') }}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6,
                  cursor: 'pointer', fontSize: '0.9em',
                }}
              >
                Cancelar
              </button>
            )}
            {msg && <span style={{ color: '#22c55e', fontSize: '0.85em', marginLeft: 8 }}>{msg}</span>}
          </div>
        </div>
      ) : (
        custoN > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatBox label="Custo" value={`R$ ${custoN.toFixed(2)}`} color="#d0c0ff" />
            <StatBox label="Lucro/un" value={`R$ ${lucro.toFixed(2)}`} color="#22c55e" />
            <StatBox label="Margem" value={`${margem.toFixed(1)}%`} color={margemColor} />
          </div>
        )
      )}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 6 }}>
      <div style={{ color: '#7070a0', fontSize: '0.7em' }}>{label}</div>
      <div style={{ color, fontSize: '1.2em', fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

// =================== COMPONENTE: ATUALIZAR ESTOQUE NO ML ===================
function UpdateStockButton({ listingId, productId, currentStock, isCatalog, onUpdated }: {
  listingId: string; productId: string; currentStock: number; isCatalog: boolean; onUpdated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [stock, setStock] = useState(currentStock)
  const [editing, setEditing] = useState(false)

  async function update() {
    setLoading(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/ml/sync/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, quantity: stock }),
      })
      const json = await res.json()
      if (json.success) {
        setMsg('✅ Estoque atualizado!')
        setTimeout(() => { setMsg(''); onUpdated() }, 1500)
      } else {
        setMsg('❌ ' + (json.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number" value={stock} onChange={(e) => setStock(parseInt(e.target.value) || 0)}
          style={{
            width: 80, padding: '6px 8px', background: '#0a0a1a',
            border: '1px solid #2a2a4a', color: '#e8e8f0', borderRadius: 6, textAlign: 'center',
          }}
        />
        <button
          onClick={update} disabled={loading}
          style={{
            padding: '6px 12px', background: '#22c55e', border: 'none',
            color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85em',
          }}
        >
          {loading ? '...' : '✓ Enviar'}
        </button>
        <button
          onClick={() => { setEditing(false); setStock(currentStock) }}
          style={{
            padding: '6px 12px', background: 'transparent',
            border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6,
            cursor: 'pointer', fontSize: '0.85em',
          }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {msg && <span style={{ color: msg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '0.85em' }}>{msg}</span>}
      {isCatalog ? (
        <div
          style={{
            padding: '8px 14px', background: 'rgba(30,136,229,0.15)',
            border: '1px solid #1e88e5', color: '#1e88e5', borderRadius: 6,
            fontSize: '0.85em', fontWeight: 600,
          }}
          title="O Mercado Livre gerencia o estoque de itens de catálogo"
        >
          🔒 ML gerencia
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{
            padding: '8px 16px', background: '#a78bfa', border: 'none',
            color: '#000', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600, fontSize: '0.85em',
          }}
        >
          📦 Atualizar Estoque
        </button>
      )}
    </div>
  )
}

function TabInfo({ product }: { product: Product }) {
  return (
    <div style={cardStyle}>
      {product.descricao_curta && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ color: '#a78bfa', marginBottom: 8 }}>Descricao Curta</h3>
          <p style={{ color: '#b0b0cc', lineHeight: 1.6 }}>{product.descricao_curta}</p>
        </div>
      )}

      {product.notas_olfativas && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>🌸 Notas Olfativas</h3>
          {product.notas_olfativas.familia && (
            <div style={{ display: 'inline-block', background: 'rgba(167,139,250,0.2)', color: '#a78bfa', padding: '4px 12px', borderRadius: 12, fontSize: '0.85em', marginBottom: 16 }}>
              Familia: <strong>{product.notas_olfativas.familia}</strong>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            <NotaCard label="Topo" valor={product.notas_olfativas.topo} cor="#60a5fa" />
            <NotaCard label="Coracao" valor={product.notas_olfativas.coracao} cor="#f472b6" />
            <NotaCard label="Base" valor={product.notas_olfativas.base} cor="#eab308" />
          </div>
          {product.notas_olfativas.inspiracao && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(244,114,182,0.1)', borderRadius: 8, fontSize: '0.9em', color: '#f472b6' }}>
              <strong>Inspiracao:</strong> {product.notas_olfativas.inspiracao}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>Informacoes Tecnicas</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.9em' }}>
          <InfoRow label="SKU" valor={product.sku} />
          <InfoRow label="EAN" valor={product.ean || 'Nao cadastrado'} />
          <InfoRow label="NCM" valor={product.ncm || 'Nao cadastrado'} />
          <InfoRow label="Volume" valor={product.volume || 'Nao informado'} />
          <InfoRow label="Genero" valor={product.genero || 'Nao definido'} />
          <InfoRow label="Fornecedor" valor={product.suppliers?.nome || 'Nao vinculado'} />
        </div>
      </div>
    </div>
  )
}

function NotaCard({ label, valor, cor }: { label: string; valor?: string; cor: string }) {
  return (
    <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, borderLeft: `3px solid ${cor}` }}>
      <div style={{ color: cor, fontSize: '0.75em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ color: '#d0c0ff', fontSize: '0.9em' }}>{valor || '—'}</div>
    </div>
  )
}

function InfoRow({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#0d0d25', borderRadius: 6 }}>
      <span style={{ color: '#7070a0' }}>{label}</span>
      <span style={{ color: '#d0c0ff' }}>{valor}</span>
    </div>
  )
}

// =================== TAB: PREÇOS ===================
function TabPrecos({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ color: '#a78bfa', marginBottom: 16 }}>Preços por Canal de Venda</h3>
      <p style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 16 }}>
        Clique em "✏️ Editar" pra cadastrar custo, ajustar preço ou definir promoção.
        A margem é calculada em tempo real.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {product.prices.map((p) => (
          <PriceRow key={p.id} price={p} onSaved={onUpdate} />
        ))}
      </div>
    </div>
  )
}

function PriceRow({ price, onSaved }: { price: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [custo, setCusto] = useState<string>(price.custo?.toString() || '')
  const [precoVenda, setPrecoVenda] = useState<string>(price.preco_venda?.toString() || '')
  const [precoPromo, setPrecoPromo] = useState<string>(price.preco_promocional?.toString() || '')
  const [precoMin, setPrecoMin] = useState<string>(price.preco_minimo?.toString() || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const info = CANAL_LABELS[price.canal] || { label: price.canal, emoji: '📦', color: '#888' }
  const custoN = parseFloat(custo) || 0
  const precoN = parseFloat(precoVenda) || 0
  const promoN = parseFloat(precoPromo) || 0
  const margem = precoN > 0 ? ((precoN - custoN) / precoN) * 100 : 0
  const lucro = precoN - custoN

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: price.product_id || price.products?.id,
          company_id: price.company?.id || price.company_id,
          canal: price.canal,
          preco_venda: parseFloat(precoVenda) || 0,
          preco_promocional: precoPromo ? parseFloat(precoPromo) : null,
          custo: custo ? parseFloat(custo) : null,
          preco_minimo: precoMin ? parseFloat(precoMin) : null,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setMsg('✅ Salvo!')
        setTimeout(() => {
          setEditing(false)
          setMsg('')
          onSaved()
        }, 1000)
      } else {
        setMsg('❌ ' + (json.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const margemColor = margem > 30 ? '#22c55e' : margem > 15 ? '#eab308' : margem > 0 ? '#f97316' : '#7070a0'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, background: '#0d0d25', borderRadius: 8,
        borderLeft: `3px solid ${info.color}`,
      }}>
        <div>
          <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '0.95em' }}>
            {info.emoji} {info.label}
          </div>
          <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
            {price.company?.nome_fantasia || ''} · {price.company?.cnpj || ''}
          </div>
          {custoN > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.85em' }}>
              <span style={{ color: margemColor, fontWeight: 600 }}>
                📊 Margem: {margem.toFixed(1)}%
              </span>
              <span style={{ color: '#22c55e' }}>
                💰 Lucro: R$ {lucro.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#a78bfa', fontSize: '1.3em', fontWeight: 'bold' }}>
              R$ {Number(price.preco_venda).toFixed(2)}
            </div>
            {price.preco_promocional && (
              <div style={{ color: '#22c55e', fontSize: '0.8em' }}>
                Promo: R$ {Number(price.preco_promocional).toFixed(2)}
              </div>
            )}
            {price.custo && (
              <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 2 }}>
                Custo: R$ {Number(price.custo).toFixed(2)}
              </div>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '8px 14px', background: 'rgba(167,139,250,0.15)',
              border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: 6,
              cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
            }}
          >
            ✏️ Editar
          </button>
        </div>
      </div>
    )
  }

  // Modo edição
  const inputStyle = {
    width: '100%', padding: '8px 10px', background: '#0a0a1a',
    border: '1px solid #2a2a4a', color: '#e8e8f0', borderRadius: 6, fontSize: '0.95em',
  } as const
  const labelStyle = { color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 } as const

  return (
    <div style={{
      padding: 16, background: '#0d0d25', borderRadius: 8,
      borderLeft: `3px solid ${info.color}`,
    }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#d0c0ff', fontWeight: 600 }}>
          {info.emoji} {info.label}
        </div>
        <div style={{ color: '#22c55e', fontSize: '1em', fontWeight: 700 }}>
          {custoN > 0 && `Margem: ${margem.toFixed(1)}%`}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>💰 Custo (R$)</label>
          <input
            type="number" step="0.01" value={custo}
            onChange={(e) => setCusto(e.target.value)}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>💵 Preço (R$)</label>
          <input
            type="number" step="0.01" value={precoVenda}
            onChange={(e) => setPrecoVenda(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>🏷️ Promoção (R$)</label>
          <input
            type="number" step="0.01" value={precoPromo}
            onChange={(e) => setPrecoPromo(e.target.value)}
            placeholder="—"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>📉 Preço Mínimo (R$)</label>
          <input
            type="number" step="0.01" value={precoMin}
            onChange={(e) => setPrecoMin(e.target.value)}
            placeholder="—"
            style={inputStyle}
          />
        </div>
      </div>
      {custoN > 0 && precoN > 0 && (
        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
          borderRadius: 6, padding: 10, marginBottom: 12, fontSize: '0.85em'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#22c55e' }}>
              💰 Lucro por unidade: <strong>R$ {lucro.toFixed(2)}</strong>
            </span>
            <span style={{ color: margem > 30 ? '#22c55e' : margem > 15 ? '#eab308' : '#f97316' }}>
              📊 Margem: <strong>{margem.toFixed(1)}%</strong>
            </span>
            {promoN > 0 && (
              <span style={{ color: '#60a5fa' }}>
                🏷️ Margem c/ promo: <strong>{((promoN - custoN) / promoN * 100).toFixed(1)}%</strong>
              </span>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={save}
          disabled={saving || !precoVenda}
          style={{
            padding: '8px 16px', background: '#22c55e', border: 'none',
            color: '#000', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600, fontSize: '0.9em', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Salvando...' : '💾 Salvar'}
        </button>
        <button
          onClick={() => { setEditing(false); setMsg('') }}
          style={{
            padding: '8px 16px', background: 'transparent',
            border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6,
            cursor: 'pointer', fontSize: '0.9em',
          }}
        >
          Cancelar
        </button>
        {msg && <span style={{ color: '#22c55e', fontSize: '0.85em', marginLeft: 8 }}>{msg}</span>}
      </div>
    </div>
  )
}

// =================== TAB: ESTOQUE ===================
function TabEstoque({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  if (!product.inventory) {
    return <div style={cardStyle}>Sem informacoes de estoque</div>
  }
  const inv = product.inventory
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#a78bfa' }}>Controle de Estoque</h3>
        <InventoryEditor product={product} onSaved={onUpdate} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Atual</div>
          <div style={{ color: '#a78bfa', fontSize: '2.5em', fontWeight: 'bold' }}>{inv.quantidade_atual}</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>unidades</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Mínimo</div>
          <div style={{ color: '#eab308', fontSize: '2.5em', fontWeight: 'bold' }}>{inv.quantidade_minima}</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>alerta</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Máximo</div>
          <div style={{ color: '#22c55e', fontSize: '2.5em', fontWeight: 'bold' }}>{inv.quantidade_maxima || '—'}</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>capacidade</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.9em' }}>
        <InfoRow label="Localização" valor={inv.localizacao_fisica || 'Não definida'} />
        <InfoRow label="Custo Médio" valor={inv.custo_medio ? `R$ ${Number(inv.custo_medio).toFixed(2)}` : 'Não definido'} />
        <InfoRow label="Última Entrada" valor={inv.ultima_entrada ? new Date(inv.ultima_entrada).toLocaleDateString('pt-BR') : 'Nunca'} />
        <InfoRow label="Última Saída" valor={inv.ultima_saida ? new Date(inv.ultima_saida).toLocaleDateString('pt-BR') : 'Nunca'} />
      </div>
    </div>
  )
}

// =================== COMPONENTE: EDITOR DE ESTOQUE ===================
function InventoryEditor({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [qtd, setQtd] = useState(product.inventory?.quantidade_atual ?? 0)
  const [qtdMin, setQtdMin] = useState(product.inventory?.quantidade_minima ?? 0)
  const [qtdMax, setQtdMax] = useState(product.inventory?.quantidade_maxima ?? 0)
  const [custoMedio, setCustoMedio] = useState(product.inventory?.custo_medio?.toString() || '')
  const [localizacao, setLocalizacao] = useState(product.inventory?.localizacao_fisica || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const res = await apiFetch(`/api/inventory/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantidade_atual: qtd,
          quantidade_minima: qtdMin,
          quantidade_maxima: qtdMax,
          custo_medio: custoMedio ? parseFloat(custoMedio) : null,
          localizacao_fisica: localizacao || null,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setMsg('✅ Salvo!')
        setTimeout(() => { setOpen(false); setMsg(''); onSaved() }, 1000)
      } else {
        setMsg('❌ ' + (json.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px', background: 'rgba(167,139,250,0.15)',
          border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: 6,
          cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
        }}
      >
        ✏️ Editar Estoque
      </button>
    )
  }

  const inputStyle = {
    width: '100%', padding: '6px 10px', background: '#0a0a1a',
    border: '1px solid #2a2a4a', color: '#e8e8f0', borderRadius: 6, fontSize: '0.9em',
  } as const
  const labelStyle = { color: '#7070a0', fontSize: '0.7em', display: 'block', marginBottom: 2 } as const

  return (
    <div style={{ background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>📦 Atual</label>
          <input type="number" value={qtd} onChange={(e) => setQtd(parseInt(e.target.value) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>⚠️ Mínimo</label>
          <input type="number" value={qtdMin} onChange={(e) => setQtdMin(parseInt(e.target.value) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>📈 Máximo</label>
          <input type="number" value={qtdMax} onChange={(e) => setQtdMax(parseInt(e.target.value) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>📍 Localização</label>
          <input type="text" value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} placeholder="ex: A1-P3" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>💰 Custo Médio (R$) — opcional</label>
          <input type="number" step="0.01" value={custoMedio} onChange={(e) => setCustoMedio(e.target.value)} placeholder="0.00" style={{ ...inputStyle, width: 200 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <button
            onClick={save} disabled={saving}
            style={{
              padding: '8px 16px', background: '#22c55e', border: 'none',
              color: '#000', borderRadius: 6, cursor: 'pointer',
              fontWeight: 600, fontSize: '0.85em', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Salvando...' : '💾 Salvar'}
          </button>
          <button
            onClick={() => { setOpen(false); setMsg('') }}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6,
              cursor: 'pointer', fontSize: '0.85em',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
      {msg && <div style={{ color: '#22c55e', fontSize: '0.85em', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}

// =================== TAB: HISTÓRICO DE VENDAS ===================
function TabHistorico({ product }: { product: Product }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ color: '#a78bfa', marginBottom: 16 }}>Historico de Vendas</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Total de Vendas</div>
          <div style={{ color: '#a78bfa', fontSize: '2.5em', fontWeight: 'bold' }}>{product._count.order_items}</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>pedidos</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Ultima Venda</div>
          <div style={{ color: '#22c55e', fontSize: '1.3em', fontWeight: 'bold' }}>—</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>implementar</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 20, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Receita Total</div>
          <div style={{ color: '#22c55e', fontSize: '1.3em', fontWeight: 'bold' }}>R$ —</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>implementar</div>
        </div>
      </div>
      <div style={{ padding: 16, background: 'rgba(96,165,250,0.1)', borderRadius: 8, color: '#60a5fa', fontSize: '0.85em' }}>
        💡 Dica: conecte sua conta do Mercado Livre pra ver o historico completo de vendas deste produto.
      </div>
    </div>
  )
}

// =================== VIEW COMPLETA DO PRODUTO (sem abas) ===================
function ProdutoViewCompleta({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  const ml = product.marketplace_listings?.[0]
  const mlPrice = product.prices?.find((p) => p.canal === 'mercado_livre')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Seção 1: Info básica + Fotos */}
      <div style={cardStyle}>
        <h3 style={{ color: '#a78bfa', marginBottom: 16 }}>📋 Informações do Produto</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.9em' }}>
          <InfoRow label="SKU" valor={product.sku} />
          <InfoRow label="EAN" valor={product.ean || 'Não cadastrado'} />
          <InfoRow label="NCM" valor={product.ncm || 'Não cadastrado'} />
          <InfoRow label="Volume" valor={product.volume || 'Não informado'} />
          <InfoRow label="Gênero" valor={product.genero || 'Não definido'} />
          <InfoRow label="Marca" valor={product.brands?.nome || 'Sem marca'} />
          <InfoRow label="Categoria" valor={product.categories?.nome || '—'} />
          <InfoRow label="Fornecedor" valor={product.suppliers?.nome || '—'} />
        </div>
        {product.notas_olfativas && (
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(167,139,250,0.05)', borderRadius: 8 }}>
            <div style={{ color: '#a78bfa', fontSize: '0.85em', fontWeight: 600, marginBottom: 8 }}>🌸 Notas Olfativas</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: '0.85em' }}>
              <NotaCard label="Família" valor={product.notas_olfativas.familia} cor="#a78bfa" />
              <NotaCard label="Topo" valor={product.notas_olfativas.topo} cor="#60a5fa" />
              <NotaCard label="Coração" valor={product.notas_olfativas.coracao} cor="#f472b6" />
              <NotaCard label="Base" valor={product.notas_olfativas.base} cor="#eab308" />
            </div>
          </div>
        )}
        {product.descricao_completa && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: '#a78bfa', fontSize: '0.85em', fontWeight: 600, marginBottom: 8 }}>📝 Descrição Completa</div>
            <div style={{ color: '#d0c0ff', fontSize: '0.9em', lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: 12, background: '#0a0a1a', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
              {product.descricao_completa}
            </div>
          </div>
        )}
      </div>

      {/* Seção 2: Mercado Livre (se houver) */}
      {ml && <MLSection ml={ml} product={product} mlPrice={mlPrice} onUpdate={onUpdate} />}

      {/* Seção 3: Promoção (se houver) */}
      {ml && (ml as any).preco_promocional && <PromocaoSection ml={ml} />}

      {/* Seção 4: DRE do produto */}
      <DRESection product={product} />

      {/* Seção 5: Preços */}
      <PrecosSection product={product} onUpdate={onUpdate} />

      {/* Seção 6: Estoque */}
      <EstoqueSection product={product} onUpdate={onUpdate} />

      {/* Seção 7: Movimentações de Estoque */}
      <MovimentacoesSection product={product} />

      {/* Seção 8: Vendas (últimos orders) */}
      <VendasSection product={product} />

      {/* Seção 9: Histórico de Preço (gráfico) */}
      <HistoricoPrecoSection product={product} />
    </div>
  )
}

// =================== SEÇÃO MERCADO LIVRE ===================
function MLSection({ ml, product, mlPrice, onUpdate }: {
  ml: any; product: Product; mlPrice: any; onUpdate: () => void
}) {
  const isCatalog = ml.listing_type === 'gold_special' || ml.listing_type === 'catalog'
  const vendas = ml.vendas_total || 0
  const precoAtual = ml.preco_atual || 0
  const faturamento = vendas * precoAtual

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: isCatalog ? '#1e88e5' : '#22c55e',
          color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '1.4em',
        }}>
          {isCatalog ? 'C' : 'T'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#d0c0ff', fontWeight: 600 }}>
            {isCatalog ? 'Anúncio de Catálogo' : 'Anúncio Tradicional'}
          </div>
          <div style={{ color: '#7070a0', fontSize: '0.85em' }}>
            {isCatalog ? 'Mercado Livre gerencia o estoque' : 'Você gerencia o estoque'}
          </div>
        </div>
        {ml.permalink && (
          <a href={ml.permalink} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '8px 16px', background: 'rgba(255,230,0,0.1)', border: '1px solid #ffe600',
              color: '#ffe600', borderRadius: 6, textDecoration: 'none', fontSize: '0.85em', fontWeight: 600,
            }}>
            🔗 Ver no ML
          </a>
        )}
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💰 Preço Atual</div>
          <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>R$ {precoAtual.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>🔥 Vendidos</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>{vendas.toLocaleString('pt-BR')}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>📦 Estoque ML</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700, marginTop: 4 }}>{product.inventory?.quantidade_atual ?? 0}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💵 Faturamento</div>
          <div style={{ color: '#22c55e', fontSize: '1.2em', fontWeight: 700, marginTop: 4 }}>R$ {faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Detalhes técnicos do anúncio */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ color: '#a78bfa', fontSize: '0.9em', marginBottom: 8 }}>Detalhes do Anúncio</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.85em' }}>
          <InfoRow label="ID do Anúncio" valor={ml.listing_id} />
          <InfoRow label="Status" valor={ml.status || 'N/A'} />
          <InfoRow label="Listing Type" valor={ml.listing_type || 'N/A'} />
          <InfoRow label="Modo de Compra" valor={ml.modo_compra || 'buy_it_now'} />
          <InfoRow label="Condição" valor={ml.condition || 'new'} />
          <InfoRow label="Saúde" valor={ml.health != null ? `${ml.health}/100` : 'N/A'} />
          <InfoRow label="Criado em" valor={ml.data_criacao_ml ? new Date(ml.data_criacao_ml).toLocaleDateString('pt-BR') : 'N/A'} />
          <InfoRow label="Última Sync ML" valor={ml.last_sync_at ? new Date(ml.last_sync_at).toLocaleString('pt-BR') : 'Nunca'} />
        </div>
      </div>

      {/* Margem + Cadastrar Custo */}
      <MargemCalculator product={product} mlPrice={mlPrice} precoAtual={precoAtual} onSaved={onUpdate} />

      {/* Atualizar Estoque no ML */}
      {!isCatalog && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(167,139,250,0.05)', border: '1px solid #2a2a4a', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ color: '#a78bfa', fontSize: '0.85em', fontWeight: 600 }}>🔄 Atualizar Estoque no ML</div>
              <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 2 }}>
                Envia o estoque atual ({product.inventory?.quantidade_atual ?? 0} un.) pro Mercado Livre
              </div>
            </div>
            <UpdateStockButton
              listingId={ml.listing_id}
              productId={product.id}
              currentStock={product.inventory?.quantidade_atual ?? 0}
              isCatalog={isCatalog}
              onUpdated={onUpdate}
            />
          </div>
        </div>
      )}

      {/* Criar/Editar Promoção no ML */}
      <div style={{ marginTop: 16, padding: 12, background: 'rgba(34,197,94,0.05)', border: '1px solid #2a2a4a', borderRadius: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#22c55e', fontSize: '0.85em', fontWeight: 600 }}>🏷️ Promoção Mercado Livre</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 2 }}>
            Crie promoções com 1 clique. Define percentual ou valor fixo e duração.
          </div>
        </div>
        <PromocaoManager
          listingId={ml.listing_id}
          precoAtual={precoAtual}
          precoPromocional={(ml as any).preco_promocional}
          promocaoFim={(ml as any).promocao_fim}
          onUpdated={onUpdate}
        />
      </div>
    </div>
  )
}

// =================== SEÇÃO PREÇOS ===================
function PrecosSection({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ color: '#a78bfa', marginBottom: 8 }}>💰 Preços por Canal de Venda</h3>
      <p style={{ color: '#7070a0', fontSize: '0.8em', marginBottom: 16 }}>
        Clique em "✏️ Editar" pra cadastrar custo, ajustar preço ou definir promoção. A margem é calculada em tempo real.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {product.prices.map((p) => <PriceRow key={p.id} price={p} onSaved={onUpdate} />)}
      </div>
    </div>
  )
}

// =================== SEÇÃO ESTOQUE ===================
function EstoqueSection({ product, onUpdate }: { product: Product; onUpdate: () => void }) {
  if (!product.inventory) return <div style={cardStyle}>Sem informações de estoque</div>
  const inv = product.inventory
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#a78bfa' }}>📦 Controle de Estoque</h3>
        <InventoryEditor product={product} onSaved={onUpdate} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Atual</div>
          <div style={{ color: '#a78bfa', fontSize: '2em', fontWeight: 'bold' }}>{inv.quantidade_atual}</div>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>unidades</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Mínimo</div>
          <div style={{ color: '#eab308', fontSize: '2em', fontWeight: 'bold' }}>{inv.quantidade_minima}</div>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>alerta</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>Máximo</div>
          <div style={{ color: '#22c55e', fontSize: '2em', fontWeight: 'bold' }}>{inv.quantidade_maxima || '—'}</div>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>capacidade</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.85em' }}>
        <InfoRow label="Localização" valor={inv.localizacao_fisica || 'Não definida'} />
        <InfoRow label="Custo Médio" valor={inv.custo_medio ? `R$ ${Number(inv.custo_medio).toFixed(2)}` : 'Não definido'} />
        <InfoRow label="Última Entrada" valor={inv.ultima_entrada ? new Date(inv.ultima_entrada).toLocaleDateString('pt-BR') : 'Nunca'} />
        <InfoRow label="Última Saída" valor={inv.ultima_saida ? new Date(inv.ultima_saida).toLocaleDateString('pt-BR') : 'Nunca'} />
      </div>
    </div>
  )
}

// =================== SEÇÃO VENDAS ===================
function VendasSection({ product }: { product: Product }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  async function fetchOrders() {
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${product.id}/orders`)
      const json = await res.json()
      if (json.success) setOrders(json.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function importSales() {
    setImporting(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/ml/sync/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 60, all: true }),
      })
      const json = await res.json()
      if (json.success) {
        setMsg(`✅ ${json.message}`)
        setTimeout(() => fetchOrders(), 2000)
      } else {
        setMsg('❌ ' + (json.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const totalVendas = orders.length
  const valorTotal = orders.reduce((acc, o) => acc + Number(o.total || 0), 0)
  const recebidoTotal = orders.reduce((acc, o) => acc + Number(o.valor_receber || 0), 0)

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#a78bfa' }}>📊 Vendas deste Produto</h3>
        <button
          onClick={importSales}
          disabled={importing}
          style={{
            padding: '8px 16px', background: '#22c55e', border: 'none',
            color: '#000', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600, fontSize: '0.85em', opacity: importing ? 0.6 : 1,
          }}
        >
          {importing ? '⏳ Importando...' : '📥 Importar Vendas do ML'}
        </button>
      </div>

      {msg && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 6,
          background: msg.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '0.85em',
        }}>
          {msg}
        </div>
      )}

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Pedidos</div>
          <div style={{ color: '#a78bfa', fontSize: '1.8em', fontWeight: 'bold' }}>{totalVendas}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Valor Total Vendido</div>
          <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700 }}>R$ {valorTotal.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>A Receber</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>R$ {recebidoTotal.toFixed(2)}</div>
        </div>
      </div>

      {/* Lista de orders */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#7070a0' }}>Carregando...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#7070a0' }}>
          Nenhuma venda registrada pra este produto. Clique em "Importar Vendas" pra puxar do ML.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflow: 'auto' }}>
          {orders.map((o) => (
            <div key={o.id} style={{
              padding: 12, background: '#0d0d25', borderRadius: 6,
              borderLeft: `3px solid ${o.status === 'paid' ? '#22c55e' : o.status === 'cancelled' ? '#ef4444' : '#eab308'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '0.9em' }}>
                    Pedido #{o.order_sn || o.id?.substring(0, 8)}
                  </div>
                  <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 2 }}>
                    {new Date(o.created_at).toLocaleString('pt-BR')} • {o.status}
                    {o.buyer_nickname && ` • Comprador: ${o.buyer_nickname}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#a78bfa', fontSize: '1.1em', fontWeight: 700 }}>
                    R$ {Number(o.total || 0).toFixed(2)}
                  </div>
                  <div style={{ color: '#22c55e', fontSize: '0.75em' }}>
                    A receber: R$ {Number(o.valor_receber || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =================== SEÇÃO PROMOÇÃO ===================
function PromocaoSection({ ml }: { ml: any }) {
  const precoCheio = Number(ml.preco_original || ml.preco_atual || 0)
  const precoPromo = Number(ml.preco_promocional || 0)
  const desconto = precoCheio > 0 ? ((precoCheio - precoPromo) / precoCheio) * 100 : 0
  const economia = precoCheio - precoPromo
  const agora = new Date()
  const inicio = ml.promocao_inicio ? new Date(ml.promocao_inicio) : null
  const fim = ml.promocao_fim ? new Date(ml.promocao_fim) : null
  const ativa = (!inicio || agora >= inicio) && (!fim || agora <= fim)

  return (
    <div style={{ ...cardStyle, background: ativa ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.02))' : 'rgba(234,179,8,0.05)', border: `1px solid ${ativa ? '#22c55e' : '#eab308'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ color: ativa ? '#22c55e' : '#eab308' }}>
            🏷️ {ativa ? 'Promoção Ativa' : 'Promoção Encerrada'}
          </h3>
          {ml.promocao_tipo && (
            <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
              Tipo: {ml.promocao_tipo}
              {ml.frete_gratis && ' • 🚚 Frete Grátis'}
              {ml.envio_full && ' • 📦 Mercado Envios Full'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Desconto</div>
          <div style={{ color: '#22c55e', fontSize: '1.6em', fontWeight: 700 }}>{desconto.toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💰 Preço Cheio</div>
          <div style={{ color: '#a78bfa', fontSize: '1.3em', fontWeight: 700, textDecoration: 'line-through' }}>R$ {precoCheio.toFixed(2)}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.1)', padding: 16, borderRadius: 8, border: '1px solid #22c55e' }}>
          <div style={{ color: '#22c55e', fontSize: '0.75em', fontWeight: 600 }}>🏷️ Preço Promo</div>
          <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>R$ {precoPromo.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💵 Economia</div>
          <div style={{ color: '#22c55e', fontSize: '1.3em', fontWeight: 700 }}>R$ {economia.toFixed(2)}</div>
        </div>
      </div>
      {(inicio || fim) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85em' }}>
          {inicio && (
            <div style={{ background: '#0a0a1a', padding: 10, borderRadius: 6 }}>
              <div style={{ color: '#7070a0', fontSize: '0.75em' }}>▶️ Início</div>
              <div style={{ color: '#d0c0ff' }}>{inicio.toLocaleString('pt-BR')}</div>
            </div>
          )}
          {fim && (
            <div style={{ background: '#0a0a1a', padding: 10, borderRadius: 6 }}>
              <div style={{ color: '#7070a0', fontSize: '0.75em' }}>⏹️ Término</div>
              <div style={{ color: '#d0c0ff' }}>{fim.toLocaleString('pt-BR')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =================== SEÇÃO DRE ===================
function DRESection({ product }: { product: Product }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/products/${product.id}/dre?days=${days}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, days])

  if (loading) return <div style={cardStyle}>📊 Carregando DRE...</div>
  if (!data) return null

  const r = data.resumo
  return (
    <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(34,197,94,0.05), rgba(167,139,250,0.05))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#a78bfa' }}>📊 DRE — Demonstrativo de Resultado</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '6px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }}>
          <option value={7}>Últimos 7 dias</option>
          <option value={15}>15 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
          <option value={365}>1 ano</option>
        </select>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>📦 Qtd Vendida</div>
          <div style={{ color: '#a78bfa', fontSize: '1.5em', fontWeight: 700 }}>{r.qtd_vendida}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💰 Receita</div>
          <div style={{ color: '#a78bfa', fontSize: '1.3em', fontWeight: 700 }}>R$ {r.receita.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💵 CMV</div>
          <div style={{ color: '#ef4444', fontSize: '1.3em', fontWeight: 700 }}>R$ {r.cmv.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>📈 Comissão ML</div>
          <div style={{ color: '#eab308', fontSize: '1.3em', fontWeight: 700 }}>R$ {r.comissao_ml.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: r.lucro_bruto >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: 16, borderRadius: 8, border: `1px solid ${r.lucro_bruto >= 0 ? '#22c55e' : '#ef4444'}` }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💵 Lucro Bruto</div>
          <div style={{ color: r.lucro_bruto >= 0 ? '#22c55e' : '#ef4444', fontSize: '1.4em', fontWeight: 700 }}>R$ {r.lucro_bruto.toFixed(2)}</div>
          <div style={{ color: r.margem_bruta_pct >= 30 ? '#22c55e' : r.margem_bruta_pct >= 15 ? '#eab308' : '#ef4444', fontSize: '0.75em', marginTop: 4 }}>Margem: {r.margem_bruta_pct.toFixed(1)}%</div>
        </div>
        <div style={{ background: r.lucro_liquido >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: 16, borderRadius: 8, border: `1px solid ${r.lucro_liquido >= 0 ? '#22c55e' : '#ef4444'}` }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>💎 Lucro Líquido</div>
          <div style={{ color: r.lucro_liquido >= 0 ? '#22c55e' : '#ef4444', fontSize: '1.4em', fontWeight: 700 }}>R$ {r.lucro_liquido.toFixed(2)}</div>
          <div style={{ color: r.margem_liquida_pct >= 20 ? '#22c55e' : r.margem_liquida_pct >= 10 ? '#eab308' : '#ef4444', fontSize: '0.75em', marginTop: 4 }}>Margem: {r.margem_liquida_pct.toFixed(1)}%</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>🎫 Ticket Médio</div>
          <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700 }}>R$ {r.ticket_medio.toFixed(2)}</div>
          <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>por unidade</div>
        </div>
      </div>

      {/* Mini gráfico de vendas por dia */}
      <VendasChart vendas={data.vendas_por_dia} />
    </div>
  )
}

function VendasChart({ vendas }: { vendas: Array<{ dia: string; vendas: number; receita: number; qtd: number }> }) {
  const maxReceita = Math.max(...vendas.map(v => v.receita), 1)
  return (
    <div style={{ background: '#0a0a1a', padding: 16, borderRadius: 8 }}>
      <div style={{ color: '#a78bfa', fontSize: '0.85em', fontWeight: 600, marginBottom: 12 }}>📈 Vendas por dia</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 80 }}>
        {vendas.map((v, i) => {
          const h = (v.receita / maxReceita) * 100
          return (
            <div key={i} title={`${v.dia}: R$ ${v.receita.toFixed(2)} (${v.vendas} vendas)`}
              style={{
                flex: 1, height: `${Math.max(h, 2)}%`,
                background: v.receita > 0 ? '#22c55e' : '#1a1a2e',
                borderRadius: '2px 2px 0 0',
                minWidth: 4,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// =================== SEÇÃO MOVIMENTAÇÕES ===================
function MovimentacoesSection({ product }: { product: Product }) {
  const [movs, setMovs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/inventory/${product.id}/movements`)
      .then(r => r.json())
      .then(j => { if (j.success) setMovs(j.data || []); setLoading(false) })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  if (loading) return <div style={cardStyle}>📦 Carregando movimentações...</div>

  return (
    <div style={cardStyle}>
      <h3 style={{ color: '#a78bfa', marginBottom: 16 }}>📋 Histórico de Movimentações de Estoque</h3>
      {movs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#7070a0', fontSize: '0.85em' }}>
          Nenhuma movimentação registrada. Movimentações aparecem aqui quando você edita o estoque.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflow: 'auto' }}>
          {movs.map((m) => (
            <div key={m.id} style={{
              padding: 10, background: '#0d0d25', borderRadius: 6,
              borderLeft: `3px solid ${m.tipo === 'entrada' ? '#22c55e' : '#ef4444'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85em',
            }}>
              <div>
                <span style={{ color: m.tipo === 'entrada' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {m.tipo === 'entrada' ? '↑' : '↓'} {m.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
                </span>
                <span style={{ color: '#d0c0ff', marginLeft: 8 }}>{m.quantidade} un.</span>
                {m.observacao && <span style={{ color: '#7070a0', marginLeft: 8, fontSize: '0.8em' }}>— {m.observacao}</span>}
              </div>
              <div style={{ color: '#7070a0', fontSize: '0.8em' }}>
                {new Date(m.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =================== SEÇÃO HISTÓRICO DE PREÇO ===================
function HistoricoPrecoSection({ product }: { product: Product }) {
  const [data, setData] = useState<{ history: any[]; preco_atual_ml: number; preco_promocional_ml: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/products/${product.id}/price-history?days=${days}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, days])

  if (loading) return <div style={cardStyle}>📈 Carregando histórico de preço...</div>
  if (!data) return null

  const history = data.history
  const precos = history.map((h: any) => h.preco)
  const min = precos.length > 0 ? Math.min(...precos) : 0
  const max = precos.length > 0 ? Math.max(...precos) : 1
  const media = precos.length > 0 ? precos.reduce((a: number, b: number) => a + b, 0) / precos.length : 0
  const range = max - min || 1

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#a78bfa' }}>📈 Histórico de Preço (ML)</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '6px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }}>
          <option value={30}>30 dias</option>
          <option value={60}>60 dias</option>
          <option value={90}>90 dias</option>
          <option value={180}>180 dias</option>
          <option value={365}>1 ano</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d0d25', padding: 12, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Preço Atual</div>
          <div style={{ color: '#a78bfa', fontSize: '1.2em', fontWeight: 700 }}>R$ {Number(data.preco_atual_ml || 0).toFixed(2)}</div>
        </div>
        {data.preco_promocional_ml && (
          <div style={{ background: 'rgba(34,197,94,0.1)', padding: 12, borderRadius: 8 }}>
            <div style={{ color: '#22c55e', fontSize: '0.7em' }}>🏷️ Promoção</div>
            <div style={{ color: '#22c55e', fontSize: '1.2em', fontWeight: 700 }}>R$ {data.preco_promocional_ml.toFixed(2)}</div>
          </div>
        )}
        <div style={{ background: '#0d0d25', padding: 12, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Média</div>
          <div style={{ color: '#d0c0ff', fontSize: '1.2em', fontWeight: 700 }}>R$ {media.toFixed(2)}</div>
        </div>
        <div style={{ background: '#0d0d25', padding: 12, borderRadius: 8 }}>
          <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Min / Max</div>
          <div style={{ color: '#d0c0ff', fontSize: '0.9em', fontWeight: 600 }}>
            <span style={{ color: '#22c55e' }}>R$ {min.toFixed(2)}</span> / <span style={{ color: '#ef4444' }}>R$ {max.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#7070a0', fontSize: '0.85em' }}>
          📉 Sem histórico ainda. Rode o sync do ML algumas vezes pra popular.
        </div>
      ) : (
        <>
          <div style={{ background: '#0a0a1a', padding: 16, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 100 }}>
              {history.map((h, i) => {
                const heightPct = ((h.preco - min) / range) * 80 + 10
                return (
                  <div key={i} title={`${(h.data || h.created_at || '').substring(0, 10)}: R$ ${h.preco.toFixed(2)}${h.motivo ? ' (' + h.motivo + ')' : ''}`}
                    style={{
                      flex: 1, height: `${heightPct}%`, maxWidth: 20,
                      background: h.preco === max ? '#ef4444' : h.preco === min ? '#22c55e' : '#a78bfa',
                      borderRadius: '2px 2px 0 0', minWidth: 4,
                    }}
                  />
                )
              })}
            </div>
            {history.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#7070a0', fontSize: '0.7em' }}>
                <span>{(history[0]?.data || history[0]?.created_at || '').substring(0, 10)}</span>
                <span>{(history[history.length - 1]?.data || history[history.length - 1]?.created_at || '').substring(0, 10)}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
            {history.slice(-15).reverse().map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#0a0a1a', borderRadius: 4, fontSize: '0.8em' }}>
                <span style={{ color: '#7070a0' }}>{new Date(h.data || h.created_at).toLocaleDateString('pt-BR')}</span>
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>R$ {h.preco.toFixed(2)}</span>
                <span style={{ color: '#7070a0', fontSize: '0.85em' }}>{h.motivo || 'Sync'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
