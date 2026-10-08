'use client'

/**
 * =====================================================
 * PÁGINA LAB8 FOTOS — Gerenciar fotos dos produtos Lab8
 * =====================================================
 * Caminho: app/admin/lab8-fotos/page.tsx
 *
 * Funcionalidades:
 * - Lista todos os produtos Lab8 do DB
 * - Mostra 62 fotos disponíveis na pasta uploads/lab8/
 * - CLICK no card → abre modal com drag/drop + URL + upload
 * - SKU clicável → copia pra clipboard
 * - Salva no DB via PUT /api/admin/produtos-fotos
 * =====================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

// =====================================================
// TIPOS
// =====================================================
interface Lab8Product {
  id: string
  sku: string
  ean: string | null
  nome: string
  volume: string | null
  genero: string | null
  foto_principal_url: string | null
  fotos_adicionais: string[] | null
  brands: { id: string; nome: string } | null
  inventory: { quantidade_atual: number } | null
  product_prices: { custo: string | null }[] | null
}

// =====================================================
// CONSTANTES
// =====================================================
const FOTOS_DISPONIVEIS = Array.from({ length: 62 }, (_, i) => `/uploads/lab8/${i + 1}.jpg`)

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export default function Lab8FotosPage() {
  const [products, setProducts] = useState<Lab8Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Lab8Product | null>(null)
  const [modalProduct, setModalProduct] = useState<Lab8Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [filterBusca, setFilterBusca] = useState('')
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  // =====================================================
  // FETCH PRODUTOS LAB8
  // =====================================================
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/produtos-fotos?busca=lab8&limit=200&${Date.now()}`, {
        credentials: 'include',
        headers: {
          Authorization: 'Basic ' + btoa('premium:shine2026'),
          'Cache-Control': 'no-cache',
        },
      })
      const data = await res.json()
      if (data.ok) {
        setProducts(data.products || [])
      } else {
        setError(data.error || 'Erro ao carregar produtos')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // =====================================================
  // COPIAR SKU
  // =====================================================
  function copySku(sku: string) {
    navigator.clipboard.writeText(sku).then(() => {
      setCopyMsg(`📋 ${sku} copiado!`)
      setTimeout(() => setCopyMsg(null), 2000)
    })
  }

  // =====================================================
  // ABRIR MODAL
  // =====================================================
  function openModal(product: Lab8Product) {
    setModalProduct(product)
  }

  // =====================================================
  // DELETAR PRODUTO
  // =====================================================
  async function handleDelete(product: Lab8Product) {
    if (!confirm(`Deletar "${product.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`/api/admin/delete-product?id=${product.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const data = await res.json()
      if (data.success) {
        setProducts(prev => prev.filter(p => p.id !== product.id))
      } else {
        alert('Erro ao deletar: ' + (data.error || 'desconhecido'))
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    }
  }

  // =====================================================
  // SALVAR FOTO
  // =====================================================
  async function salvarFoto(product: Lab8Product, fotoUrl: string) {
    setSaving(true)
    setSavedMsg(null)
    try {
      const res = await fetch('/api/admin/produtos-fotos', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          Authorization: 'Basic ' + btoa('premium:shine2026'),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          updates: [{ id: product.id, foto_principal_url: fotoUrl }],
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSavedMsg({ type: 'ok', text: `✅ Foto salva em ${product.nome}!` })
        setProducts(prev => prev.map(p =>
          p.id === product.id ? { ...p, foto_principal_url: fotoUrl } : p
        ))
        setModalProduct(null)
      } else {
        setSavedMsg({ type: 'err', text: `❌ Erro ao salvar: ${data.error || 'verifique as credenciais'}` })
      }
    } catch (e: any) {
      setSavedMsg({ type: 'err', text: `❌ Erro de conexão: ${e.message}` })
    } finally {
      setSaving(false)
      setTimeout(() => setSavedMsg(null), 5000)
    }
  }

  // =====================================================
  // UPLOAD
  // =====================================================
  async function handleUpload(file: File, product: Lab8Product) {
    setSaving(true)
    setSavedMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'lab8')
      const uploadRes = await fetch('/api/upload/photo', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: formData,
      })
      const uploadData = await uploadRes.json()
      if (uploadData.success) {
        await salvarFoto(product, uploadData.data.url)
      } else {
        // Erro mais claro
        const msg = uploadData.error?.includes('R2') || uploadData.error?.includes('CLOUDFLARE')
          ? '❌ R2 não configurado no Vercel. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_PUBLIC_URL nas env vars.'
          : `❌ Upload falhou: ${uploadData.error}`
        setSavedMsg({ type: 'err', text: msg })
      }
    } catch (e: any) {
      setSavedMsg({ type: 'err', text: `❌ Erro de conexão: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  // =====================================================
  // FILTRO
  // =====================================================
  const filteredProducts = products.filter(p =>
    !filterBusca ||
    p.nome.toLowerCase().includes(filterBusca.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(filterBusca.toLowerCase())
  )

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', background: '#ffffff', minHeight: '100vh' }}>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/marcas" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 14 }}>
            ← Voltar
          </Link>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1f2937' }}>
            📸 Fotos Lab8
          </h1>
          <span style={{ background: '#6366f1', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
            {products.length} produtos
          </span>
          <span style={{ background: '#10b981', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
            {FOTOS_DISPONIVEIS.length} fotos disponíveis
          </span>
          <span style={{ background: products.filter(p => !p.foto_principal_url).length > 0 ? '#ef4444' : '#10b981', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
            {products.filter(p => !p.foto_principal_url).length} sem foto
          </span>
        </div>

        {savedMsg && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, padding: '12px 20px',
            background: savedMsg.type === 'ok' ? '#10b981' : '#ef4444',
            color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
            maxWidth: 400,
            whiteSpace: savedMsg.text.length > 60 ? 'normal' : 'nowrap',
          }}>
            {savedMsg.text}
          </div>
        )}

        {copyMsg && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            padding: '8px 16px', background: '#1f2937', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999,
          }}>
            {copyMsg}
          </div>
        )}

        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 13, color: '#6b7280' }}>
          💡 <strong>Como usar:</strong> Clique num card pra abrir o modal → arraste imagem ou cole URL → salve. SKU clicável copia pro clipboard.
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          Carregando...
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
          ❌ {error}
          <button onClick={fetchProducts} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#991b1b', color: '#fff', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Busca */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Buscar produto..."
              value={filterBusca}
              onChange={e => setFilterBusca(e.target.value)}
              style={{
                width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Grid de produtos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onOpenModal={() => openModal(product)}
                onCopySku={() => copySku(product.sku)}
              />
            ))}
            {filteredProducts.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                Nenhum produto encontrado.
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL */}
      {modalProduct && (
        <PhotoModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onSave={(url) => salvarFoto(modalProduct, url)}
          onUpload={(file) => handleUpload(file, modalProduct)}
          saving={saving}
          allFotos={FOTOS_DISPONIVEIS}
        />
      )}
    </div>
  )
}

