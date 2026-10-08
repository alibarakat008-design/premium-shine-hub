'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface BundleItem {
  product_id: string
  quantidade: number
  products?: { sku: string; nome: string; inventory: { quantidade_atual: number } | null }
}

interface Bundle {
  id: string
  nome: string
  descricao: string | null
  sku: string
  preco_venda: number | null
  custo_total: number | null
  margem_pct: number | null
  estoque_virtual: number | null
  ativo: boolean | null
  items: BundleItem[]
  created_at: string
}

interface Produto {
  id: string
  sku: string
  nome: string
  preco: number | null
  estoque: number | null
}

export default function KitsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  // Form
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [sku, setSku] = useState('')
  const [precoVenda, setPrecoVenda] = useState(0)
  const [itens, setItens] = useState<{ product_id: string; quantidade: number }[]>([])
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch('/api/kits').then(r => r.json()).then(j => { if (j.success) setBundles(j.data); setLoading(false) })
  }

  useEffect(load, [])

  useEffect(() => {
    if (open && produtos.length === 0) {
      fetch('/api/products?limit=500&orderBy=nome&order=asc').then(r => r.json()).then(j => {
        if (j.success) setProdutos(j.data || [])
      })
    }
  }, [open])

  function abrirNovo() {
    setEditId(null)
    setNome(''); setDescricao(''); setSku(''); setPrecoVenda(0)
    setItens([])
    setOpen(true)
  }

  function adicionarItem(product_id: string) {
    if (itens.find(i => i.product_id === product_id)) return
    setItens([...itens, { product_id, quantidade: 1 }])
  }

  function removerItem(product_id: string) {
    setItens(itens.filter(i => i.product_id !== product_id))
  }

  function atualizarQtd(product_id: string, qtd: number) {
    setItens(itens.map(i => i.product_id === product_id ? { ...i, quantidade: qtd } : i))
  }

  // Calcular preview
  let custoPrev = 0
  let estoquePrev = Infinity
  for (const it of itens) {
    const p = produtos.find(p => p.id === it.product_id)
    if (p?.preco) {
      // usar custo = 50% do preço como estimativa (em produção pegar mlPrice.custo)
      custoPrev += (p.preco * 0.5) * it.quantidade
    }
    if (p?.estoque !== null && p?.estoque !== undefined) {
      const possivel = Math.floor(p.estoque / it.quantidade)
      if (possivel < estoquePrev) estoquePrev = possivel
    }
  }
  if (estoquePrev === Infinity) estoquePrev = 0
  const margemPrev = precoVenda > 0 ? ((precoVenda - custoPrev) / precoVenda) * 100 : 0
  const lucroPrev = precoVenda - custoPrev

  async function salvar() {
    if (!nome) return alert('Nome obrigatório')
    if (itens.length === 0) return alert('Adicione ao menos 1 item')
    if (precoVenda <= 0) return alert('Preço de venda obrigatório')

    setSalvando(true)
    try {
      const res = await apiFetch('/api/kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao, sku, preco_venda: precoVenda, items: itens }),
      })
      const j = await res.json()
      if (j.success) {
        alert(`✅ ${j.message}`)
        setOpen(false)
        load()
      } else {
        alert('❌ ' + j.error)
      }
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    if (!confirm('Remover este kit?')) return
    await apiFetch(`/api/kits?id=${id}`, { method: 'DELETE' })
    load()
  }

  if (status === 'loading' || loading) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  const produtosFiltrados = produtos.filter(p =>
    !busca || p.sku.toLowerCase().includes(busca.toLowerCase()) || p.nome.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📦 Kits / Bundles</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Crie produtos compostos por N itens. Estoque é virtual (calculado a partir dos componentes).</div>
          </div>
          <button onClick={abrirNovo} style={{ padding: '12px 24px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            + Novo Kit
          </button>
        </div>

        {/* Lista de Kits */}
        {bundles.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 60, textAlign: 'center', color: '#7070a0' }}>
            Nenhum kit cadastrado. Clique em "+ Novo Kit".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
            {bundles.map(b => {
              const margem = Number(b.margem_pct || 0)
              const margemCor = margem > 30 ? '#22c55e' : margem > 15 ? '#eab308' : '#ef4444'
              return (
                <div key={b.id} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1em' }}>📦 {b.nome}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 2 }}>SKU: {b.sku}</div>
                      {b.descricao && <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 4 }}>{b.descricao}</div>}
                    </div>
                    <button onClick={() => remover(b.id)} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, cursor: 'pointer', fontSize: '0.75em' }}>
                      🗑️
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10, padding: 8, background: '#0a0a1a', borderRadius: 6 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#7070a0', fontSize: '0.65em' }}>Preço</div>
                      <div style={{ color: '#a78bfa', fontWeight: 700 }}>R$ {Number(b.preco_venda || 0).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#7070a0', fontSize: '0.65em' }}>Custo</div>
                      <div style={{ color: '#b0b0cc', fontWeight: 600 }}>R$ {Number(b.custo_total || 0).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#7070a0', fontSize: '0.65em' }}>Margem</div>
                      <div style={{ color: margemCor, fontWeight: 700 }}>{margem.toFixed(1)}%</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#7070a0', fontSize: '0.7em', marginBottom: 4 }}>📦 {b.items.length} componentes • 🏷️ Estoque virtual: {b.estoque_virtual || 0}</div>
                    <div style={{ maxHeight: 100, overflow: 'auto', background: '#0a0a1a', borderRadius: 4, padding: 6 }}>
                      {b.items.map(item => (
                        <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#b0b0cc', padding: 2 }}>
                          <span>{item.quantidade}x {item.products?.sku}</span>
                          <span style={{ color: '#7070a0' }}>est: {item.products?.inventory?.quantidade_atual || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de Criação */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, maxWidth: 1100, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#a78bfa' }}>📦 Novo Kit</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#b0b0cc', cursor: 'pointer', fontSize: '1.5em' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Nome do Kit *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Kit Verão 5 perfumes" style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>SKU</label>
                <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="auto" style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Preço de Venda *</label>
                <input type="number" value={precoVenda} onChange={(e) => setPrecoVenda(parseFloat(e.target.value) || 0)} step="0.01" style={inputStyle} />
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Descrição</label>
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do kit" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Lista de produtos disponíveis */}
              <div>
                <h4 style={{ color: '#a78bfa', fontSize: '0.9em', marginBottom: 8 }}>🔍 Adicionar Componentes</h4>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou nome..." style={{ ...inputStyle, marginBottom: 8 }} />
                <div style={{ maxHeight: 300, overflow: 'auto', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 6, padding: 6 }}>
                  {produtosFiltrados.slice(0, 40).map(p => (
                    <div key={p.id} onClick={() => adicionarItem(p.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, borderRadius: 4, cursor: 'pointer', marginBottom: 2, fontSize: '0.85em' }}>
                      <div>
                        <div style={{ color: '#d0c0ff' }}>{p.sku}</div>
                        <div style={{ color: '#7070a0', fontSize: '0.85em' }}>{p.nome}</div>
                      </div>
                      <div style={{ color: '#22c55e' }}>R$ {Number(p.preco || 0).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Itens selecionados */}
              <div>
                <h4 style={{ color: '#22c55e', fontSize: '0.9em', marginBottom: 8 }}>📋 Componentes do Kit ({itens.length})</h4>
                {itens.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#7070a0', background: '#0a0a1a', borderRadius: 6 }}>
                    Nenhum componente adicionado
                  </div>
                ) : (
                  <div style={{ background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 6, padding: 6, maxHeight: 300, overflow: 'auto' }}>
                    {itens.map(it => {
                      const p = produtos.find(p => p.id === it.product_id)
                      return (
                        <div key={it.product_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#12122a', borderRadius: 4, marginBottom: 4 }}>
                          <input type="number" min="1" value={it.quantidade} onChange={(e) => atualizarQtd(it.product_id, parseInt(e.target.value) || 1)} style={{ width: 50, padding: '4px 6px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#d0c0ff', fontSize: '0.85em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.sku}</div>
                            <div style={{ color: '#7070a0', fontSize: '0.7em' }}>est: {p?.estoque || 0}</div>
                          </div>
                          <button onClick={() => removerItem(it.product_id)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', borderRadius: 3, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            {itens.length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div>
                    <div style={{ color: '#7070a0', fontSize: '0.7em' }}>💵 Preço</div>
                    <div style={{ color: '#a78bfa', fontSize: '1.1em', fontWeight: 700 }}>R$ {precoVenda.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#7070a0', fontSize: '0.7em' }}>💰 Custo</div>
                    <div style={{ color: '#b0b0cc', fontSize: '1em', fontWeight: 600 }}>R$ {custoPrev.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#7070a0', fontSize: '0.7em' }}>📊 Margem</div>
                    <div style={{ color: margemPrev > 30 ? '#22c55e' : margemPrev > 15 ? '#eab308' : '#ef4444', fontSize: '1.1em', fontWeight: 700 }}>
                      {margemPrev.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#7070a0', fontSize: '0.7em' }}>📦 Estoque Virtual</div>
                    <div style={{ color: '#60a5fa', fontSize: '1.1em', fontWeight: 700 }}>{estoquePrev} un.</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={salvar} disabled={salvando || itens.length === 0} style={{ flex: 1, padding: '12px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 700, opacity: salvando || itens.length === 0 ? 0.5 : 1 }}>
                {salvando ? '⏳ Criando...' : `✅ Criar Kit (${itens.length} componentes)`}
              </button>
              <button onClick={() => setOpen(false)} style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }
