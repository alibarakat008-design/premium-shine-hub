'use client'

/**
 * =====================================================
 * PÁGINA: Marcas + Produtos (painel lateral)
 * Caminho: app/admin/marcas/page.tsx
 *
 * Clica na marca → abre painel lateral com todos os produtos
 * =====================================================
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

interface BrandAnalytics {
  id: string
  nome: string
  logo_url?: string
  total_produtos: number
  skus_listados: number
  produtos_anunciados?: number
  produtos_com_foto: number
  produtos_sem_foto: number
  total_vendas: number
  unidades_vendidas: number
  receita_total: number
  estoque_total: number
  capital_empatado: number
  sku_pct: number
  foto_pct: number
  completeness: number
}

interface Product {
  id: string
  sku: string
  ean: string | null
  nome: string
  volume: string | null
  foto_principal_url: string | null
  notas_top?: string | null
  notas_coracao?: string | null
  notas_fundo?: string | null
  ml_ids?: string[] | null
  brands: { id: string; nome: string } | null
  inventory: { quantidade_atual: number } | null
  product_prices?: { canal: string; preco_venda: number; custo?: string | number }[]
  marketplace_listings?: { preco_atual: number; vendas_total: number }[]
  tipo_produto?: string
  kit_of?: { id: string; nome: string }[]
  kit_components?: { id: string; nome: string; sku: string; qtd: number }[]
  vendas_total?: number
}

const FOTOS = Array.from({ length: 62 }, (_, i) => `/uploads/lab8/${i + 1}.jpg`)

export default function MarcasPage() {
  const [analytics, setAnalytics] = useState<BrandAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [newBrandOpen, setNewBrandOpen] = useState(false)
  const [newBrandForm, setNewBrandForm] = useState({ nome: '', descricao: '', logo_url: '' })
  const [saving, setSaving] = useState(false)
  const [authOk, setAuthOk] = useState(true)  // true = carrega brands direto via PAT
  const [isPartner, setIsPartner] = useState(false)  // default: admin (REMOVE visível)
  const [partnerCompanyId, setPartnerCompanyId] = useState<string | null>(null)

  // Painel de produtos
  const [painelOpen, setPainelOpen] = useState(false)
  const [painelBrand, setPainelBrand] = useState<BrandAnalytics | null>(null)
  const [painelProducts, setPainelProducts] = useState<Product[]>([])
  const [painelLoading, setPainelLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [announced, setAnnounced] = useState<Set<string>>(new Set())
  // Counts dinâmicos por marca (atualiza quando produtos carregam ou announced muda)
  const [brandCounts, setBrandCounts] = useState<Record<string, { announced: number; withPhoto: number }>>({})
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [editingBrandName, setEditingBrandName] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)
  const [kitFilter, setKitFilter] = useState<'todos' | 'unitarios' | 'kits'>('unitarios')
  const [sortBy, setSortBy] = useState<'nome' | 'vendas' | 'estoque' | 'nao_anunciados'>('nome')
  const [searchText, setSearchText] = useState('')
  const [editingKitId, setEditingKitId] = useState<string | null>(null)
  const [removeMode, setRemoveMode] = useState(false)
  const [selectedRemove, setSelectedRemove] = useState<Set<string>>(new Set())
  const [addMode, setAddMode] = useState(false)
  const [addStep, setAddStep] = useState<'link' | 'form'>('link')  // link → form
  const [addByLinkInput, setAddByLinkInput] = useState('')
  const [addByLinkLoading, setAddByLinkLoading] = useState(false)
  const [addByLinkError, setAddByLinkError] = useState('')
  const [newProduct, setNewProduct] = useState({
    sku: '', nome: '', volume: '', ean: '', foto_url: '',
    custo: '', preco_venda: '', notas_top: '', notas_coracao: '', notas_fundo: '',
  })
  const [savingNew, setSavingNew] = useState(false)
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null)

  // Brands carregam via PAT em admin — sem necessidade de partner detection
  // Se precisar detectar parceiro, usar: <AdminGate requirePartner> ou checar psh_session_role cookie

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = isPartner
        ? '/api/admin/brands?mode=analytics'
        : '/api/brands?analytics=true'
      const res = await fetch(url, {
        headers: isPartner ? { credentials: 'include' as const } : { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const data = await res.json()
      if (data.success || data.ok) {
        const list = data.data || data.marcas || []
        const sorted = [...list].sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''))
        setAnalytics(sorted)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isPartner])

  useEffect(() => { if (authOk) load() }, [authOk, load, isPartner])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  // Busca info do ML via MLBU/MLB/link
  async function fetchByMlLink() {
    const input = addByLinkInput.trim()
    if (!input) { setAddByLinkError('Cole um MLBU, MLB ou link do produto'); return }
    setAddByLinkLoading(true)
    setAddByLinkError('')
    try {
      // Extrai ID do link ou usa direto
      const idParam = input.includes('mercadoli') || input.includes('MLB')
        ? encodeURIComponent(input)
        : input
      const res = await fetch(`/api/ml/item-info?ml_id=${idParam}`, {
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const d = await res.json()
      if (!d.ok) { setAddByLinkError(d.error || 'Erro ao buscar'); setAddByLinkLoading(false); return }
      // Extrai volume do título (ex: "100ml", "50ml", "EDP 100ML")
      const volMatch = d.ml_title?.match(/(\d+)\s*[mM][lL]/i) || d.ml_title?.match(/(100|50|75|90)\s*[mM][lL]/i)
      const volume = volMatch ? volMatch[0] : ''
      // Monta SKU a partir do título limpo
      const skuBase = (d.sku || d.ml_title || '')
        .replace(/\s*\d+\s*[mM][lL]\s*/gi, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .toUpperCase()
        .substring(0, 50)
        .replace(/\s+/g, '-')
      const fullSku = `${painelBrand?.nome?.toUpperCase().substring(0, 6) || 'PROD'}-${skuBase}`
      // Tenta alta qualidade: thumbnail ML é -I.jpg (55px), troca pra -V.jpg (800px)
      const highResThumb = d.thumbnail
        ? d.thumbnail.replace(/-(\d{14})-I\.jpg$/, '-$1-V.jpg')
        : ''
      setNewProduct({
        sku: d.sku || fullSku,
        nome: d.ml_title || '',
        volume,
        ean: '',
        foto_url: highResThumb || d.thumbnail || '',
        custo: '',
        preco_venda: String(d.promo_price || d.price || ''),
        notas_top: '', notas_coracao: '', notas_fundo: '',
      })
      setAddStep('form')
      setAddByLinkLoading(false)
    } catch (e: any) {
      setAddByLinkError('Erro de conexão: ' + (e.message || ''))
      setAddByLinkLoading(false)
    }
  }

  async function abrirPainel(brand: BrandAnalytics) {
    setPainelBrand(brand)
    setPainelOpen(true)
    setPainelLoading(true)
    try {
      let data
      if (isPartner) {
        // Parceiro: usa endpoint cookie-aware
        const res = await fetch(`/api/admin/catalogo-produtos?mode=produtos-all`, {
          headers: { credentials: 'include' as const },
        })
        data = await res.json()
        if (data.ok) {
          // Filtra só os produtos desta marca e transforma campos pro formato esperado
          const prods = (data.produtos || [])
            .filter((p: any) => p.marca_id === brand.id)
            .map((p: any) => ({
              id: p.product_id,
              sku: p.sku || '',
              ean: p.ean || null,
              nome: p.nome || '',
              volume: p.volume || null,
              foto_principal_url: p.foto || null,
              notas_top: null,
              notas_coracao: null,
              notas_fundo: null,
              ml_ids: p.link_ml ? [p.link_ml] : null,
              brands: { id: p.marca_id, nome: p.marca_nome },
              inventory: { quantidade_atual: p.estoque || 0 },
              product_prices: p.custo != null ? [{ canal: 'mercado_livre', preco_venda: p.preco_venda || 0, custo: p.custo }] : [],
              marketplace_listings: p.anunciado ? [{ preco_atual: p.preco_venda || 0, vendas_total: 0 }] : [],
            }))
          setPainelProducts(prods)
        }
      } else {
        const res = await fetch(`/api/admin/produtos-fotos?brand_id=${brand.id}&limit=500`, {
          headers: {
            Authorization: 'Basic ' + btoa('premium:shine2026'),
            'Cache-Control': 'no-cache',
          },
        })
        data = await res.json()
        if (data.ok) {
          const prods = data.products || []
          setPainelProducts(prods)
          // Atualiza counts dinâmicos da marca
          if (painelBrand) {
            setBrandCounts(prev => ({
              ...prev,
              [painelBrand.id]: {
                announced: prods.filter(p => p.ml_ids && p.ml_ids.length > 0).length,
                withPhoto: prods.filter(p => p.foto_principal_url).length,
              },
            }))
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setPainelLoading(false)
    }
  }

  function fecharPainel() {
    setPainelOpen(false)
    setPainelBrand(null)
    setPainelProducts([])
    setEditingBrandId(null)
    setAddMode(false)
    setAddStep('link')
    setAddByLinkInput('')
  }

  async function salvarBrand(brandId: string) {
    setSavingBrand(true)
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ brand_id: brandId, nome: editingBrandName }),
      })
      const d = await res.json()
      if (d.success) {
        setAnalytics(prev => prev.map(b => b.id === brandId ? { ...b, nome: d.data.nome } : b))
        if (painelBrand?.id === brandId) setPainelBrand(prev => prev ? { ...prev, nome: d.data.nome } : prev)
        setEditingBrandId(null)
        showToast('✅ Marca atualizada!')
      } else {
        showToast(`❌ ${d.error}`)
      }
    } catch {
      showToast('❌ Erro ao salvar')
    } finally {
      setSavingBrand(false)
    }
  }

  function startEditBrand(brand: BrandAnalytics) {
    setEditingBrandId(brand.id)
    setEditingBrandName(brand.nome || '')
  }

  async function salvarMlId(productId: string, mlIds: string[]) {
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ product_id: productId, ml_ids: mlIds }),
      })
      const d = await res.json()
      if (d.success) {
        // Mantém TODOS os dados existentes — só atualiza ml_ids
        setPainelProducts(prev => prev.map(p => p.id === productId ? { ...p, ml_ids: d.data?.ml_ids ?? mlIds } : p))
      }
    } catch { /* silent */ }
  }

  function updatePainelProduct(productId: string, updates: Partial<Product>) {
    // Atualiza local state imediatamente
    setPainelProducts(prev => prev.map(p => {
      if (p.id !== productId) return p
      const updated = { ...p, ...updates }
      // Estoque
      if ('_ml_stock' in updates) {
        updated.inventory = { quantidade_atual: (updates as any)._ml_stock }
      }
      // Preço — faz MERGE, não substitui (preserva custo e outros campos)
      if ('_ml_price' in updates && (updates as any)._ml_price !== undefined) {
        const existingPrices = p.product_prices || []
        const newPrice = (updates as any)._ml_price
        // Atualiza só o canal ML, preserva custo e outros canais
        const existingMlPrice = existingPrices.find((pr: any) => pr.canal === 'mercado_livre')
        if (existingMlPrice) {
          // Merge: preserva custo, só atualiza preco_venda
          updated.product_prices = existingPrices.map((pr: any) =>
            pr.canal === 'mercado_livre' ? { ...pr, preco_venda: newPrice } : pr
          )
        } else {
          // Não existia canal ML — adiciona
          updated.product_prices = [...existingPrices, { canal: 'mercado_livre', preco_venda: newPrice }]
        }
      }
      // Foto
      if ((updates as any).foto_principal_url !== undefined) {
        updated.foto_principal_url = (updates as any).foto_principal_url
      }
      return updated
    }))

    // Persiste no banco de forma assíncrona
    const prod = painelProducts.find(p => p.id === productId)
    if (!prod) return

    if ('ean' in updates && updates.ean !== undefined) {
      // Atualiza EAN via exec-sql
      const eanVal = updates.ean || null
      fetch('/api/admin/exec-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({
          secret: 'LUXO2026',
          sql: `UPDATE products SET ean = ${eanVal ? `'${String(eanVal).replace(/'/g, "''")}'` : 'NULL'}, updated_at = NOW() WHERE id = '${productId}'`,
          action: 'write',
        }),
      })
    }

    if ('sku' in updates && updates.sku !== undefined) {
      // Atualiza SKU via exec-sql
      fetch('/api/admin/exec-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({
          secret: 'LUXO2026',
          sql: `UPDATE products SET sku = '${String(updates.sku).replace(/'/g, "''")}', updated_at = NOW() WHERE id = '${productId}'`,
          action: 'write',
        }),
      })
    }

    if ('_ml_stock' in updates && (updates as any)._ml_stock !== undefined) {
      const stock = (updates as any)._ml_stock
      // Upsert inventory
      fetch('/api/admin/exec-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({
          secret: 'LUXO2026',
          sql: `INSERT INTO inventory (product_id, quantidade_atual, updated_at)
                VALUES ('${productId}', ${stock}, NOW())
                ON CONFLICT (product_id) DO UPDATE SET quantidade_atual = ${stock}, updated_at = NOW()`,
          action: 'write',
        }),
      })
    }

    if ('_ml_price' in updates && (updates as any)._ml_price !== undefined) {
      const price = (updates as any)._ml_price
      const companyId = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
      fetch('/api/admin/exec-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({
          secret: 'LUXO2026',
          sql: `INSERT INTO product_prices (product_id, canal, company_id, preco_venda, updated_at)
                VALUES ('${productId}', 'mercado_livre', '${companyId}', ${price}, NOW())
                ON CONFLICT (product_id, canal, company_id) DO UPDATE SET preco_venda = ${price}, updated_at = NOW()`,
          action: 'write',
        }),
      })
    }
  }

  async function salvarFoto(product: Product, url: string) {
    try {
      const res = await fetch('/api/admin/produtos-fotos', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + btoa('premium:shine2026'),
        },
        body: JSON.stringify({ updates: [{ id: product.id, foto_principal_url: url }] }),
      })
      const d = await res.json()
      if (d.ok) {
        setPainelProducts(prev => prev.map(p =>
          p.id === product.id ? { ...p, foto_principal_url: url } : p
        ))
        showToast(`✅ ${product.nome}`)
      } else {
        showToast(`❌ ${d.error || 'Erro ao salvar foto'}`)
      }
    } catch (e) {
      showToast('❌ Erro ao salvar')
    }
  }

  async function uploadFile(file: File, product: Product) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'produtos')
    try {
      const res = await fetch('/api/upload/photo', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        await salvarFoto(product, data.data.url)
      } else {
        showToast(`❌ ${data.error || 'Erro no upload'}`)
      }
    } catch (e: any) {
      showToast(`❌ Erro no upload: ${e?.message || e?.toString() || 'sem detalhes'}`)
    }
  }

  async function salvarNovaMarca() {
    if (!newBrandForm.nome.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify(newBrandForm),
      })
      const j = await res.json()
      if (j.success) {
        setNewBrandOpen(false)
        setNewBrandForm({ nome: '', descricao: '', logo_url: '' })
        load()
        showToast('✅ Marca criada!')
      } else {
        showToast(`❌ ${j.error}`)
      }
    } catch (e) {
      showToast('❌ Erro')
    } finally {
      setSaving(false)
    }
  }

  function copySku(sku: string) {
    navigator.clipboard.writeText(sku)
    showToast(`📋 ${sku}`)
  }

  // Kit: marcar produto como kit
  async function toggleKit(productId: string, isKit: boolean) {
    try {
      const res = await fetch('/api/admin/kit-produtos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ product_id: productId, tipo_produto: isKit ? 'kit' : 'unitario' }),
      })
      const d = await res.json()
      if (d.ok) {
        setPainelProducts(prev => prev.map(p => p.id === productId ? { ...p, tipo_produto: isKit ? 'kit' : 'unitario' } : p))
        if (isKit) {
          setEditingKitId(productId)
          showToast('🧩 Kit criado! Agora adicione os produtos.')
        } else {
          showToast('🔗 Voltou a ser produto unitário')
        }
      }
    } catch { showToast('❌ Erro ao atualizar') }
  }

  // Kit: salvar composicao
  async function salvarKitComposition(kitId: string, components: { id: string; nome: string; sku: string; qtd: number }[]) {
    try {
      const res = await fetch('/api/admin/kit-produtos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ kit_id: kitId, components: components.map(c => ({ component_product_id: c.id, quantidade: c.qtd })) }),
      })
      const d = await res.json()
      if (d.ok) {
        setPainelProducts(prev => prev.map(p => p.id === kitId ? { ...p, kit_components: components } : p))
        showToast(`✅ Kit atualizado com ${components.length} produto(s)`)
      } else {
        showToast('❌ ' + (d.error || 'Erro'))
      }
    } catch { showToast('❌ Erro ao salvar kit') }
  }

  if (!authOk || loading) {
    return (
      <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        ⏳ Carregando marcas...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>

      {/* HEADER */}
      <div style={{ maxWidth: 1400, margin: '0 auto', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>🏷️ Marcas</h1>
            <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>
              {analytics.length} marcas · clique na marca para ver produtos
            </p>
          </div>
          <button
            onClick={() => setNewBrandOpen(true)}
            style={{ padding: '10px 20px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            ➕ Nova Marca
          </button>
        </div>
      </div>

      {/* GRID DE MARCAS */}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {analytics.map((brand) => {
            return (
              <div key={brand.id}
                onClick={(e) => { e.preventDefault(); abrirPainel(brand) }}
                style={{
                  background: '#12122a', border: '1px solid #2a2a4a',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a4a')}
              >
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt={brand.nome} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4em', fontWeight: 700, color: '#000', flexShrink: 0 }}>
                        {brand.nome.charAt(0)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                        {brand.nome}
                      </div>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>
                        {brand.total_produtos} produtos
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: '#7070a0' }}>→</div>
                  </div>

                  {/* SKUs + Fotos na mesma linha */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '0.78em', marginBottom: 4 }}>
                    <div style={{ background: '#0d0d22', borderRadius: 6, padding: '6px 8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ color: '#7070a0', fontSize: '0.7em' }}>📢 Anúncios</span>
                        <span style={{ color: brand.sku_pct === 100 ? '#22c55e' : brand.sku_pct > 50 ? '#a78bfa' : '#f59e0b', fontWeight: 700, fontSize: '0.8em' }}>{brand.sku_pct}%</span>
                      </div>
                      <div style={{ color: '#d0c0ff', fontWeight: 700 }}>
                        {(brandCounts[brand.id]?.announced ?? brand.produtos_anunciados ?? 0)}<span style={{ color: '#4a4a6a', fontWeight: 400 }}>/{brand.total_produtos}</span>
                      </div>
                      <div style={{ marginTop: 4, height: 3, background: '#1a1a3a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${brand.total_produtos > 0 ? Math.round(((brandCounts[brand.id]?.announced ?? brand.produtos_anunciados ?? 0) / brand.total_produtos) * 100) : 0}%`, height: '100%',
                          background: '#a78bfa',
                          borderRadius: 2, transition: 'width 0.3s',
                        }} />
                      </div>
                    </div>

                    <div style={{ background: '#0d0d22', borderRadius: 6, padding: '6px 8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ color: '#7070a0', fontSize: '0.7em' }}>📷 Fotos</span>
                        <span style={{ color: brand.foto_pct === 100 ? '#22c55e' : brand.foto_pct > 50 ? '#a78bfa' : '#f59e0b', fontWeight: 700, fontSize: '0.8em' }}>{brand.foto_pct}%</span>
                      </div>
                      <div style={{ color: '#d0c0ff', fontWeight: 700 }}>
                        {(brandCounts[brand.id]?.withPhoto ?? brand.produtos_com_foto)}<span style={{ color: '#4a4a6a', fontWeight: 400 }}>/{brand.total_produtos}</span>
                      </div>
                      <div style={{ marginTop: 4, height: 3, background: '#1a1a3a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${brand.foto_pct}%`, height: '100%',
                          background: brand.foto_pct === 100 ? '#22c55e' : brand.foto_pct > 50 ? '#a78bfa' : '#f59e0b',
                          borderRadius: 2, transition: 'width 0.3s',
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Estoque + Capital */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, fontSize: '0.78em' }}>
                    <div><span style={{ color: '#7070a0' }}>📦 Estoque</span><br /><span style={{ color: '#60a5fa', fontWeight: 600 }}>{(brand.estoque_total ?? 0).toLocaleString('pt-BR')}</span></div>
                    <div><span style={{ color: '#7070a0' }}>💰 Capital</span><br /><span style={{ color: '#eab308', fontWeight: 600 }}>R$ {Number(brand.capital_empatado ?? 0) >= 1000 ? (Number(brand.capital_empatado ?? 0) / 1000).toFixed(0) + 'k' : Number(brand.capital_empatado ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span></div>
                  </div>

                  {/* Barra de completeness */}
                  <div style={{ marginTop: 8, height: 4, background: '#0a0a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${brand.completeness}%`, height: '100%',
                      background: brand.completeness === 100
                        ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                        : brand.completeness > 50
                          ? 'linear-gradient(90deg, #a78bfa, #6366f1)'
                          : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                      borderRadius: 2, transition: 'width 0.4s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65em', marginTop: 2 }}>
                    <span style={{ color: '#3a3a5a' }}>completude {brand.completeness}%</span>
                    <span style={{ color: '#22c55e' }}>R$ {Number(brand.receita_total ?? 0) >= 1000 ? (Number(brand.receita_total ?? 0) / 1000).toFixed(0) + 'k' : Number(brand.receita_total ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} receita</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', background: toast.startsWith('❌') ? '#ef4444' : '#1f2937',
          color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* MODAL NOVA MARCA */}
      {newBrandOpen && (
        <>
          <div onClick={() => setNewBrandOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24,
            maxWidth: 480, width: '95vw', zIndex: 1001,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ color: '#a78bfa', margin: 0 }}>➕ Nova Marca</h2>
              <button onClick={() => setNewBrandOpen(false)} style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Nome *</label>
                <input value={newBrandForm.nome} onChange={e => setNewBrandForm(f => ({ ...f, nome: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Descrição</label>
                <input value={newBrandForm.descricao} onChange={e => setNewBrandForm(f => ({ ...f, descricao: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>URL Logo</label>
                <input value={newBrandForm.logo_url} onChange={e => setNewBrandForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }} />
              </div>
            </div>
            <button onClick={salvarNovaMarca} disabled={saving || !newBrandForm.nome.trim()}
              style={{ marginTop: 16, width: '100%', padding: 12, background: saving ? '#4a4a7a' : '#22c55e', border: 'none', color: '#000', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {saving ? 'Salvando...' : '💾 Salvar Marca'}
            </button>
          </div>
        </>
      )}

      {/* PAINEL DE PRODUTOS — SOBREPOE A PÁGINA */}
      {painelOpen && (
        <>
          <div
            onClick={fecharPainel}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 900,
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Painel — GUIDA que cobre TUDO */}
          <div
            style={{
              position: 'fixed', inset: 0,
              background: '#0a0a1a',
              zIndex: 901,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 0 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header com borda colorida no topo */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #2a2a4a',
              borderTop: '4px solid #a78bfa',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
              background: '#0f0f22',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🛍️</span>
                  {editingBrandId === painelBrand?.id ? (
                    <>
                      <input
                        value={editingBrandName}
                        onChange={e => setEditingBrandName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') salvarBrand(painelBrand!.id) }}
                        autoFocus
                        style={{
                          background: '#1a1a2e', border: '1px solid #a78bfa', color: '#d0c0ff',
                          borderRadius: 6, padding: '2px 8px', fontSize: '1em', fontWeight: 700,
                          textTransform: 'uppercase', maxWidth: 260,
                        }}
                      />
                      <button onClick={() => salvarBrand(painelBrand!.id)} disabled={savingBrand}
                        style={{ background: '#22c55e', border: 'none', borderRadius: 6, padding: '3px 10px', color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        {savingBrand ? '...' : '✓'}
                      </button>
                      <button onClick={() => setEditingBrandId(null)}
                        style={{ background: '#374151', border: 'none', borderRadius: 6, padding: '3px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>
                        {painelBrand?.nome}
                      </h2>
                      {!isPartner && (
                        <button onClick={() => startEditBrand(painelBrand!)} title="Editar nome"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: '#7070a0', padding: '2px 4px', borderRadius: 4 }}>
                          ✏️
                        </button>
                      )}
                    </>
                  )}
                </div>
                <p style={{ color: '#7070a0', fontSize: '0.75em', margin: '2px 0 0' }}>
                  {painelProducts.length} produtos
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setAddMode(v => !v); if (addMode) { setNewProduct({ sku: '', nome: '', volume: '', ean: '', foto_url: '', custo: '', preco_venda: '', notas_top: '', notas_coracao: '', notas_fundo: '' }); setAddStep('link'); setAddByLinkInput('') } else { setAddStep('link') } }}
                  style={{ padding: '8px 16px', background: addMode ? '#22c55e' : '#22c55e', border: 'none', borderRadius: 8, color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {addMode ? '✕ CANCELAR' : '➕ ADD'}
                </button>
                {!isPartner && (
                  <>
                    <button
                      onClick={() => { setRemoveMode(v => !v); setSelectedRemove(new Set()) }}
                      style={{ padding: '8px 16px', background: removeMode ? '#ef4444' : '#f59e0b', border: 'none', borderRadius: 8, color: removeMode ? '#fff' : '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {removeMode ? '✕ CANCELAR' : '🗑️ REMOVE'}
                    </button>
                    {removeMode && selectedRemove.size > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Remover ${selectedRemove.size} produto(s) selecionado(s)? ISSO NÃO PODE SER DESFEITO.`)) return
                      const toRemove = Array.from(selectedRemove)
                      setSaving(true)
                      try {
                        const res = await fetch(`/api/admin/remove-produto?ids=${toRemove.join(',')}`, {
                          method: 'DELETE',
                          headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
                        })
                        const json = await res.json()
                        if (res.ok && json.ok !== false) {
                          setPainelProducts(prev => prev.filter(p => !selectedRemove.has(p.id)))
                          setSelectedRemove(new Set())
                          setRemoveMode(false)
                          showToast(`✅ ${json.deleted ?? toRemove.length} produto(s) removido(s)`)
                        } else {
                          showToast(`❌ ${json?.error || 'Erro ao remover'}`)
                          setSelectedRemove(new Set())
                          setRemoveMode(false)
                        }
                      } catch (err) {
                        console.error('[remove] erro de rede', err)
                        showToast(`❌ Erro de rede`)
                        setSelectedRemove(new Set())
                        setRemoveMode(false)
                      } finally {
                        setSaving(false)
                      }
                    }}
                    disabled={saving}
                    style={{ padding: '8px 16px', background: saving ? '#9ca3af' : '#dc2626', border: 'none', borderRadius: 8, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                    {saving ? '⏳ REMOVENDO...' : `✅ CONFIRMAR (${selectedRemove.size})`}
                  </button>
                    )}
                  </>
                )}
                <button onClick={fecharPainel}
                  style={{ padding: '8px 16px', background: '#374151', border: 'none', borderRadius: 8, color: '#d0c0ff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  ✕ Fechar
                </button>
              </div>
            </div>

            {/* Grid de produtos */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {painelLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳ Carregando produtos...</div>
              ) : painelProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>Nenhum produto nesta marca.</div>
              ) : (
                <>
                  {/* Barra de controles: filtros + busca + ordenacao */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Filtro Unitarios / Todos */}
                    {(['unitarios', 'todos'] as const).map(f => {
                      const count = f === 'todos' ? painelProducts.length
                        : painelProducts.filter(p => p.tipo_produto !== 'kit').length
                      return (
                        <button key={f} onClick={() => setKitFilter(f)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
                            background: kitFilter === f ? '#6366f1' : '#1a1a2e',
                            color: kitFilter === f ? '#fff' : '#7070a0',
                            boxShadow: kitFilter === f ? '0 2px 8px rgba(99,102,241,0.4)' : 'none',
                            whiteSpace: 'nowrap',
                          }}>
                          {f === 'todos' ? '📦 Todos' : '🔗 Unitários'} ({count})
                        </button>
                      )
                    })}

                    <div style={{ width: 1, height: 20, background: '#2a2a4a', margin: '0 4px' }} />

                    {/* Ordenacao */}
                    {([
                      { key: 'nome' as const, label: '🔤 Nome' },
                      { key: 'vendas' as const, label: '📈 +Vendidos' },
                      { key: 'estoque' as const, label: '📦 Estoque' },
                      { key: 'nao_anunciados' as const, label: '🚫 Não Anunc.' },
                    ]).map(s => {
                      const count = s.key === 'nao_anunciados'
                        ? painelProducts.filter(p => !p.ml_ids?.length && p.tipo_produto !== 'kit').length
                        : null
                      return (
                        <button key={s.key} onClick={() => setSortBy(s.key)}
                          style={{
                            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
                            background: sortBy === s.key ? '#22c55e' : '#1a1a2e',
                            color: sortBy === s.key ? '#000' : '#7070a0',
                            boxShadow: sortBy === s.key ? '0 2px 8px rgba(34,197,94,0.3)' : 'none',
                            whiteSpace: 'nowrap',
                          }}>
                          {s.label}{count !== null ? ` (${count})` : ''}
                        </button>
                      )
                    })}

                    {/* Busca */}
                    <input
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="Buscar produto..."
                      style={{
                        flex: 1, minWidth: 140, padding: '6px 12px',
                        background: '#1a1a2e', border: '1px solid #2a2a4a',
                        borderRadius: 8, color: '#d0c0ff', fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
                    {removeMode && (
                      <div style={{
                        gridColumn: '1 / -1',
                        background: 'rgba(239,68,68,0.15)',
                        border: '2px solid #ef4444',
                        borderRadius: 10,
                        padding: '10px 16px',
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        justifyContent: 'space-between',
                      }}>
                        <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>
                          🗑️ Modo REMOVE — clique nos cards para selecionar
                        </span>
                        <span style={{ color: '#fca5a5', fontSize: 11 }}>
                          {selectedRemove.size} selecionado(s)
                        </span>
                      </div>
                    )}
                    {addMode && (
                      addStep === 'link' ? (
                        // STEP 1: Colar link/MLBU
                        <div style={{
                          gridColumn: '1 / -1',
                          background: '#0f0f22',
                          border: '2px solid #22c55e',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>🔗 ADICIONAR POR LINK ML</span>
                            <button onClick={() => { setAddMode(false); setAddStep('link'); setAddByLinkInput('') }}
                              style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 16 }}>✕</button>
                          </div>
                          <p style={{ fontSize: 10, color: '#7070a0', margin: 0 }}>
                            Cole o <b style={{ color: '#d0c0ff' }}>MLB</b>, <b style={{ color: '#d0c0ff' }}>MLBU</b> ou <b style={{ color: '#d0c0ff' }}>link completo</b> do produto no Mercado Livre
                          </p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={addByLinkInput}
                              onChange={e => { setAddByLinkInput(e.target.value); setAddByLinkError('') }}
                              onKeyDown={e => { if (e.key === 'Enter') fetchByMlLink() }}
                              placeholder="Ex: MLBU4485208782  ou  https://produto.mercadolivre.com.br/MLB..."
                              style={{
                                flex: 1, padding: '8px 12px', background: '#1a1a2e', border: `1px solid ${addByLinkError ? '#ef4444' : '#2a2a4a'}`,
                                borderRadius: 8, color: '#e2e8f0', fontSize: 11,
                              }}
                            />
                            <button
                              onClick={fetchByMlLink}
                              disabled={addByLinkLoading}
                              style={{
                                padding: '8px 16px', background: addByLinkLoading ? '#4a4a7a' : '#22c55e',
                                border: 'none', borderRadius: 8, color: '#000', cursor: addByLinkLoading ? 'not-allowed' : 'pointer',
                                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                              }}>
                              {addByLinkLoading ? '⏳ Buscando...' : '🔍 BUSCAR'}
                            </button>
                          </div>
                          {addByLinkError && (
                            <div style={{ fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 6, padding: '6px 10px' }}>
                              ❌ {addByLinkError}
                            </div>
                          )}
                          {/* Ou preencher manualmente */}
                          <button
                            onClick={() => setAddStep('form')}
                            style={{ background: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, textDecoration: 'underline' }}>
                            ✏️ Prefill manual (sem buscar no ML)
                          </button>
                        </div>
                      ) : (
                        // STEP 2: Formulário pré-preenchido
                        <AddProductCard
                          form={newProduct}
                          onChange={(k, v) => setNewProduct(prev => ({ ...prev, [k]: v }))}
                          onSave={async () => {
                            if (!newProduct.sku || !newProduct.nome) { showToast('⚠️ SKU e Nome são obrigatórios'); return }
                            setSavingNew(true)
                            try {
                              const res = await fetch('/api/admin/add-produto', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
                                body: JSON.stringify({
                                  ...newProduct,
                                  marca_id: painelBrand!.id,
                                  custo: newProduct.custo ? parseFloat(newProduct.custo) : undefined,
                                  preco_venda: newProduct.preco_venda ? parseFloat(newProduct.preco_venda) : undefined,
                                }),
                              })
                              const d = await res.json()
                              if (d.ok) {
                                const created = d.product
                                setPainelProducts(prev => [{
                                  id: created.id || created.id,
                                  sku: newProduct.sku,
                                  nome: newProduct.nome,
                                  volume: newProduct.volume || null,
                                  ean: newProduct.ean || null,
                                  foto_principal_url: newProduct.foto_url || null,
                                  notas_top: newProduct.notas_top || null,
                                  notas_coracao: newProduct.notas_coracao || null,
                                  notas_fundo: newProduct.notas_fundo || null,
                                  ml_ids: null,
                                  brands: painelBrand ? { id: painelBrand.id, nome: painelBrand.nome } : null,
                                  inventory: { quantidade_atual: 0 },
                                  tipo_produto: 'unitario',
                                  vendas_total: 0,
                                } as Product, ...prev])
                                setAddMode(false)
                                setAddStep('link')
                                setAddByLinkInput('')
                                setNewProduct({ sku: '', nome: '', volume: '', ean: '', foto_url: '', custo: '', preco_venda: '', notas_top: '', notas_coracao: '', notas_fundo: '' })
                                showToast('✅ Produto adicionado!')
                              } else {
                                showToast('❌ ' + (d.error || 'Erro'))
                              }
                            } catch { showToast('❌ Erro de conexão') }
                            finally { setSavingNew(false) }
                          }}
                          onCancel={() => { setAddMode(false); setAddStep('link'); setAddByLinkInput(''); setNewProduct({ sku: '', nome: '', volume: '', ean: '', foto_url: '', custo: '', preco_venda: '', notas_top: '', notas_coracao: '', notas_fundo: '' }) }}
                          saving={savingNew}
                        />
                      )
                    )}
                    {painelProducts
                      .filter(p => {
                        if (kitFilter === 'kits' && p.tipo_produto !== 'kit') return false
                        if (kitFilter === 'unitarios' && p.tipo_produto === 'kit') return false
                        if (searchText) {
                          const q = searchText.toLowerCase()
                          if (!p.nome.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
                        }
                        if (sortBy === 'nao_anunciados') {
                          if (p.ml_ids?.length || p.tipo_produto === 'kit') return false
                        }
                        return true
                      })
                      .sort((a, b) => {
                        if (sortBy === 'vendas') return (b.vendas_total || 0) - (a.vendas_total || 0)
                        if (sortBy === 'estoque') return (b.inventory?.quantidade_atual ?? 0) - (a.inventory?.quantidade_atual ?? 0)
                        return a.nome.localeCompare(b.nome)
                      })
                      .map((p: Product) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          adolescent={announced.has(p.id)}
                          removeMode={removeMode}
                          selectedRemove={selectedRemove.has(p.id)}
                          onToggleAnunciado={(id) => {
                            let isAdding = false
                            setAnnounced(prev => {
                              isAdding = !prev.has(id)  // true = adicionando, false = removendo
                              const next = new Set(prev)
                              if (next.has(id)) next.delete(id); else next.add(id)
                              return next
                            })
                            // Salva no banco imediatamente ao MARCAR (não precisa do "Salvar Notas")
                            if (isAdding) {
                              const product = painelProducts.find(p => p.id === id)
                              if (product && (!product.ml_ids || product.ml_ids.length === 0)) {
                                salvarMlId(id, ['PENDENTE'])
                              }
                            }
                            // Atualiza count dinâmico da marca aberta
                            if (painelBrand) {
                              setBrandCounts(prev => {
                                const prods = painelProducts
                                // Conta: produtos com ml_ids no DB + os que estão no announced set
                                const announcedSet = new Set(prods.filter(p => p.ml_ids && p.ml_ids.length > 0).map(p => p.id))
                                // Adiciona os que estão no announced local
                                announced.forEach(aid => announcedSet.add(aid))
                                if (isAdding) announcedSet.add(id); else announcedSet.delete(id)
                                return {
                                  ...prev,
                                  [painelBrand.id]: {
                                    announced: announcedSet.size,
                                    withPhoto: prev[painelBrand.id]?.withPhoto ?? 0,
                                  },
                                }
                              })
                            }
                          }}
                          onToggleRemove={(id) => {
                            setSelectedRemove(prev => {
                              const next = new Set(prev)
                              if (next.has(id)) next.delete(id); else next.add(id)
                              return next
                            })
                          }}
                          onCopySku={copySku}
                          onUpload={(file) => uploadFile(file, p)}
                          onShowToast={showToast}
                          onSaveMlId={salvarMlId}
                          onUpdateProduct={updatePainelProduct}
                          onToggleKit={isPartner ? undefined : ((id: string, isKit: boolean) => toggleKit(id, isKit))}
                          onOpenKit={isPartner ? undefined : ((id: string) => setEditingKitId(id))}
                          onOpenKitsOf={isPartner ? undefined : ((id: string) => {
                            const prod = painelProducts.find(p => p.id === id)
                            if (prod?.kit_of?.length) setEditingKitId(prod.kit_of![0].id)
                          })}
                          onSavePhoto={(productId, url) => salvarFoto(painelProducts.find(p => p.id === productId)!, url)}
                          onOpenDrawer={setDrawerProduct}
                          companyId={isPartner ? (partnerCompanyId || MATRIZ_COMPANY_ID) : MATRIZ_COMPANY_ID}
                          isPartner={isPartner}
                        />
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Barra de rodapé */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #2a2a4a',
              background: '#0f0f22',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0,
            }}>
              <span style={{ color: '#4a4a7a', fontSize: 11 }}>🛍️ {painelBrand?.nome}</span>
              <button
                onClick={fecharPainel}
                style={{
                  padding: '10px 28px',
                  background: '#a78bfa',
                  border: 'none',
                  borderRadius: 8,
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ✕ Voltar para Marcas
              </button>
            </div>
          </div>
        </>
      )}

      {/* MODAL GALERIA */}
      {galeriaOpen && selectedProduct && (
        <GaleriaModal
          product={selectedProduct}
          onClose={() => { setGaleriaOpen(false); setSelectedProduct(null) }}
          onSave={(url) => { salvarFoto(selectedProduct, url); setGaleriaOpen(false); setSelectedProduct(null) }}
          onUpload={(file) => { uploadFile(file, selectedProduct); setGaleriaOpen(false); setSelectedProduct(null) }}
        />
      )}

      {/* MODAL EDITOR DE KIT */}
      {editingKitId && (
        <KitEditorModal
          kitId={editingKitId}
          products={painelProducts}
          onClose={() => setEditingKitId(null)}
          onSave={(components) => salvarKitComposition(editingKitId, components)}
          onShowToast={showToast}
          onToggleKit={toggleKit}
        />
      )}

    {/* SIDE DRAWER — SEMPRE no topo (depois do overlay, zIndex 2000) */}
    {drawerProduct && (
      <ProductSideDrawer
        product={drawerProduct}
        onClose={() => setDrawerProduct(null)}
        onUpdateProduct={updatePainelProduct}
        onShowToast={showToast}
        isPartner={isPartner}
      />
    )}
    </div>
  )
}

// =====================================================
// CARD DE PRODUTO (expandível)
// =====================================================
// LIURA matriz — usada pra identificar a conta ML correta
const MATRIZ_COMPANY_ID = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

function ProductCard({ product, adolescent, removeMode, selectedRemove, onToggleAnunciado, onToggleRemove, onCopySku, onUpload, onShowToast, onSaveMlId, onUpdateProduct, onToggleKit, onOpenKit, onOpenKitsOf, onSavePhoto, onOpenDrawer, companyId, isPartner }: {
  product: Product
  adolescent: boolean
  removeMode: boolean
  selectedRemove: boolean
  onToggleAnunciado: (id: string) => void
  onToggleRemove: (id: string) => void
  onCopySku: (sku: string) => void
  onUpload: (file: File) => void
  onShowToast: (msg: string) => void
  onSaveMlId: (productId: string, mlIds: string[]) => void
  onUpdateProduct: (productId: string, updates: Partial<Product>) => void
  onToggleKit?: (id: string, isKit: boolean) => void
  onOpenKit?: (id: string) => void
  onOpenKitsOf?: (id: string) => void
  onSavePhoto?: (productId: string, url: string) => void
  onOpenDrawer?: (product: Product) => void
  companyId?: string
  isPartner: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [localNotas, setLocalNotas] = useState({
    top: product.notas_top || '',
    coracao: product.notas_coracao || '',
    fundo: product.notas_fundo || '',
  })
  // Supabase pode retornar jsonb como string ou array — normaliza sempre
  const normalizeMlIds = (raw: any): string[] => {
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (typeof raw === 'string') {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(Boolean) : [] }
      catch { return [] }
    }
    return []
  }
  const [localMlIds, setLocalMlIds] = useState<string[]>(normalizeMlIds(product.ml_ids))
  const [editingName, setEditingName] = useState(false)
  const [localName, setLocalName] = useState(product.nome)
  const [mlFetching, setMlFetching] = useState<number | null>(null)
  const [mlFetched, setMlFetched] = useState<Record<string, {
    sku?: string; price?: number; base_price?: number; original_price?: number;
    stock?: number; title?: string; thumbnail?: string;
    promo_price?: number | null; promo_name?: string | null;
    height?: number | null; width?: number | null; length?: number | null; weight?: number | null;
  }>>({})
  const [notesOpen, setNotesOpen] = useState(true)
  const [mlAdsOpen, setMlAdsOpen] = useState(true)
  const [dimensionsOpen, setDimensionsOpen] = useState(false)
  const [comprasOpen, setComprasOpen] = useState(false)
  const [comprasLoading, setComprasLoading] = useState(false)
  const [comprasList, setComprasList] = useState<any[]>([])
  const [localDims, setLocalDims] = useState({
    height: '',
    width: '',
    length: '',
    weight: '',
  })

  // Sync dimensions from ML when first fetched
  useEffect(() => {
    if (mlFetched[0]) {
      setLocalDims(prev => ({
        height: prev.height || String(mlFetched[0].height ?? ''),
        width: prev.width || String(mlFetched[0].width ?? ''),
        length: prev.length || String(mlFetched[0].length ?? ''),
        weight: prev.weight || String(mlFetched[0].weight ?? ''),
      }))
    }
  }, [mlFetched[0]?.height])

  // Sync localName when product.nome changes from parent
  useEffect(() => { setLocalName(product.nome) }, [product.nome])

  const estoque = product.inventory?.quantidade_atual ?? 0
  const custoRaw = product.product_prices?.[0]?.custo
  const custoFmt = custoRaw != null ? 'R$ ' + (Number(custoRaw) ?? 0).toFixed(2).replace('.', ',') : '—'
  // Preço de venda ML
  const precoVendaRaw = product.product_prices?.find(p => p.canal === 'mercado_livre')?.preco_venda
  const precoVendaFmt = precoVendaRaw != null ? 'R$ ' + (Number(precoVendaRaw) ?? 0).toFixed(2).replace('.', ',') : '—'
  // Preço original do ML (se em promoção)
  const mlOrigPrice = mlFetched[0]?.original_price && mlFetched[0]?.original_price !== mlFetched[0]?.price
    ? mlFetched[0]?.original_price : null
  const mlOrigFmt = mlOrigPrice != null ? 'R$ ' + (Number(mlOrigPrice) ?? 0).toFixed(2).replace('.', ',') : null
  // Promo ativa: live da API OU preco salvo no banco (indica que havia promocao)
  // dbSavedPromo: preco_venda existe E (nao tem price ML carregado OU preco_venda < price ML)
  const livePromoPrice = mlFetched[0]?.promo_price ?? null
  const dbSavedPromo = precoVendaRaw != null
  const dbSavedIsPromo = (idx: number) => {
    const mlPrice = mlFetched[idx]?.price ?? mlFetched[0]?.price ?? null
    return !livePromoPrice && precoVendaRaw != null && (mlPrice == null || precoVendaRaw < mlPrice)
  }
  const hasActivePromo = livePromoPrice || dbSavedIsPromo(0)
  const activePromoPrice = livePromoPrice ?? (dbSavedIsPromo(0) ? precoVendaRaw : null)
  const promoBasePrice = livePromoPrice ? mlFetched[0].price : (dbSavedIsPromo(0) ? mlFetched[0]?.price : null)
  const [imgErr, setImgErr] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showThumb, setShowThumb] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewSrc = showThumb || product.foto_principal_url

  function copy(text: string, label: string) {
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiado(label)
    onShowToast(`📋 Copiado: ${text}`)
    setTimeout(() => setCopiado(null), 1500)
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const thumb = URL.createObjectURL(file)
    setShowThumb(thumb)
    setUploading(true)
    onUpload(file)
    setUploading(false)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function fieldCopiado(label: string) {
    setCopiado(label)
    setTimeout(() => setCopiado(null), 1200)
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({
          product_id: product.id,
          notas_top: localNotas.top,
          notas_coracao: localNotas.coracao,
          notas_fundo: localNotas.fundo,
          ml_ids: localMlIds,
        }),
      })
      const d = await res.json()
      if (d.success) {
        onSaveMlId(product.id, localMlIds)
        onShowToast('✅ Salvo!')
      }
    } catch {
      onShowToast('❌ Erro ao salvar')
    } finally {
      setSavingNotes(false)
    }
  }

  function addMlId() {
    setLocalMlIds(prev => [...prev, ''])
  }

  async function fetchMlData(mlId: string, idx: number) {
    if (!mlId.trim()) return
    setMlFetching(idx)
    try {
      const cid = companyId || MATRIZ_COMPANY_ID
      const url = `/api/ml/item-info?ml_id=${mlId.trim()}&company_id=${cid}`
      const res = await fetch(url, {
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const d = await res.json()
      if (d.ok) {
        setMlFetched(prev => ({ ...prev, [idx]: {
          sku: d.sku,
          price: d.price,
          base_price: d.base_price,
          original_price: d.original_price,
          stock: d.stock,
          title: d.ml_title,
          thumbnail: d.thumbnail,
          promo_price: d.promo_price ?? null,
          promo_name: d.promo_name ?? null,
          height: d.height ?? null,
          width: d.width ?? null,
          length: d.length ?? null,
          weight: d.weight ?? null,
        }}))

        // Aplica automaticamente: SKU, estoque, preço, foto
        const msgs: string[] = []
        if (d.sku) {
          onUpdateProduct(product.id, { sku: d.sku } as any)
          msgs.push(`SKU: ${d.sku.substring(0, 20)}`)
        }
        if (d.stock !== undefined) {
          onUpdateProduct(product.id, { _ml_stock: d.stock } as any)
          msgs.push(`📦${d.stock}`)
        }
        if (d.price !== undefined) {
          // Se tem promo, aplica o preço promocional (não o base)
          const priceToSave = d.promo_price ?? d.price
          onUpdateProduct(product.id, { _ml_price: priceToSave } as any)
          if (d.promo_price) {
            msgs.push(`💰 PROMO R$${d.promo_price} (de R$${d.price})`)
          } else {
            const from = d.original_price && d.original_price !== d.price ? ` (de R$${d.original_price})` : ''
            msgs.push(`💰 R$${d.price}${from}`)
          }
        }
        if (d.thumbnail) {
          onSavePhoto?.(product.id, d.thumbnail)
          msgs.push('📷')
        }
        if (d.height || d.width || d.length || d.weight) {
          const parts = []
          if (d.height) parts.push(`${d.height}h`)
          if (d.width) parts.push(`${d.width}w`)
          if (d.length) parts.push(`${d.length}l`)
          if (d.weight) parts.push(`${d.weight}g`)
          msgs.push(`📦 ${parts.join('×')}`)
        }

        const skuNote = d.sku ? `${d.sku}` : 'sem SKU'
        onShowToast(`✅ [${d.account_nickname}] ${msgs.join(' · ')}`)
      } else {
        onShowToast(`❌ ${d.error}`)
      }
    } catch {
      onShowToast('❌ Erro ao buscar ML')
    } finally {
      setMlFetching(null)
    }
  }

  function applyMlData(idx: number, field: 'sku' | 'stock' | 'price') {
    const data = mlFetched[idx]
    if (!data) return
    if (field === 'sku' && data.sku) {
      // Notify parent to update SKU via name/nome (we'll use a dedicated callback)
      onUpdateProduct(product.id, { sku: data.sku } as any)
      onShowToast(`📋 SKU: ${data.sku}`)
    }
    // Stock and price go through onUpdateProduct
    onUpdateProduct(product.id, {
      ...(field === 'stock' && data.stock !== undefined ? { _ml_stock: data.stock } : {}),
      ...(field === 'price' && data.price !== undefined ? { _ml_price: data.price } : {}),
    } as any)
  }

  function removeMlId(idx: number) {
    setLocalMlIds(prev => prev.filter((_, i) => i !== idx))
  }

  function updateMlId(idx: number, val: string) {
    setLocalMlIds(prev => prev.map((v, i) => i === idx ? val : v))
  }

  const mlCount = localMlIds.filter(Boolean).length

  return (
    <>
      {/* LIGHTBOX ZOOM */}
      {zoomOpen && previewSrc && !imgErr && (
        <div
          onClick={() => setZoomOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={previewSrc}
            alt={product.nome}
            style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 12 }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomOpen(false)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              fontSize: 13, backdropFilter: 'blur(4px)',
            }}
          >
            ✕ Fechar
          </button>
        </div>
      )}

      {/* CARD */}
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 12, overflow: 'visible',
          transition: 'box-shadow 0.15s, border 0.15s',
          position: 'relative',
          border: removeMode
            ? '2px solid #ef4444'
            : (expanded ? '1px solid #6366f1' : '1px solid transparent'),
          zIndex: expanded ? 50 : 1,
          cursor: removeMode ? 'pointer' : 'default',
          boxShadow: removeMode
            ? (selectedRemove ? '0 0 16px rgba(239,68,68,0.5)' : '0 0 8px rgba(239,68,68,0.2)')
            : '0 2px 8px rgba(0,0,0,0.25)',
        }}
        onClick={() => {
          if (removeMode) {
            onToggleRemove(product.id)
          } else {
            setExpanded(v => !v)
          }
        }}
        onMouseEnter={e => {
          if (removeMode) {
            e.currentTarget.style.boxShadow = selectedRemove ? '0 0 20px rgba(239,68,68,0.7)' : '0 0 12px rgba(239,68,68,0.3)'
          } else {
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)'
          }
        }}
        onMouseLeave={e => {
          if (removeMode) {
            e.currentTarget.style.boxShadow = selectedRemove ? '0 0 16px rgba(239,68,68,0.5)' : '0 0 8px rgba(239,68,68,0.2)'
          } else {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
          }
        }}
      >
        {/* Foto */}
        <div
          style={{
            width: '100%', aspectRatio: '1', background: '#fff',
            position: 'relative',
          }}
        >
          {previewSrc && !imgErr ? (
            <img
              src={previewSrc} alt={product.nome}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.6 : 1, cursor: removeMode ? 'pointer' : 'zoom-in' }}
              onClick={(e) => { e.stopPropagation(); if (removeMode) { onToggleRemove(product.id) } else setZoomOpen(true) }}
              onError={() => { setImgErr(true); setShowThumb(null) }}
            />
          ) : (
            <div
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#d1d5db', gap: 4 }}
            >
              📷
            </div>
          )}

          {uploading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', fontSize: 12, color: '#fff' }}>
              ⏳ Enviando...
            </div>
          )}

          {/* BADGE KIT — REMOVIDO: kits agora sao agrupados via ML, nao como tipo de produto */}
          {/* Botão FOTO */}
          <button
            onClick={(e) => { e.stopPropagation(); if (!removeMode) fileInputRef.current?.click() }}
            title={removeMode ? 'Clique no card para selecionar' : 'Adicionar foto'}
            style={{
              position: 'absolute', top: 6, left: 6,
              background: removeMode ? '#f59e0b' : '#6366f1',
              color: '#fff', border: 'none',
              borderRadius: 6, padding: '4px 9px',
              fontSize: 10, fontWeight: 700, cursor: removeMode ? 'pointer' : 'pointer',
              zIndex: 5, lineHeight: 1.2,
              display: removeMode ? 'none' : 'block',
            }}
          >
            📷 FOTO
          </button>

          {/* Checklist / Seleção para REMOVE */}
          <button
            onClick={(e) => { e.stopPropagation(); removeMode ? onToggleRemove(product.id) : onToggleAnunciado(product.id) }}
            title={removeMode ? (selectedRemove ? 'Remover da seleção' : 'Selecionar para remover') : (adolescent ? 'Remover marcação' : 'Marcar como anunciado')}
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 28, height: 28, borderRadius: '50%',
              background: removeMode
                ? (selectedRemove ? '#ef4444' : 'transparent')
                : (adolescent ? '#22c55e' : 'transparent'),
              border: `2px solid ${removeMode ? '#ef4444' : (adolescent ? '#22c55e' : '#6366f1')}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: '#fff', zIndex: 5,
              transition: 'all 0.15s',
              boxShadow: removeMode && selectedRemove ? '0 0 8px rgba(239,68,68,0.6)' : 'none',
            }}
          >
            {removeMode ? (selectedRemove ? '✓' : '') : (adolescent ? '✓' : '')}
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />

        {/* Info */}
        <div style={{ background: '#1a1a2e', padding: '12px 14px 14px' }}>
          {/* Nome + Editar */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
            <p style={{
              flex: 1, margin: 0, fontSize: 11, fontWeight: 700, color: '#c4b5fd',
              lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.04em',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {product.nome}
            </p>
            <button
              onClick={() => { setEditingName(true); setLocalName(product.nome) }}
              title="Editar nome"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#6366f1', padding: '0 3px', flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ✏️
            </button>
          </div>

          {/* Input de nome (quando editando) */}
          {editingName && (
            <div style={{ marginBottom: 8 }}>
              <input
                value={localName}
                onChange={e => setLocalName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter') {
                    const res = await fetch('/api/admin/brand', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
                      body: JSON.stringify({ product_id: product.id, nome: localName }),
                    })
                    const d = await res.json()
                    if (d.success) { onUpdateProduct(product.id, { nome: localName }); onShowToast('✅ Nome atualizado!'); setEditingName(false) }
                    else onShowToast('❌ ' + (d.error || 'Erro'))
                  }
                }}
                autoFocus
                style={{
                  width: '100%', background: '#1a1a2e', border: '1px solid #a78bfa',
                  borderRadius: 6, padding: '6px 8px', color: '#d0c0ff', fontSize: 11,
                  boxSizing: 'border-box', fontWeight: 700, textTransform: 'uppercase',
                }}
              />
            </div>
          )}

          {/* SKU */}
          <button
            onClick={() => { copy(product.sku, 'SKU'); fieldCopiado('SKU') }}
            style={{
              background: copiado === 'SKU' ? '#2d2d5a' : 'transparent',
              border: `1px solid ${copiado === 'SKU' ? '#a78bfa' : '#2a2a4a'}`,
              borderRadius: 6, padding: '4px 8px', marginBottom: 6,
              width: '100%', textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>SKU</div>
            <div style={{ fontSize: 10, color: copiado === 'SKU' ? '#a78bfa' : '#fde68a', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {copiado === 'SKU' ? '✓ Copiado!' : product.sku}
            </div>
          </button>

          {/* Badge de vendas */}
          {(product.vendas_total ?? 0) > 0 && (
            <div style={{ marginBottom: 6, display: 'flex', gap: 3 }}>
              <div style={{ background: '#065f46', color: '#6ee7b7', borderRadius: 6, padding: '3px 8px', fontSize: 9, fontWeight: 700 }}>
                📈 {(product.vendas_total ?? 0).toLocaleString('pt-BR')} vendas
              </div>
            </div>
          )}

          {/* Linha 2: VOL | EAN */}
          <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr', gap: 6, marginBottom: 6 }}>
            <button
              onClick={() => { copy(product.volume || '', 'VOL'); fieldCopiado('VOL') }}
              style={{
                background: copiado === 'VOL' ? '#2d2d5a' : '#141428',
                border: `1px solid ${copiado === 'VOL' ? '#a78bfa' : '#2a2a4a'}`,
                borderRadius: 6, padding: '4px 8px',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>VOL</div>
              <div style={{ fontSize: 11, color: copiado === 'VOL' ? '#a78bfa' : '#e2e8f0', fontWeight: 600 }}>
                {copiado === 'VOL' ? '✓' : (product.volume || '—')}
              </div>
            </button>

            <button
              onClick={() => { copy(product.ean || '', 'EAN'); fieldCopiado('EAN') }}
              style={{
                background: copiado === 'EAN' ? '#2d2d5a' : '#141428',
                border: `1px solid ${copiado === 'EAN' ? '#a78bfa' : '#2a2a4a'}`,
                borderRadius: 6, padding: '4px 8px',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>EAN</div>
              <div style={{ fontSize: 10, color: copiado === 'EAN' ? '#a78bfa' : '#e2e8f0', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {copiado === 'EAN' ? '✓ Copiado!' : (product.ean || '—')}
              </div>
            </button>
          </div>

          {/* Linha 3: STOCK | [CUSTO] | PREÇO ML */}
          <div style={{ display: 'grid', gridTemplateColumns: isPartner ? '1fr 1fr' : '1fr 1fr 1fr', gap: 6 }}>
            <button
              onClick={() => { copy(String(estoque), 'STOCK'); fieldCopiado('STOCK') }}
              style={{
                background: copiado === 'STOCK' ? '#2d2d5a' : '#141428',
                border: `1px solid ${copiado === 'STOCK' ? '#a78bfa' : '#2a2a4a'}`,
                borderRadius: 6, padding: '5px 8px',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>STOCK</div>
              <div style={{ fontSize: 15, color: copiado === 'STOCK' ? '#a78bfa' : (estoque > 0 ? '#4ade80' : '#f87171'), fontWeight: 700 }}>
                {copiado === 'STOCK' ? '✓' : estoque.toLocaleString('pt-BR')}
              </div>
            </button>

            {!isPartner && (
              <button
                onClick={() => { copy(String(custoRaw || ''), 'CUSTO'); fieldCopiado('CUSTO') }}
                style={{
                  background: copiado === 'CUSTO' ? '#2d2d5a' : '#141428',
                  border: `1px solid ${copiado === 'CUSTO' ? '#a78bfa' : '#2a2a4a'}`,
                  borderRadius: 6, padding: '5px 8px',
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>CUSTO</div>
                <div style={{ fontSize: 11, color: copiado === 'CUSTO' ? '#a78bfa' : '#fbbf24', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {copiado === 'CUSTO' ? '✓' : (custoFmt || '—')}
                </div>
              </button>
            )}

            <button
              onClick={() => { copy(String(precoVendaRaw || ''), 'PRECO'); fieldCopiado('PRECO') }}
              style={{
                background: copiado === 'PRECO' ? '#2d2d5a' : '#141428',
                border: `1px solid ${copiado === 'PRECO' ? '#a78bfa' : '#2a2a4a'}`,
                borderRadius: 6, padding: '5px 8px',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>💰 PREÇO ML</div>
              {copiado === 'PRECO' ? (
                <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>✓</div>
              ) : hasActivePromo ? (
                <div>
                  <div style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700, marginBottom: 1 }}>🔥 PROMO</div>
                  <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>R$ {(Number(activePromoPrice) ?? 0).toFixed(2).replace('.', ',')}</div>
                  {promoBasePrice != null && !isNaN(Number(promoBasePrice)) ? (
                    <div style={{ fontSize: 9, color: '#9ca3af', textDecoration: 'line-through' }}>de R$ {Number(promoBasePrice).toFixed(2).replace('.', ',')}</div>
                  ) : null}
                </div>
              ) : dbSavedPromo && !mlFetched[0]?.price ? (
                // Preço salvo no banco, ainda não carregou ML — mostra como "salvo"
                <div>
                  <div style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700, marginBottom: 1 }}>🔥 PROMO</div>
                  <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>{precoVendaFmt}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>✓ salvo</div>
                </div>
              ) : mlOrigFmt ? (
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'line-through' }}>{mlOrigFmt}</div>
                  <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>{precoVendaFmt}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {precoVendaFmt}
                </div>
              )}
            </button>
          </div>

          {/* Linha ML collapsed: mostra badges ou "vincular" */}
          <div style={{ marginTop: 4 }}>
            {localMlIds.filter(Boolean).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {localMlIds.filter(Boolean).map((ml, i) => (
                  <a key={i} href={`https://mercadolivre.com.br/MLB-${ml}`} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: '#6366f1', color: '#fff', borderRadius: 6, padding: '3px 8px',
                      fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                    }}>
                    MLB-{ml}
                  </a>
                ))}
              </div>
            ) : (
              <div style={{
                background: '#141428', border: '1px solid #2a2a4a',
                borderRadius: 6, padding: '4px 8px',
                fontSize: 9, color: '#4a4a7a', textAlign: 'center', fontStyle: 'italic',
              }}>
                ML: vincular anúncio
              </div>
            )}
          </div>

          {/* Expand button */}
          <button
            onClick={() => onOpenDrawer?.(product)}
            style={{
              marginTop: 8, width: '100%', padding: '6px',
              background: '#141428',
              border: '1px solid #6366f1',
              borderRadius: 6, cursor: 'pointer',
              color: '#a78bfa', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'all 0.15s',
            }}
          >
            📋 VER DETALHES
          </button>

        </div>
      </div>
    </>
  )
}

// =====================================================
// SIDE DRAWER — painel lateral com detalhes do produto
// =====================================================
function ProductSideDrawer({ product, onClose, onUpdateProduct, onShowToast, isPartner }: {
  product: Product
  onClose: () => void
  onUpdateProduct: (productId: string, updates: Partial<Product>) => void
  onShowToast: (msg: string) => void
  isPartner: boolean
}) {
  const [savingNotes, setSavingNotes] = useState(false)
  const [localNotas, setLocalNotas] = useState({
    top: product.notas_top || '',
    coracao: product.notas_coracao || '',
    fundo: product.notas_fundo || '',
  })
  const [localMlIds, setLocalMlIds] = useState<string[]>(() => {
    const raw = product.ml_ids
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p.filter(Boolean) : [] }
      catch { return [] }
    }
    return []
  })
  const [localName, setLocalName] = useState(product.nome)
  const [localSku, setLocalSku] = useState(product.sku)
  const [localEan, setLocalEan] = useState(product.ean || '')
  const [localVolume, setLocalVolume] = useState(product.volume || '')
  const [localCusto, setLocalCusto] = useState(() => {
    const raw = product.product_prices?.find((p: any) => p.canal === 'site_b2c')?.custo
    return raw != null ? String(raw) : ''
  })
  const [mlFetching, setMlFetching] = useState<number | null>(null)
  const [mlFetched, setMlFetched] = useState<Record<number, {
    sku?: string; price?: number; original_price?: number;
    stock?: number; title?: string; promo_price?: number | null;
  }>>({})
  const [notesOpen, setNotesOpen] = useState(true)
  const [mlAdsOpen, setMlAdsOpen] = useState(true)
  const [comprasOpen, setComprasOpen] = useState(false)
  const [comprasLoading, setComprasLoading] = useState(false)
  const [comprasList, setComprasList] = useState<any[]>([])
  const [vendasPeriodo, setVendasPeriodo] = useState<[number,number,number,number]>([0,0,0,0])
  const [vendasPeriodoLoading, setVendasPeriodoLoading] = useState(false)
  const MATRIZ = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  // Buscar vendas por período (7/7/7/7 dias)
  useEffect(() => {
    setVendasPeriodoLoading(true)
    fetch(`/api/products/${product.id}/orders`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          const now = Date.now()
          const p = [0, 0, 0, 0]
          for (const o of d.data) {
            const age = (now - new Date(o.created_at).getTime()) / 86400000
            if (age <= 7) p[0] += (o.quantidade_produto || 1)
            else if (age <= 14) p[1] += (o.quantidade_produto || 1)
            else if (age <= 21) p[2] += (o.quantidade_produto || 1)
            else if (age <= 30) p[3] += (o.quantidade_produto || 1)
          }
          setVendasPeriodo(p as [number,number,number,number])
        }
      })
      .catch(() => {})
      .finally(() => setVendasPeriodoLoading(false))
  }, [product.id])

  function updateMlId(idx: number, val: string) { setLocalMlIds(prev => prev.map((v, i) => i === idx ? val : v)) }
  function addMlId() { setLocalMlIds(prev => [...prev, '']) }
  function removeMlId(idx: number) { setLocalMlIds(prev => prev.filter((_, i) => i !== idx)) }

  async function fetchMlData(mlId: string, idx: number) {
    if (!mlId.trim()) return
    setMlFetching(idx)
    try {
      const res = await fetch(`/api/ml/item-info?ml_id=${mlId.trim()}&company_id=${MATRIZ}`, {
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const d = await res.json()
      if (d.ok) setMlFetched(prev => ({ ...prev, [idx]: {
        sku: d.sku, price: d.price, original_price: d.original_price,
        stock: d.stock, title: d.ml_title, promo_price: d.promo_price ?? null,
      }}))
    } catch { /* silent */ }
    finally { setMlFetching(null) }
  }

  async function handleSaveAll() {
    setSavingNotes(true)
    try {
      const patchData: any = {
        product_id: product.id,
        ml_ids: localMlIds,
        notas_top: localNotas.top || null,
        notas_coracao: localNotas.coracao || null,
        notas_fundo: localNotas.fundo || null,
      }
      if (localName !== product.nome) patchData.nome = localName
      if (localSku !== product.sku) patchData.sku = localSku
      if (localEan !== (product.ean || '')) patchData.ean = localEan || null
      if (localVolume !== (product.volume || '')) patchData.volume = localVolume || null
      if (localCusto !== '') patchData.custo = parseFloat(localCusto)

      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify(patchData),
      })
      const d = await res.json()
      if (d.success || res.ok) {
        onUpdateProduct(product.id, {
          nome: localName, sku: localSku,
          ean: localEan || null, volume: localVolume || null,
          ml_ids: localMlIds,
          notas_top: localNotas.top || null,
          notas_coracao: localNotas.coracao || null,
          notas_fundo: localNotas.fundo || null,
        } as any)
        onShowToast('✅ Salvo com sucesso!')
      } else {
        onShowToast('❌ ' + (d.error || 'Erro'))
      }
    } catch { onShowToast('❌ Erro de conexão') }
    finally { setSavingNotes(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1999 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 95vw)',
        background: '#12122a',
        borderLeft: '1px solid #2a2a4a',
        zIndex: 2000,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a2e', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.nome}</div>
            <div style={{ fontSize: 14, color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.sku}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, padding: '0 4px', flexShrink: 0 }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Dados básicos editáveis */}
          <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
            <div style={{ fontSize: 14, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>📝 Dados do Produto</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' }}>NOME</div>
                <input value={localName} onChange={e => setLocalName(e.target.value)} style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#d0c0ff', fontSize: 15, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' }}>SKU</div>
                <input value={localSku} onChange={e => setLocalSku(e.target.value)} style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#fde68a', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' }}>VOLUME</div>
                <input value={localVolume} onChange={e => setLocalVolume(e.target.value)} placeholder="Ex: 100ML" style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#d0c0ff', fontSize: 15, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' }}>EAN</div>
                <input value={localEan} onChange={e => setLocalEan(e.target.value)} placeholder="Código de barras" style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 15, fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
            </div>
            {!isPartner && (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' }}>CUSTO (R$)</div>
                <input type="number" value={localCusto} onChange={e => setLocalCusto(e.target.value)} placeholder="0.00" style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#fbbf24', fontSize: 16, boxSizing: 'border-box' }} />
              </div>
            )}
          </div>

          {/* Preços por canal */}
          {!isPartner && (
            <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
              <div style={{ fontSize: 14, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>💰 Preços por Canal</div>
              {product.product_prices && product.product_prices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {product.product_prices.map((p: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a2e', borderRadius: 6, padding: '5px 10px' }}>
                      <span style={{ fontSize: 14, color: '#6b7280', textTransform: 'uppercase' }}>{p.canal}</span>
                      <span style={{ fontSize: 15, color: '#fbbf24', fontWeight: 700 }}>{p.preco_venda != null ? `R$ ${Number(p.preco_venda).toFixed(2).replace('.', ',')}` : '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#4a4a7a', textAlign: 'center', fontStyle: 'italic' }}>Sem preços cadastrados</div>
              )}
            </div>
          )}

          {/* Barra de vendas 7/7/7/7 dias */}
          <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
            <div style={{ fontSize: 14, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>📊 Vendas (últimos 30 dias)</div>
            {vendasPeriodoLoading ? (
              <div style={{ fontSize: 14, color: '#60a5fa', textAlign: 'center' }}>⏳ Carregando...</div>
            ) : (
              <>
                {/* Barras visuais */}
                {(() => {
                  const max = Math.max(...vendasPeriodo, 1)
                  const labels = ['Dias 1-7', 'Dias 8-14', 'Dias 15-21', 'Dias 22-30']
                  const colors = ['#22c55e', '#4ade80', '#fbbf24', '#f87171']
                  const tot30 = vendasPeriodo.reduce((a, b) => a + b, 0)
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 6 }}>
                        {vendasPeriodo.map((qtd, i) => (
                          <div key={i} style={{ background: '#1a1a2e', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                            {/* Barra */}
                            <div style={{ height: 40, background: '#2a2a4a', borderRadius: 4, overflow: 'hidden', marginBottom: 4, position: 'relative' }}>
                              <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: colors[i],
                                height: `${max > 0 ? (qtd / max * 100) : 0}%`,
                                transition: 'height 0.3s',
                              }} />
                              <div style={{
                                position: 'absolute', top: '50%', left: '50%',
                                transform: 'translate(-50%,-50%)',
                                fontSize: 12, fontWeight: 700, color: '#fff',
                                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                              }}>
                                {qtd}
                              </div>
                            </div>
                            {/* Período */}
                            <div style={{ fontSize: 11, color: colors[i], fontWeight: 600 }}>{labels[i]}</div>
                          </div>
                        ))}
                      </div>
                      {/* Tendência */}
                      {tot30 === 0 ? (
                        <div style={{ fontSize: 13, color: '#4a4a7a', textAlign: 'center', fontStyle: 'italic', marginBottom: 6 }}>Nenhuma venda nos últimos 30 dias</div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#6b7280' }}>Total 30d</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{tot30} un</span>
                          {(() => {
                            const ultimos7 = vendasPeriodo[0]
                            const ant7 = vendasPeriodo[1]
                            if (ultimos7 === 0 && ant7 === 0) return <span style={{ color: '#4a4a7a', fontSize: 12 }}>—</span>
                            const diff = ant7 > 0 ? ((ultimos7 - ant7) / ant7 * 100) : (ultimos7 > 0 ? 100 : 0)
                            const sinal = diff >= 0 ? '↑' : '↓'
                            const cor = diff > 0 ? '#22c55e' : diff < 0 ? '#f87171' : '#6b7280'
                            return (
                              <span style={{ color: cor, fontWeight: 700 }}>
                                {sinal} {Math.abs(diff).toFixed(0)}% vs semana anterior
                              </span>
                            )
                          })()}
                        </div>
                      )}
                      {/* Tempo para esgotar — SEMPRE aparece */}
                      <TempoEsgotar estoque={product.inventory?.quantidade_atual ?? 0} mediaDiaria={tot30 / 30} />
                    </>
                  )
                })()}
              </>
            )}
          </div>

          {/* Notas olfativas */}
          <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
            <div onClick={() => setNotesOpen(v => !v)} style={{ fontSize: 14, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: notesOpen ? 8 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, transform: notesOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
              🧪 Notas Olfativas {!notesOpen && <span style={{ color: '#6366f1', fontWeight: 400 }}>(fechado)</span>}
            </div>
            {notesOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'TOPO', key: 'top' as const, color: '#fbbf24' },
                  { label: 'CORPO', key: 'coracao' as const, color: '#f87171' },
                  { label: 'FUNDO', key: 'fundo' as const, color: '#60a5fa' },
                ].map(n => (
                  <div key={n.key}>
                    <div style={{ fontSize: 12, color: n.color, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>{n.label}</div>
                    <input value={localNotas[n.key]} onChange={e => setLocalNotas(prev => ({ ...prev, [n.key]: e.target.value }))} placeholder="Ex: Bergamota, Limão..." style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 15, boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anúncios ML */}
          <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mlAdsOpen ? 8 : 0 }}>
              <div onClick={() => setMlAdsOpen(v => !v)} style={{ fontSize: 14, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14, transform: mlAdsOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                🔗 Anúncios ML ({localMlIds.length}) {!mlAdsOpen && <span style={{ color: '#6366f1', fontWeight: 400 }}>(fechado)</span>}
              </div>
              {mlAdsOpen && (
                <button onClick={addMlId} style={{ background: '#3730a3', border: '1px solid #6366f1', borderRadius: 6, padding: '2px 8px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+ Adicionar</button>
              )}
            </div>
            {mlAdsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {localMlIds.map((ml, idx) => (
                  <div key={idx} style={{ background: '#1a1a2e', borderRadius: 8, padding: 8, border: '1px solid #2a2a4a' }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      <input value={ml} onChange={e => updateMlId(idx, e.target.value)} placeholder="MLB ID" style={{ flex: 1, background: '#141428', border: '1px solid #2a2a4a', borderRadius: 5, padding: '3px 6px', color: '#818cf8', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }} />
                      <button onClick={() => fetchMlData(ml, idx)} disabled={mlFetching === idx || !ml.trim()} style={{ background: mlFetching === idx ? '#4a4a7a' : '#6366f1', border: 'none', borderRadius: 5, padding: '3px 8px', color: '#fff', cursor: mlFetching === idx ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>{mlFetching === idx ? '⏳' : '🔍'}</button>
                      <button onClick={() => removeMlId(idx)} style={{ background: '#ef4444', border: 'none', borderRadius: 5, padding: '3px 6px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>✕</button>
                    </div>
                    {mlFetched[idx] && (
                      <div style={{ fontSize: 14, color: '#4ade80', background: '#0f0f22', borderRadius: 5, padding: '4px 6px' }}>
                        ✅ {mlFetched[idx].title?.substring(0, 50)} — R$ {mlFetched[idx].price} — 📦 {mlFetched[idx].stock} un
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico de compras — já mostra a compra mais recente no topo */}
          {!isPartner && (
            <div style={{ background: '#0f0f22', borderRadius: 10, padding: 12, border: '1px solid #2a2a4a' }}>
              <div onClick={async () => {
                if (comprasOpen) { setComprasOpen(false); return }
                setComprasOpen(true)
                if (comprasList.length > 0) return
                setComprasLoading(true)
                try {
                  const res = await fetch(`/api/admin/product-cost-history?product_id=${product.id}`, {
                    headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
                  })
                  const d = await res.json()
                  if (d.ok) setComprasList(d.historico || [])
                } catch { /* silent */ }
                finally { setComprasLoading(false) }
              }} style={{ fontSize: 14, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: comprasOpen ? 8 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14, transform: comprasOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                🛒 Histórico de Compras {!comprasOpen && <span style={{ color: '#6366f1', fontWeight: 400 }}>(mais recente primeiro)</span>}
              </div>
              {comprasOpen && (
                comprasLoading ? (
                  <div style={{ textAlign: 'center', padding: 12, fontSize: 14, color: '#60a5fa' }}>⏳ Carregando...</div>
                ) : comprasList.length === 0 ? (
                  <div style={{ fontSize: 14, color: '#4a4a7a', textAlign: 'center', fontStyle: 'italic' }}>Nenhuma compra registrada</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {comprasList.map((c: any, idx: number) => (
                      <div key={idx} style={{ background: '#1a1a2e', borderRadius: 6, padding: '6px 8px', border: idx === 0 ? '1px solid #6366f1' : '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>{c.supplier_nome || '—'}</div>
                          <div style={{ fontSize: 14, color: '#e2e8f0' }}>{c.data_pedido ? new Date(c.data_pedido).toLocaleDateString('pt-BR') : '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, color: '#fbbf24', fontWeight: 700 }}>{c.custo_unitario != null ? `R$ ${Number(c.custo_unitario).toFixed(2).replace('.', ',')}` : '—'}</div>
                          {Number(c.quantidade) > 1 && <div style={{ fontSize: 12, color: '#4ade80' }}>×{c.quantidade}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer — salvar */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid #2a2a4a', background: '#1a1a2e', flexShrink: 0 }}>
          <button onClick={handleSaveAll} disabled={savingNotes} style={{ width: '100%', padding: '10px', background: savingNotes ? '#4a4a7a' : '#22c55e', border: 'none', borderRadius: 8, color: '#000', cursor: savingNotes ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 700 }}>
            {savingNotes ? '⏳ Salvando...' : '💾 Salvar Tudo'}
          </button>
        </div>
      </div>
    </>
  )
}

// =====================================================
// COMPONENTE: Tempo para esgotar estoque
// =====================================================
function TempoEsgotar({ estoque, mediaDiaria }: { estoque: number; mediaDiaria: number }) {
  if (mediaDiaria === 0) {
    return (
      <div style={{ marginTop: 6, padding: '6px 8px', background: '#1a1a2e', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>⏳ Tempo para esgotar</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffffff', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 700 }}>sem dados de venda</span>
        </div>
      </div>
    )
  }
  const diasReal = estoque / mediaDiaria
  const corEst = diasReal <= 7 ? '#ef4444' : diasReal <= 15 ? '#f59e0b' : diasReal <= 30 ? '#22c55e' : diasReal <= 45 ? '#3b82f6' : diasReal <= 60 ? '#a78bfa' : '#374151'
  const temCorEst = estoque > 0 && mediaDiaria > 0 ? corEst : '#e2e8f0'
  let msgEst: string
  if (estoque <= 0) {
    msgEst = '⚠️ Esgotado!'
  } else if (diasReal <= 7) {
    msgEst = `${Math.round(diasReal)} dias`
  } else if (diasReal <= 15) {
    msgEst = `${Math.round(diasReal)} dias`
  } else if (diasReal <= 30) {
    msgEst = `${Math.round(diasReal)} dias`
  } else if (diasReal <= 45) {
    msgEst = `${Math.round(diasReal)} dias`
  } else if (diasReal <= 60) {
    msgEst = `${Math.round(diasReal)} dias`
  } else {
    msgEst = `${Math.round(diasReal)} dias — FAZER PROMOCAO`
  }
  return (
    <div style={{ marginTop: 6, padding: '6px 8px', background: '#1a1a2e', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>⏳ Tempo para esgotar</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: corEst, flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: corEst, fontWeight: 700 }}>{msgEst}</span>
      </div>
    </div>
  )
}

// =====================================================
// CARD DE ADICIONAR PRODUTO (formulário inline)
// =====================================================
function AddProductCard({ form, onChange, onSave, onCancel, saving }: {
  form: Record<string, string>
  onChange: (key: string, value: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  function inp(key: string, label: string, placeholder?: string, type = 'text') {
    return (
      <div key={key} style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 7, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {label}
        </div>
        <input
          type={type}
          value={form[key]}
          onChange={e => onChange(key, e.target.value)}
          placeholder={placeholder || label}
          style={{
            width: '100%', background: '#141428', border: '1px solid #a78bfa',
            borderRadius: 6, padding: '4px 6px', color: '#d0c0ff',
            fontSize: 9, boxSizing: 'border-box',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{
      background: '#1a1a2e',
      borderRadius: 12, overflow: 'visible',
      border: '2px dashed #22c55e',
      boxShadow: '0 0 16px rgba(34,197,94,0.3)',
      position: 'relative',
    }}>
      {/* Header verde */}
      <div style={{
        background: '#22c55e', padding: '4px 10px',
        borderRadius: '10px 10px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: '#000', textTransform: 'uppercase' }}>
          ✏️ NOVO PRODUTO
        </span>
        <button onClick={onCancel} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#000', fontWeight: 700, padding: 0,
        }}>✕</button>
      </div>

      {/* Área de foto placeholder */}
      <div style={{
        width: '100%', aspectRatio: '1', background: '#141428',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderTop: '1px solid #22c55e', borderBottom: '1px solid #22c55e',
      }}>
        <div style={{ fontSize: 36, color: '#22c55e' }}>📷</div>
        <div style={{ fontSize: 8, color: '#22c55e', fontWeight: 700, marginTop: 4 }}>FOTO</div>
        <div style={{ fontSize: 7, color: '#4a4a7a', marginTop: 2 }}>URL da foto abaixo</div>
      </div>

      {/* Formulário */}
      <div style={{ background: '#1a1a2e', padding: '8px 10px 10px' }}>
        {inp('sku', 'SKU *', 'Ex: ARMA-CLUBDENUIT-100')}
        {inp('nome', 'NOME *', 'Ex: Club de Nuit Iman EDP')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {inp('volume', 'VOL', 'Ex: 100ml')}
          {inp('ean', 'EAN', 'Código de barras')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {inp('custo', 'CUSTO (R$)', 'Ex: 150.00', 'number')}
          {inp('preco_venda', 'PREÇO (R$)', 'Ex: 299.90', 'number')}
        </div>
        {inp('foto_url', 'URL DA FOTO', 'https://...')}

        {/* Notas */}
        <div style={{ background: '#0f0f22', borderRadius: 8, padding: 8, border: '1px solid #2a2a4a', marginTop: 6 }}>
          <div style={{ fontSize: 7, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            🧪 NOTAS OLFATIVAS
          </div>
          {inp('notas_top', 'TOPO', 'Ex: Bergamota, Limão')}
          {inp('notas_coracao', 'CORPO', 'Ex: Rosa, Jasmim')}
          {inp('notas_fundo', 'FUNDO', 'Ex: Sândalo, Almíscar')}
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              flex: 1, padding: '7px',
              background: '#374151', border: 'none', borderRadius: 8,
              color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 700,
            }}
          >
            ✕ CANCELAR
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 2, padding: '7px',
              background: saving ? '#4a4a7a' : '#22c55e',
              border: 'none', borderRadius: 8,
              color: '#000', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 10, fontWeight: 800,
            }}
          >
            {saving ? '⏳ SALVANDO...' : '✅ SALVAR PRODUTO'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// MODAL GALERIA
// =====================================================
function GaleriaModal({ product, onClose, onSave, onUpload }: {
  product: Product
  onClose: () => void
  onSave: (url: string) => void
  onUpload: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [erroCount, setErroCount] = useState(0)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  function handleImgError(idx: number) {
    setErroCount(prev => prev + 1)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 16,
        width: '95vw', maxWidth: 700, maxHeight: '88vh', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #1a1a3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, color: '#a78bfa' }}>🖼️ {product.nome}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#4a4a7a', fontFamily: 'monospace' }}>{product.sku}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 14px', background: '#6366f1', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>📁 Enviar do PC</button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '8px 18px', borderBottom: '1px solid #1a1a3a', fontSize: 11, color: '#7070a0', display: 'flex', justifyContent: 'space-between' }}>
          <span>Clique numa foto para atribuir ao produto</span>
          {erroCount > 0 && <span style={{ color: '#f59e0b' }}>⚠ {erroCount} foto(s) não carregou(aram) — fotos locais disponíveis, aguardando deploy</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
            {FOTOS.map((foto, idx) => (
              <button key={idx} onClick={() => onSave(foto)} title={`Foto ${idx + 1}`}
                style={{ width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '2px solid transparent', padding: 0, cursor: 'pointer', background: '#12122a', position: 'relative' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#a78bfa')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
              >
                <img
                  src={foto} alt={String(idx + 1)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    img.style.display = 'none'
                    const parent = img.parentElement
                    if (parent) {
                      parent.style.background = '#1a0a0a'
                      parent.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ef4444;font-size:10px;text-align:center;gap:2px"><div style="font-size:18px">⚠️</div><div>${idx + 1}</div></div>`
                    }
                    handleImgError(idx)
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid #1a1a3a', fontSize: 10, color: '#4a4a7a' }}>
          {FOTOS.length} fotos — {erroCount > 0 ? `${FOTOS.length - erroCount} carregadas, ${erroCount} indisponíveis (precisa fazer deploy da pasta uploads)` : `${FOTOS.length} carregadas`}
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
    </>
  )
}

// =====================================================
// MODAL EDITOR DE KIT
// =====================================================
function KitEditorModal({ kitId, products, onClose, onSave, onShowToast, onToggleKit }: {
  kitId: string
  products: Product[]
  onClose: () => void
  onSave: (components: { id: string; nome: string; sku: string; qtd: number }[]) => void
  onShowToast: (msg: string) => void
  onToggleKit: (id: string, isKit: boolean) => void
}) {
  const kit = products.find(p => p.id === kitId)
  const [components, setComponents] = useState<{ id: string; nome: string; sku: string; qtd: number }[]>(
    (kit?.kit_components || []).map(c => ({ id: c.id, nome: c.nome, sku: c.sku, qtd: c.qtd }))
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const unitarios = products.filter(p =>
    p.tipo_produto !== 'kit' && p.id !== kitId
  )

  const searchResults = search.length >= 2
    ? unitarios.filter(p =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    ).filter(p => !components.find(c => c.id === p.id))
    : []

  function addComponent(p: Product) {
    if (components.find(c => c.id === p.id)) return
    setComponents(prev => [...prev, { id: p.id, nome: p.nome, sku: p.sku, qtd: 1 }])
    setSearch('')
  }

  function removeComponent(id: string) {
    setComponents(prev => prev.filter(c => c.id !== id))
  }

  function changeQtd(id: string, delta: number) {
    setComponents(prev => prev.map(c =>
      c.id === id ? { ...c, qtd: Math.max(1, c.qtd + delta) } : c
    ))
  }

  async function handleSave() {
    setSaving(true)
    try {
      onSave(components)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const totalEstoque = components.reduce((acc, c) => {
    const prod = products.find(p => p.id === c.id)
    if (!prod) return acc
    return Math.min(acc, Math.floor((prod.inventory?.quantidade_atual ?? 0) / c.qtd))
  }, Infinity)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#0f0f22', border: '1px solid #a78bfa', borderRadius: 16,
        width: '95vw', maxWidth: 640, maxHeight: '88vh', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(99,102,241,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#0a0a1a' }}>
          <div>
            <h2 style={{ color: '#a78bfa', margin: 0, fontSize: 15 }}>
              🧩 Editar Kit
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7070a0', fontWeight: 600, textTransform: 'uppercase' }}>
              {kit?.nome || kitId}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => { if (confirm('Remover marcação de kit? Componentes não são excluídos.')) { onToggleKit(kitId, false); onClose() } }}
              style={{ padding: '6px 12px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              🗑️ Remover Kit
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {/* Composicao atual */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase' }}>
                📦 Composição ({components.length} produtos)
              </span>
              {components.length > 0 && isFinite(totalEstoque) && (
                <span style={{ fontSize: 10, color: totalEstoque > 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                  🔢 Kit montável: {totalEstoque}x
                </span>
              )}
            </div>

            {components.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#4a4a7a', fontSize: 12, background: '#0a0a1a', borderRadius: 8, border: '1px dashed #2a2a4a' }}>
                Nenhum produto adicionado. Use a busca abaixo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {components.map(c => {
                  const prod = products.find(p => p.id === c.id)
                  const estoque = prod?.inventory?.quantidade_atual ?? 0
                  const maxKit = Math.floor(estoque / c.qtd)
                  return (
                    <div key={c.id} style={{ background: '#1a1a2e', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #2a2a4a' }}>
                      {prod?.foto_principal_url && !prod.foto_principal_url.includes('uploads') ? (
                        <img src={prod.foto_principal_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#2a2a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📷</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#d0c0ff', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                        <div style={{ fontSize: 9, color: '#4a4a7a', fontFamily: 'monospace' }}>{c.sku} · Estoque: {estoque}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => changeQtd(c.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, background: '#2a2a4a', border: 'none', color: '#d0c0ff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#d0c0ff', minWidth: 20, textAlign: 'center' }}>{c.qtd}</span>
                        <button onClick={() => changeQtd(c.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, background: '#2a2a4a', border: 'none', color: '#d0c0ff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      <button onClick={() => removeComponent(c.id)} style={{ width: 24, height: 24, borderRadius: 6, background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Buscar produtos */}
          <div>
            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              ➕ Adicionar produto ao kit
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto por nome ou SKU..."
              style={{
                width: '100%', background: '#1a1a2e', border: '1px solid #2a2a4a',
                borderRadius: 8, padding: '8px 12px', color: '#e2e8f0',
                fontSize: 12, boxSizing: 'border-box', marginBottom: 6,
              }}
            />
            {searchResults.length > 0 && (
              <div style={{ background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a4a', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                {searchResults.slice(0, 10).map(p => (
                  <button key={p.id} onClick={() => addComponent(p)}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'transparent',
                      border: 'none', borderBottom: '1px solid #1a1a3a', color: '#d0c0ff',
                      cursor: 'pointer', fontSize: 11, textAlign: 'left', display: 'flex',
                      alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#2a2a4a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 700, color: '#a78bfa', fontSize: 10, minWidth: 60 }}>🔗</span>
                    <span style={{ flex: 1, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#4a4a7a' }}>{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && searchResults.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: '#4a4a7a', fontSize: 11 }}>
                Nenhum produto encontrado
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a4a', display: 'flex', gap: 8, background: '#0a0a1a' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: '#374151', border: 'none', borderRadius: 8, color: '#d0c0ff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: 10, background: saving ? '#4a4a7a' : '#22c55e',
              border: 'none', borderRadius: 8, color: '#000', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700,
            }}
          >
            {saving ? '⏳ Salvando...' : `💾 Salvar Kit (${components.length} produtos)`}
          </button>
        </div>
      </div>
    </>
  )
}
