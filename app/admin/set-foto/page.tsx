'use client'

/**
 * =====================================================
 * PÁGINA: Set Foto de Produto
 * =====================================================
 * Caminho: app/admin/set-foto/page.tsx
 * POST /api/admin/set-foto → salva foto_principal_url
 * GET  /api/admin/produtos-fotos → busca produtos
 * =====================================================
 */

import { useState } from 'react'
import Link from 'next/link'

interface Product {
  id: string
  sku: string
  nome: string
  foto_principal_url: string | null
}

export default function SetFotoPage() {
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)

  const [sku, setSku] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function buscar() {
    if (!busca.trim()) return
    setLoaded(false)
    const res = await fetch(`/api/admin/produtos-fotos?busca=${encodeURIComponent(busca)}&limit=50&${Date.now()}`, {
      headers: {
        Authorization: 'Basic ' + btoa('premium:shine2026'),
        'Cache-Control': 'no-cache',
      },
    })
    const data = await res.json()
    if (data.ok) {
      setProdutos(data.products || [])
    }
    setLoaded(true)
  }

  async function salvar() {
    if (!sku.trim() || !fotoUrl.trim()) {
      setMsg({ ok: false, text: 'Preencha SKU e URL da foto' })
      return
    }
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/admin/set-foto', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa('premium:shine2026'),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ sku: sku.trim(), foto_url: fotoUrl.trim() }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      setMsg({ ok: true, text: `✅ Foto salva para ${data.product.nome}!` })
      setFotoUrl('')
      // Atualizar lista
      setProdutos(prev => prev.map(p =>
        p.sku === sku.trim() ? { ...p, foto_principal_url: fotoUrl.trim() } : p
      ))
    } else {
      setMsg({ ok: false, text: `❌ Erro: ${data.error}` })
    }
    setTimeout(() => setMsg(null), 5000)
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', background: '#ffffff', minHeight: '100vh' }}>

      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/marcas" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 14 }}>
          ← Voltar
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 700, color: '#1f2937' }}>
          📷 Atualizar Foto de Produto
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          Cole a URL da foto e informe o SKU do produto
        </p>
      </div>

      {/* FORMULÁRIO */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            SKU do produto
          </label>
          <input
            type="text"
            placeholder="Ex: LAB8-PERFUME-100ML-WINDSTORM"
            value={sku}
            onChange={e => setSku(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            URL da foto
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={fotoUrl}
            onChange={e => setFotoUrl(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>

        {fotoUrl && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>Preview:</p>
            <img
              src={fotoUrl}
              alt="Preview"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <button
          onClick={salvar}
          disabled={saving}
          style={{
            padding: '10px 24px', background: saving ? '#9ca3af' : '#6366f1',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14,
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Salvando...' : '💾 Salvar Foto'}
        </button>

        {msg && (
          <div style={{
            marginTop: 10, padding: '10px 14px',
            background: msg.ok ? '#d1fae5' : '#fee2e2',
            color: msg.ok ? '#065f46' : '#991b1b',
            borderRadius: 8, fontSize: 14,
          }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* BUSCAR PRODUTO */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: 20,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#374151' }}>
          🔍 Buscar produto para ver SKU
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid #d1d5db', fontSize: 14,
            }}
          />
          <button
            onClick={buscar}
            style={{
              padding: '10px 20px', background: '#374151', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Buscar
          </button>
        </div>

        {!loaded && busca && (
          <p style={{ margin: '12px 0 0', color: '#6b7280', fontSize: 13 }}>Buscando...</p>
        )}

        {loaded && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>
              {produtos.length} resultado(s)
            </p>
            {produtos.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0', borderBottom: '1px solid #e5e7eb',
                }}
              >
                {p.foto_principal_url ? (
                  <img
                    src={p.foto_principal_url}
                    alt={p.nome}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: 6, background: '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>📷</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{p.sku}</div>
                </div>
                <button
                  onClick={() => { setSku(p.sku); setBusca(''); setLoaded(false) }}
                  style={{
                    padding: '4px 12px', background: '#6366f1', color: '#fff',
                    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Selecionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DICA */}
      <div style={{
        marginTop: 20, padding: '12px 16px', background: '#eff6ff',
        border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af',
      }}>
        💡 <strong>Alternativa:</strong> Vá em <Link href="/admin/lab8-fotos" style={{ color: '#6366f1' }}>Lab8 Fotos</Link> para
        visualizar as 62 fotos disponíveis e associar visualmente ao produto certo.
      </div>
    </div>
  )
}
