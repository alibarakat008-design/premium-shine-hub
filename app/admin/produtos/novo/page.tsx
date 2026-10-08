'use client'

/**
 * =====================================================
 * PÁGINA DE CADASTRO DE PRODUTO
 * =====================================================
 * Formulário completo pra criar novo SKU
 * Com upload de foto via drag & drop
 *
 * Caminho: app/admin/produtos/novo/page.tsx
 * =====================================================
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

export default function NovoProdutoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Campos do formulário
  const [form, setForm] = useState({
    sku: '',
    ean: '',
    nome: '',
    descricao_curta: '',
    descricao_completa: '',
    marca_id: '',
    categoria_id: '',
    genero: 'unissex',
    volume: '',
    ncm: '',
    familia_olfativa: '',
    nota_topo: '',
    nota_coracao: '',
    nota_base: '',
    inspiracao: '',
    preco_custo: '',
    preco_ml: '',
    preco_shopee: '',
    preco_site: '',
    preco_whatsapp: '',
    preco_b2b: '',
    estoque_inicial: '',
    estoque_minimo: '15',
    destaque: false,
  })

  // Upload de foto
  async function handlePhotoUpload(file: File) {
    if (!file) return

    setPhotoUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'produtos')

    try {
      const res = await apiFetch('/api/upload/photo', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (json.success) {
        setPhotoUrl(json.data.url)
      } else {
        setError(json.error || 'Erro no upload')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Montar payload
    const payload = {
      sku: form.sku,
      ean: form.ean || null,
      nome: form.nome,
      descricao_curta: form.descricao_curta || null,
      descricao_completa: form.descricao_completa || null,
      marca_id: form.marca_id,
      categoria_id: form.categoria_id || null,
      genero: form.genero,
      volume: form.volume || null,
      ncm: form.ncm || null,
      destaque: form.destaque,
      foto_principal_url: photoUrl || null,
      notas_olfativas: {
        familia: form.familia_olfativa || null,
        topo: form.nota_topo || null,
        coracao: form.nota_coracao || null,
        base: form.nota_base || null,
        inspiracao: form.inspiracao || null,
      },
    }

    try {
      // 1) Criar produto
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!json.success) {
        setError(json.error || 'Erro ao criar')
        setLoading(false)
        return
      }

      // 2) Criar registro de estoque
      if (form.estoque_inicial) {
        await apiFetch(`/api/inventory/${json.data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantidade_atual: Number(form.estoque_inicial),
            quantidade_minima: Number(form.estoque_minimo),
          }),
        })
      }

      // 3) Criar preços por canal
      if (form.preco_ml) {
        await apiFetch('/api/product-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: json.data.id,
            canal: 'mercado_livre',
            preco_venda: Number(form.preco_ml),
          }),
        })
      }

      alert('Produto criado com sucesso!')
      router.push(`/admin/produtos/${json.data.sku}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 16, fontSize: '0.85em' }}>
          <a href="/admin/produtos" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Produtos</a>
        </div>
        <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 24 }}>+ Novo Produto</h1>

        {error && <div style={errorBoxStyle}>❌ {error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Upload de foto */}
          <div style={cardStyle}>
            <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>📸 Foto Principal</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) handlePhotoUpload(file)
              }}
              style={{
                border: `2px dashed ${dragOver ? '#a78bfa' : '#2a2a4a'}`,
                borderRadius: 12,
                padding: 30,
                textAlign: 'center',
                background: dragOver ? 'rgba(167,139,250,0.1)' : '#0d0d25',
                cursor: 'pointer',
                marginBottom: 16,
              }}
              onClick={() => document.getElementById('photo-input')?.click()}
            >
              {photoUploading ? (
                <div>
                  <div style={{ fontSize: '2em', marginBottom: 8 }}>⏳</div>
                  <div style={{ color: '#a78bfa' }}>Enviando...</div>
                </div>
              ) : photoUrl ? (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="Foto" style={{ maxWidth: 200, maxHeight: 200, marginBottom: 12 }} />
                  <div style={{ color: '#22c55e' }}>✓ Foto carregada</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '3em', marginBottom: 8, opacity: 0.3 }}>🌸</div>
                  <div style={{ color: '#b0b0cc', marginBottom: 4 }}>Arraste a foto aqui</div>
                  <div style={{ color: '#7070a0', fontSize: '0.85em' }}>ou clique pra selecionar (JPG, PNG, WebP — máx 10MB)</div>
                </div>
              )}
              <input id="photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
            </div>
          </div>

          {/* Identificação */}
          <div style={cardStyle}>
            <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>🏷️ Identificação</h2>
            <div style={gridStyle}>
              <Input label="SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} required />
              <Input label="EAN" value={form.ean} onChange={(v) => setForm({ ...form, ean: v })} />
              <Input label="Nome do Produto" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} required fullWidth />
              <Select label="Gênero" value={form.genero} onChange={(v) => setForm({ ...form, genero: v })} options={[
                { value: 'unissex', label: 'Unissex' },
                { value: 'feminino', label: 'Feminino' },
                { value: 'masculino', label: 'Masculino' },
              ]} />
              <Input label="Volume" value={form.volume} onChange={(v) => setForm({ ...form, volume: v })} placeholder="15ml" />
              <Input label="NCM" value={form.ncm} onChange={(v) => setForm({ ...form, ncm: v })} placeholder="33030000" />
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                value={form.descricao_curta}
                onChange={(e) => setForm({ ...form, descricao_curta: e.target.value })}
                placeholder="Descrição curta (aparece na busca)"
                style={{ ...inputStyle, width: '100%', minHeight: 60, resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Notas Olfativas */}
          <div style={cardStyle}>
            <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>🌸 Notas Olfativas</h2>
            <div style={gridStyle}>
              <Input label="Família Olfativa" value={form.familia_olfativa} onChange={(v) => setForm({ ...form, familia_olfativa: v })} placeholder="Oriental Amadeirado" fullWidth />
              <Input label="Topo" value={form.nota_topo} onChange={(v) => setForm({ ...form, nota_topo: v })} placeholder="Bergamota, Lavanda" />
              <Input label="Coração" value={form.nota_coracao} onChange={(v) => setForm({ ...form, nota_coracao: v })} placeholder="Rosa, Jasmim" />
              <Input label="Base" value={form.nota_base} onChange={(v) => setForm({ ...form, nota_base: v })} placeholder="Sândalo, Baunilha" />
              <Input label="Inspiração" value={form.inspiracao} onChange={(v) => setForm({ ...form, inspiracao: v })} placeholder="Lattafa Asad" fullWidth />
            </div>
          </div>

          {/* Preços */}
          <div style={cardStyle}>
            <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>💰 Preços por Canal</h2>
            <div style={gridStyle}>
              <Input label="Custo (R$)" value={form.preco_custo} onChange={(v) => setForm({ ...form, preco_custo: v })} type="number" />
              <Input label="Mercado Livre (R$)" value={form.preco_ml} onChange={(v) => setForm({ ...form, preco_ml: v })} type="number" />
              <Input label="Shopee (R$)" value={form.preco_shopee} onChange={(v) => setForm({ ...form, preco_shopee: v })} type="number" />
              <Input label="Site B2C (R$)" value={form.preco_site} onChange={(v) => setForm({ ...form, preco_site: v })} type="number" />
              <Input label="WhatsApp (R$)" value={form.preco_whatsapp} onChange={(v) => setForm({ ...form, preco_whatsapp: v })} type="number" />
              <Input label="B2B Atacado (R$)" value={form.preco_b2b} onChange={(v) => setForm({ ...form, preco_b2b: v })} type="number" />
            </div>
            <div style={{ marginTop: 12, fontSize: '0.85em', color: '#7070a0' }}>
              💡 Dica: preencha o custo. Os preços de venda devem ter margem de pelo menos 30%.
            </div>
          </div>

          {/* Estoque */}
          <div style={cardStyle}>
            <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>📦 Estoque Inicial</h2>
            <div style={gridStyle}>
              <Input label="Quantidade Atual" value={form.estoque_inicial} onChange={(v) => setForm({ ...form, estoque_inicial: v })} type="number" />
              <Input label="Quantidade Mínima (alerta)" value={form.estoque_minimo} onChange={(v) => setForm({ ...form, estoque_minimo: v })} type="number" />
            </div>
          </div>

          {/* Botão Submit */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}>
              {loading ? '⏳ Salvando...' : '✓ Criar Produto'}
            </button>
            <button type="button" onClick={() => router.push('/admin/produtos')} style={btnSecondary}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required, placeholder, fullWidth }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  fullWidth?: boolean
}) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : {}}>
      <label style={{ display: 'block', color: '#b0b0cc', fontSize: '0.85em', marginBottom: 6 }}>{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label style={{ display: 'block', color: '#b0b0cc', fontSize: '0.85em', marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20, marginBottom: 16 } as const
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 } as const
const inputStyle = { width: '100%', padding: 10, background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: '0.9em' } as const
const btnPrimary = { background: 'linear-gradient(90deg,#a78bfa,#f472b6)', color: 'var(--psh-bg-primary, #fff)', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.95em' } as const
const btnSecondary = { background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', padding: '12px 24px', borderRadius: 8, cursor: 'pointer', fontSize: '0.95em' } as const
const errorBoxStyle = { background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9em' } as const