// =====================================================
// CARD DE PRODUTO
// =====================================================
function ProductCard({
  product,
  onOpenModal,
  onCopySku,
}: {
  product: Lab8Product
  onOpenModal: () => void
  onCopySku: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const custo = product.product_prices?.[0]?.custo
  const custoFmt = custo ? 'R$ ' + parseFloat(custo).toFixed(2).replace('.', ',') : '—'

  return (
    <div
      style={{
        background: '#1a1a2e',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onClick={onOpenModal}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)')}
    >
      {/* Foto */}
      <div style={{ width: '100%', aspectRatio: '1', background: '#fff', position: 'relative' }}>
        {product.foto_principal_url && !imgError ? (
          <img
            src={product.foto_principal_url}
            alt={product.nome}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 40, color: '#d1d5db',
          }}>
            📷
          </div>
        )}
        {/* Overlay no hover */}
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(99,102,241,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s', color: '#fff',
        }} className="card-overlay">
          <span style={{ fontSize: 13, fontWeight: 700 }}>📷 Adicionar foto</span>
        </div>
      </div>

      {/* Info — fundo escuro estilo print */}
      <div style={{ background: '#1a1a2e', padding: '10px 12px 12px' }}>
        {/* Nome */}
        <p style={{
          margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e0e7ff',
          lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.03em',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {product.nome}
        </p>

        {/* Grid de info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 0', fontSize: 11 }}>
          {/* Labels */}
          <span style={{ color: '#6b7280', paddingRight: 6 }}>SKU</span>
          <button
            onClick={(e) => { e.stopPropagation(); onCopySku() }}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: '#fde68a', fontFamily: 'monospace', fontSize: 10,
              textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontWeight: 600,
            }}
            title="Clique para copiar"
          >
            {product.sku}
          </button>

          <span style={{ color: '#6b7280', paddingRight: 6 }}>VOL</span>
          <span style={{ color: '#f9fafb', fontWeight: 600 }}>{product.volume || '—'}</span>

          <span style={{ color: '#6b7280', paddingRight: 6 }}>EAN</span>
          <span style={{ color: '#f9fafb', fontFamily: 'monospace', fontSize: 10 }}>{product.ean || '—'}</span>

          <span style={{ color: '#6b7280', paddingRight: 6 }}>CUSTO</span>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>{custoFmt}</span>
        </div>
      </div>

      <style>{`
        .card-overlay { opacity: 0 !important; }
        *:hover > .card-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

// =====================================================
// MODAL DE FOTO
// =====================================================
function PhotoModal({
  product,
  onClose,
  onSave,
  onUpload,
  saving,
  allFotos,
}: {
  product: Lab8Product
  onClose: () => void
  onSave: (url: string) => void
  onUpload: (file: File) => void
  saving: boolean
  allFotos: string[]
}) {
  const [dragOver, setDragOver] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [tab, setTab] = useState<'galeria' | 'url' | 'upload'>('galeria')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preview URL
  useEffect(() => {
    if (urlInput) {
      setPreviewUrl(urlInput)
    } else {
      setPreviewUrl(null)
    }
  }, [urlInput])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onUpload(file)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  // Fechar com ESC
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '95vw', maxWidth: 700, maxHeight: '90vh',
        background: '#ffffff', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        zIndex: 1001, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>
              📷 Adicionar foto
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              {product.nome}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
              {product.sku}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb',
              borderRadius: 6, cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}>
          {(['galeria', 'url', 'upload'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 8px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                color: tab === t ? '#6366f1' : '#6b7280',
                borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              {t === 'galeria' ? '🖼️ Galeria' : t === 'url' ? '🔗 URL' : '📁 Upload'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* TAB: GALERIA */}
          {tab === 'galeria' && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280' }}>
                Clique numa foto para usar — arraste também!
              </p>
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                  gap: 6,
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {allFotos.map((foto, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSave(foto)}
                    disabled={saving}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 8,
                      overflow: 'hidden', border: dragOver ? '3px solid #22c55e' : '2px solid transparent',
                      cursor: saving ? 'not-allowed' : 'pointer', padding: 0,
                      background: '#f3f4f6', opacity: saving ? 0.5 : 1,
                      transition: 'all 0.1s',
                    }}
                  >
                    <img
                      src={foto}
                      alt={`Foto ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                    />
                  </button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
                {allFotos.length} fotos em /uploads/lab8/
              </p>
            </div>
          )}

          {/* TAB: URL */}
          {tab === 'url' && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280' }}>
                Cole a URL da imagem (jpg, png, webp)
              </p>
              <input
                type="url"
                placeholder="https://exemplo.com/foto.jpg"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
                  marginBottom: 12,
                }}
              />
              {previewUrl && (
                <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f9fafb' }}
                    onError={() => setPreviewUrl(null)}
                  />
                </div>
              )}
              <button
                onClick={() => urlInput && onSave(urlInput)}
                disabled={!urlInput || saving}
                style={{
                  padding: '10px 24px', background: urlInput && !saving ? '#6366f1' : '#9ca3af',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 14,
                  fontWeight: 600, cursor: urlInput && !saving ? 'pointer' : 'not-allowed',
                }}
              >
                {saving ? 'Salvando...' : '💾 Usar esta URL'}
              </button>
            </div>
          )}

          {/* TAB: UPLOAD */}
          {tab === 'upload' && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280' }}>
                Arraste uma imagem aqui ou clique pra selecionar
              </p>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#6366f1' : '#d1d5db'}`,
                  borderRadius: 12, padding: '40px 20px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? '#eef2ff' : '#f9fafb',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
                  Arraste e solte uma imagem aqui
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                  JPG, PNG, WebP — até 10MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {saving && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#6366f1', textAlign: 'center' }}>
                  ⏳ Fazendo upload...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
