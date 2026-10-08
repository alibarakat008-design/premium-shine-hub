'use client'

/**
 * /admin/catalogo-produtos
 *
 * Catálogo visual de produtos por marca, com:
 *  - Tela 1: Cards de marcas com contador "X/Y" (anunciados/total)
 *  - Tela 2: Grid de produtos da marca com foto, OLF, VOL, EAN, CUSTO + checkmark verde se anunciado
 *
 * Multi-tenant: filtra por company_id do cookie
 * Visual: usa CSS variables (--psh-*) do globals.css (NÃO Tailwind)
 */

import { useEffect, useState, useCallback } from 'react'
import OrigemBadge from '@/app/components/OrigemBadge'

type Marca = {
  marca_id: string
  marca_nome: string
  marca_logo: string | null
  total: number
  com_foto: number
  com_ean: number
  com_volume: number
  com_custo: number
  anunciados: number
}

type Produto = {
  product_id: string
  sku: string
  nome: string
  ean: string | null
  volume: string | null
  foto: string | null
  link_ml?: string | null
  ativo: boolean
  destaque: boolean
  publicado_site: boolean
  publicado_shopee: boolean
  marca_nome: string
  marca_id: string
  custo: number
  preco_venda: number
  estoque: number
  listings_count: number
  anunciado: boolean
  marcado?: boolean
  marcado_em?: string | null
  marcado_por?: string | null
  olfativa: string
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ============== Style helpers ==============
const cardBase = {
  background: 'var(--psh-bg-card)',
  border: '1px solid var(--psh-border-primary)',
  borderRadius: 12,
  padding: 16,
}
const cardHover = {
  ...cardBase,
  cursor: 'pointer' as const,
  transition: 'border-color 0.15s, transform 0.15s',
}

type View = 'marcas' | 'produtos' | 'estoque' | 'custos'

export default function CatalogoProdutosPage() {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [marcaSelecionada, setMarcaSelecionada] = useState<Marca | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterAnunciado, setFilterAnunciado] = useState<'todos' | 'anunciados' | 'faltam' | 'marcados'>('todos')
  const [toast, setToast] = useState<string | null>(null)
  const [plataformasEmpresa, setPlataformasEmpresa] = useState<string[]>([])
  const [view, setView] = useState<View>('marcas')
  const [estoque, setEstoque] = useState<any[]>([])
  const [statsEstoque, setStatsEstoque] = useState<any>(null)
  const [loadingEstoque, setLoadingEstoque] = useState(false)
  const [auth, setAuth] = useState('')
  const [custoLabel, setCustoLabel] = useState('LIURA')
  const [custoMarkup, setCustoMarkup] = useState(1.0)
  const [totalEstoqueQtd, setTotalEstoqueQtd] = useState(0)
  const [totalEstoqueValor, setTotalEstoqueValor] = useState(0)
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('psh_basic_auth') : ''
    setAuth(stored || 'Basic ' + btoa('premium:shine2026'))
  }, [])

  // Carrega plataformas da empresa ativa (pra badge)
  useEffect(() => {
    fetch('/api/admin/companies', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.active_company) {
          setPlataformasEmpresa(j.active_company.plataformas || [])
        } else if (j.ok) {
          // Tenta achar a empresa ativa pelo cookie psh_active_company
          const cnpjMatch = (j.companies || []).find(c => c.id === (document.cookie.match(/psh_active_company=([^;]+)/) || [])[1])
          setPlataformasEmpresa(cnpjMatch?.plataformas || [])
        }
      }).catch(() => {})
  }, [])

  const loadMarcas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/brands-list?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setMarcas(j.marcas || [])
      if (j.custo_label) setCustoLabel(j.custo_label)
      if (j.custo_markup) setCustoMarkup(j.custo_markup)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadEstoque = useCallback(async () => {
    setLoadingEstoque(true)
    try {
      const r = await fetch(`/api/inventory?action=relatorio&_t=${Date.now()}`, {
        headers: { Authorization: auth }
      })
      const j = await r.json()
      if (j.ok) {
        setEstoque(j.relatorio || [])
        const totais = (j.relatorio || []).reduce((acc: any, e: any) => {
          acc.total_skus += e.total_skus
          acc.total_pecas += e.total_pecas
          acc.skus_estoque_baixo += e.skus_estoque_baixo
          return acc
        }, { total_skus: 0, total_pecas: 0, skus_estoque_baixo: 0 })
        setStatsEstoque(totais)
      }
    } catch {}
    setLoadingEstoque(false)
  }, [auth])

  const loadProdutos = useCallback(async (marcaId: string) => {
    setLoading(true)
    setError(null)
    setTotalEstoqueQtd(0)
    setTotalEstoqueValor(0)
    try {
      const isTudo = marcaId === 'TUDO'
      const url = isTudo
        ? `/api/admin/produtos-all?_=${Date.now()}`
        : `/api/admin/produtos-by-marca?marca_id=${marcaId}&_=${Date.now()}`
      const r = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setProdutos(j.produtos || [])
      if (j.custo_label) setCustoLabel(j.custo_label)
      if (j.custo_markup) setCustoMarkup(j.custo_markup)
      if (isTudo) {
        setTotalEstoqueQtd(j.total_estoque_qtd || 0)
        setTotalEstoqueValor(j.total_estoque_valor || 0)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMarcas() }, [loadMarcas])

  const abrirMarca = (m: Marca) => {
    setMarcaSelecionada(m)
    setSearch('')
    setFilterAnunciado('todos')
    loadProdutos(m.marca_id)
  }

  const voltar = () => {
    setMarcaSelecionada(null)
    setProdutos([])
    setSearch('')
    setFilterAnunciado('todos')
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const toggleMarcado = async (productId: string, current: boolean) => {
    const novoValor = !current
    // Otimista: atualiza local primeiro
    setProdutos(prev => prev.map(p =>
      p.product_id === productId
        ? { ...p, marcado: novoValor, marcado_em: novoValor ? new Date().toISOString() : null }
        : p
    ))
    // Toast rápido
    showToast(novoValor ? '✅ Marcado como anunciado!' : '⚪ Marcado removido')

    try {
      const r = await fetch('/api/admin/products/toggle-marcado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product_id: productId, marcado: novoValor, user_email: 'admin@premiumshine.com.br' }),
      })
      const j = await r.json()
      if (!j.ok) {
        // Reverte
        setProdutos(prev => prev.map(p =>
          p.product_id === productId ? { ...p, marcado: current } : p
        ))
        showToast('❌ Erro: ' + j.error)
      }
    } catch (e: any) {
      setProdutos(prev => prev.map(p =>
        p.product_id === productId ? { ...p, marcado: current } : p
      ))
      showToast('❌ Erro de conexão')
    }
  }

  // ============== TELA 2: Produtos da marca (só se aba marcas/produtos) ==============
  if (marcaSelecionada && (view === 'marcas' || view === 'produtos')) {
    const filtered = produtos.filter(p => {
      if (search) {
        const t = search.toLowerCase()
        if (!p.sku.toLowerCase().includes(t) && !p.nome.toLowerCase().includes(t) && !(p.ean || '').includes(t)) return false
      }
      if (filterAnunciado === 'anunciados' && !p.anunciado) return false
      if (filterAnunciado === 'faltam' && p.anunciado) return false
      if (filterAnunciado === 'marcados' && !p.marcado) return false
      return true
    })
    const totalAnunciados = produtos.filter(p => p.anunciado).length
    const totalMarcados = produtos.filter(p => p.marcado).length

    return (
      <div style={{ padding: 24, minHeight: '100vh', background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            onClick={voltar}
            style={{
              padding: '8px 16px',
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 8,
              color: 'var(--psh-text-primary)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ← Voltar às marcas
          </button>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
              {marcaSelecionada.marca_nome === 'TUDO' ? '📦 TUDO — Todos os Produtos' : marcaSelecionada.marca_nome}
            </h1>
            <p style={{ color: 'var(--psh-text-tertiary)', fontSize: 13, margin: '4px 0 0 0' }}>
              {produtos.length} produtos · {totalAnunciados} anunciados · {totalMarcados} marcados · {marcaSelecionada.com_foto} com foto
            </p>
            {marcaSelecionada.marca_nome === 'TUDO' && totalEstoqueQtd > 0 && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--psh-text-tertiary)' }}>📦 Estoque total</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#60a5fa' }}>{totalEstoqueQtd.toLocaleString('pt-BR')} un</span>
                </div>
                <div style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--psh-text-tertiary)' }}>💰 Valor em estoque</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>R$ {fmt(totalEstoqueValor)}</span>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--psh-text-tertiary)' }}>❌ Faltam anunciar</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#f87171' }}>{produtos.length - totalAnunciados}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar por SKU, nome ou EAN..."
            style={{
              flex: 1, minWidth: 220,
              padding: '10px 14px',
              background: 'var(--psh-bg-input)',
              border: '1px solid var(--psh-border-input)',
              borderRadius: 8,
              color: 'var(--psh-text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {(['todos', 'anunciados', 'faltam', 'marcados'] as const).map(f => {
            const isActive = filterAnunciado === f
            const labels: Record<typeof f, string> = {
              todos: `Todos (${produtos.length})`,
              anunciados: `✅ Anunciados (${totalAnunciados})`,
              faltam: `❌ Faltam (${produtos.length - totalAnunciados})`,
              marcados: `🔵 Marcados (${totalMarcados})`,
            }
            const activeColor = f === 'anunciados' ? '#4ade80' : f === 'faltam' ? '#fca5a5' : f === 'marcados' ? '#60a5fa' : 'var(--psh-text-primary)'
            const activeBg = f === 'anunciados' ? 'rgba(74,222,128,0.15)' : f === 'faltam' ? 'rgba(252,165,165,0.15)' : f === 'marcados' ? 'rgba(96,165,250,0.15)' : 'var(--psh-hover-bg)'
            return (
              <button
                key={f}
                onClick={() => setFilterAnunciado(f)}
                style={{
                  padding: '8px 14px',
                  background: isActive ? activeBg : 'var(--psh-bg-secondary)',
                  border: `1px solid ${isActive ? activeColor : 'var(--psh-border-primary)'}`,
                  borderRadius: 8,
                  color: isActive ? activeColor : 'var(--psh-text-secondary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {labels[f]}
              </button>
            )
          })}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--psh-text-tertiary)' }}>Carregando produtos...</div>}
        {error && (
          <div style={{ background: 'var(--psh-error-bg)', border: '1px solid var(--psh-error-border)', color: 'var(--psh-error-text)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            ❌ {error}
          </div>
        )}

        {/* Grid de produtos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {filtered.map(p => <ProdutoCard key={p.product_id} p={p} onToggleMarcado={toggleMarcado} onCopy={showToast} plataformas={plataformasEmpresa} custoMarkup={custoMarkup} custoLabel={custoLabel} showBrand={marcaSelecionada?.marca_nome === 'TUDO'} />)}
        </div>

        {/* toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#22c55e',
            color: '#000',
            padding: '12px 24px',
            borderRadius: 30,
            fontSize: 14,
            fontWeight: 700,
            zIndex: 9999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            {toast}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--psh-text-tertiary)' }}>Nenhum produto neste filtro.</div>
        )}
      </div>
    )
  }

  // ============== TELA 1: Catálogo de marcas ==============
  const totalProdutos = marcas.reduce((a, m) => a + m.total, 0)
  const totalAnunciados = marcas.reduce((a, m) => a + m.anunciados, 0)
  const totalComFoto = marcas.reduce((a, m) => a + m.com_foto, 0)
  const totalSemAnunciar = totalProdutos - totalAnunciados

  return (
    <div style={{ padding: 24, minHeight: '100vh', background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
      {/* Banner de empresa (só se não for LIURA) */}
      {custoLabel !== 'LIURA' && (
        <div style={{
          background: 'linear-gradient(90deg, #1e40af, #3b82f6)',
          borderRadius: 10,
          padding: '10px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: 'white',
          fontWeight: 600,
        }}>
          <span style={{ fontSize: 18 }}>🏪</span>
          <span>Catálogo da <strong>{custoLabel}</strong></span>
          <span style={{ background: '#22c55e', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            +10% no custo
          </span>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: custoLabel !== 'LIURA' ? 0 : 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fbbf24, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🛍️ Catálogo de Produtos
          </h1>
          <p style={{ color: 'var(--psh-text-tertiary)', fontSize: 13, margin: '4px 0 0 0' }}>
            Visualize todas as marcas e seus produtos com status de anúncio
          </p>
        </div>
        <button
          onClick={loadMarcas}
          style={{
            padding: '8px 16px',
            background: 'var(--psh-bg-secondary)',
            border: '1px solid var(--psh-border-primary)',
            borderRadius: 8,
            color: 'var(--psh-text-primary)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--psh-border-primary)', overflowX: 'auto' }}>
        {[
          { k: 'marcas', label: '🏪 Marcas' },
          { k: 'produtos', label: '📦 Produtos' },
          { k: 'estoque', label: '📊 Estoque' },
          { k: 'custos', label: '💰 Custos' },
        ].map(t => (
          <button key={t.k} onClick={() => { setView(t.k as View); if (t.k === 'estoque') loadEstoque() }} style={{
            padding: '10px 20px', background: 'transparent',
            color: view === t.k ? '#fbbf24' : 'var(--psh-text-tertiary)',
            border: 'none', borderBottom: view === t.k ? '2px solid #fbbf24' : '2px solid transparent',
            cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap',
            fontWeight: view === t.k ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* CONTEÚDO POR ABA */}
      {view === 'estoque' && (
        <EstoqueTab auth={auth} estoque={estoque} stats={statsEstoque} loading={loadingEstoque} />
      )}
      {view === 'custos' && (
        <CustosTab auth={auth} />
      )}
      {(view === 'marcas' || view === 'produtos') && (
        <>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 32 }}>
        <StatCard label="Marcas" value={marcas.length} color="#fbbf24" />
        <StatCard label="Produtos" value={totalProdutos} color="#22d3ee" />
        <StatCard label="Anunciados" value={`${totalAnunciados} / ${totalProdutos}`} color="#4ade80" sub={`${totalSemAnunciar} faltam`} />
        <StatCard label="Com foto" value={`${totalComFoto} / ${totalProdutos}`} color="#a78bfa" />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--psh-text-tertiary)' }}>Carregando...</div>}
      {error && (
        <div style={{ background: 'var(--psh-error-bg)', border: '1px solid var(--psh-error-border)', color: 'var(--psh-error-text)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          ❌ {error}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--psh-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Catálogo de Marcas ({marcas.length})
      </h2>

      {/* Grid de marcas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {/* Card TUDO — visão geral de todos os produtos */}
        <button
          onClick={() => abrirMarca({ marca_id: 'TUDO', marca_nome: 'TUDO', marca_logo: null, total: totalProdutos, com_foto: totalComFoto, com_ean: 0, com_volume: 0, com_custo: 0, anunciados: totalAnunciados } as Marca)}
          style={{
            ...cardHover,
            padding: 18,
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
            border: '1px solid rgba(139,92,246,0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#a78bfa'
            e.currentTarget.style.transform = 'translateY(-3px)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(139,92,246,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 }}>
              ALL
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TUDO
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#22d3ee', lineHeight: 1, marginTop: 4 }}>
            {totalAnunciados}
            <span style={{ fontSize: 16, color: 'var(--psh-text-tertiary)', fontWeight: 500 }}> / {totalProdutos}</span>
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--psh-bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${totalProdutos > 0 ? Math.round((totalAnunciados / totalProdutos) * 100) : 0}%`, height: '100%', background: '#22d3ee', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--psh-text-tertiary)' }}>
            {totalProdutos - totalAnunciados} faltam ser anunciados
          </div>
        </button>

        {marcas.map(m => {
          const pct = m.total > 0 ? Math.round((m.anunciados / m.total) * 100) : 0
          const barColor = pct === 100 ? '#22c55e' : pct > 50 ? '#fbbf24' : pct > 0 ? '#fb923c' : '#6b7280'
          return (
            <button
              key={m.marca_id}
              onClick={() => abrirMarca(m)}
              style={{
                ...cardHover,
                padding: 18,
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#fbbf24'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(251,191,36,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--psh-border-primary)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* Logo + Nome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {m.marca_logo ? (
                  <img src={m.marca_logo} alt={m.marca_nome} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 }}>
                    {m.marca_nome.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={m.marca_nome}>
                  {m.marca_nome}
                </div>
              </div>

              {/* Contador grande */}
              <div style={{ fontSize: 32, fontWeight: 800, color: m.anunciados > 0 ? '#4ade80' : 'var(--psh-text-muted)', lineHeight: 1, marginTop: 4 }}>
                {m.anunciados}
                <span style={{ fontSize: 16, color: 'var(--psh-text-tertiary)', fontWeight: 500 }}> / {m.total}</span>
              </div>

              {/* Barra de progresso */}
              <div style={{ width: '100%', height: 6, background: 'var(--psh-bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--psh-text-tertiary)' }}>
                <span>📸 {m.com_foto}</span>
                <span>📊 {m.com_ean}</span>
                <span>💰 {m.com_custo}</span>
                <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
              </div>
            </button>
          )
        })}
      </div>

      {marcas.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--psh-text-tertiary)' }}>
          Nenhuma marca com produtos cadastrados.
        </div>
      )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ ...cardBase, padding: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--psh-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--psh-text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function ProdutoCard({ p, onToggleMarcado, onCopy, plataformas, custoMarkup = 1, custoLabel = 'LIURA', showBrand = false }: { p: Produto; onToggleMarcado: (id: string, current: boolean) => void; onCopy: (msg: string) => void; plataformas?: string[]; custoMarkup?: number; custoLabel?: string; showBrand?: boolean }) {
  const announced = p.anunciado
  const checked = p.marcado || false
  const Wrapper: any = p.link_ml ? 'a' : 'div'
  const wrapperProps: any = p.link_ml
    ? { href: p.link_ml, target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit', display: 'block' } }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        ...(wrapperProps.style || {}),
        position: 'relative',
        background: 'var(--psh-bg-card)',
        border: `1px solid ${checked ? '#22c55e' : announced ? '#14532d' : 'var(--psh-border-primary)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        cursor: p.link_ml ? 'pointer' : 'default',
      }}
      onMouseEnter={(e: any) => {
        e.currentTarget.style.borderColor = '#fbbf24'
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(251,191,36,0.12)'
      }}
      onMouseLeave={(e: any) => {
        const target = e.currentTarget
        target.style.borderColor = checked ? '#22c55e' : announced ? '#14532d' : 'var(--psh-border-primary)'
        target.style.transform = 'translateY(0)'
        target.style.boxShadow = 'none'
      }}
    >
      {/* Checkmark verde "anunciado real" (do ML) — canto direito */}
      {announced && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            width: 30,
            height: 30,
            background: '#22c55e',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 16,
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(34,197,94,0.4)',
          }}
          title="Anunciado no Mercado Livre"
        >
          ✓
        </div>
      )}

      {/* Círculo clicável "marcado" — canto esquerdo */}
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleMarcado(p.product_id, checked)
        }}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 11,
          width: 32,
          height: 32,
          background: checked ? '#22c55e' : 'rgba(0,0,0,0.6)',
          border: checked ? '2.5px solid #22c55e' : '2.5px solid rgba(255,255,255,0.5)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.15s',
          boxShadow: checked ? '0 2px 8px rgba(34,197,94,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
        }}
        title={checked ? `Marcado por ${p.marcado_por || 'sistema'}${p.marcado_em ? ' em ' + new Date(p.marcado_em).toLocaleDateString('pt-BR') : ''} — clique para desmarcar` : 'Clique para marcar como anunciado'}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        )}
      </div>

      {/* Badge de origem (plataforma da empresa ativa) — canto superior centro */}
      {plataformas && plataformas.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 11,
            display: 'flex',
            gap: 4,
          }}
        >
          {plataformas.slice(0, 3).map(plat => (
            <OrigemBadge key={plat} origem={plat} size="xs" />
          ))}
        </div>
      )}

      {/* Foto */}
      <div style={{ aspectRatio: '1 / 1', background: 'var(--psh-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {p.foto ? (
          <img
            src={p.foto + (p.foto.startsWith('http') ? `&v=${Date.now()}` : `?v=${Date.now()}`)}
            alt={p.nome}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{ color: 'var(--psh-text-muted)', fontSize: 48 }}>📦</div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: 12 }}>
        {showBrand && p.marca_nome && (
          <div style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            {p.marca_nome}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--psh-text-primary)',
            textTransform: 'uppercase',
            lineHeight: 1.2,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '2.4em',
          }}
          title={p.nome}
        >
          {p.nome}
        </div>

        {/* Tabela estilo planilha */}
        <div style={{ fontSize: 10, borderTop: '1px solid var(--psh-border-primary)', paddingTop: 6 }}>
          {p.olfativa && (
            <Row label="OLF." value={p.olfativa} valueColor="var(--psh-text-secondary)" copyable onCopy={onCopy} />
          )}
          {p.volume && (
            <Row label="VOL." value={p.volume} valueColor="var(--psh-text-primary)" mono copyable onCopy={onCopy} />
          )}
          {p.ean && (
            <Row label="EAN" value={p.ean} valueColor="var(--psh-text-primary)" mono copyable onCopy={onCopy} />
          )}
          {p.custo > 0 && (
            <Row
              label="CUSTO"
              value={custoMarkup > 1 ? `R$ ${fmt(p.custo)}  +${((custoMarkup - 1) * 100).toFixed(0)}%` : `R$ ${fmt(p.custo)}`}
              valueColor={custoMarkup > 1 ? '#22c55e' : '#fbbf24'}
              mono
            />
          )}
          {p.estoque > 0 && (
            <Row label="ESTOQUE" value={p.estoque.toLocaleString('pt-BR')} valueColor={p.estoque < 5 ? '#fca5a5' : '#86efac'} mono />
          )}
        </div>

        {/* Footer mini */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTop: '1px solid var(--psh-border-secondary)' }}>
          <div
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              try {
                await navigator.clipboard.writeText(p.sku)
                onCopy(`📋 SKU copiado: ${p.sku}`)
              } catch {}
            }}
            style={{ fontSize: 9, color: 'var(--psh-text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130, cursor: 'pointer' }}
            title={`Clique para copiar SKU: ${p.sku}`}
          >
            {p.sku}
          </div>
          {p.listings_count > 0 && (
            <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>
              {p.listings_count} ML
            </div>
          )}
        </div>
      </div>
    </Wrapper>
  )
}

// ====== ABAS ESTOQUE E CUSTOS ======

function EstoqueTab({ auth, estoque, stats, loading }: any) {
  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Carregando estoque...</div>
  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Sem dados de estoque</div>
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--psh-bg-tertiary, #f3f4f6)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>SKUs com estoque</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa', marginTop: 4 }}>{stats.total_skus}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-tertiary, #f3f4f6)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Peças totais</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>{(stats.total_pecas || 0).toLocaleString('pt-BR')}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-tertiary, #f3f4f6)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Estoque baixo</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fca5a5', marginTop: 4 }}>{stats.skus_estoque_baixo}</div>
        </div>
      </div>
      <div style={{ background: 'var(--psh-bg-tertiary, #f3f4f6)', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #ffffff)' }}>
              <th style={{ padding: 10, textAlign: 'left' }}>Empresa</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Plataforma</th>
              <th style={{ padding: 10, textAlign: 'right' }}>SKUs</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Peças</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Baixo</th>
            </tr>
          </thead>
          <tbody>
            {estoque.map((e: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--psh-border-primary, #e5e7eb)' }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{e.empresa}</td>
                <td style={{ padding: 8 }}>{e.plataforma}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{e.total_skus}</td>
                <td style={{ padding: 8, textAlign: 'right', color: '#86efac' }}>{(e.total_pecas || 0).toLocaleString('pt-BR')}</td>
                <td style={{ padding: 8, textAlign: 'right', color: e.skus_estoque_baixo > 0 ? '#fca5a5' : '#22c55e' }}>{e.skus_estoque_baixo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CustosTab({ auth }: { auth: string }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    fetch('/api/inventory?action=relatorio&_t=' + Date.now(), { headers: { Authorization: auth } })
      .then(r => r.json())
      .then(j => setData(j.relatorio || []))
      .catch(() => {})
  }, [auth])
  if (!data) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Carregando custos...</div>
  return (
    <div>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>Custo médio por empresa e plataforma</p>
      <div style={{ background: 'var(--psh-bg-tertiary, #f3f4f6)', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #ffffff)' }}>
              <th style={{ padding: 10, textAlign: 'left' }}>Empresa</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Plataforma</th>
              <th style={{ padding: 10, textAlign: 'right' }}>SKUs</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Custo médio</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e: any, i: number) => {
              const custoMedio = e.total_skus > 0 ? (e.total_minimo_desejado / e.total_skus) : 0
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--psh-border-primary, #e5e7eb)' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{e.empresa}</td>
                  <td style={{ padding: 8 }}>{e.plataforma}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{e.total_skus}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: '#fbbf24' }}>R$ {(custoMedio || 0).toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ label, value, valueColor, mono, copyable, onCopy }: { label: string; value: string; valueColor: string; mono?: boolean; copyable?: boolean; onCopy?: (msg: string) => void }) {
  const [copied, setCopied] = useState(false)
  const handleClick = async (e: React.MouseEvent) => {
    if (!copyable) return
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopy?.(`📋 ${label} copiado: ${value}`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      onCopy?.(`📋 ${label} copiado: ${value}`)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span style={{ color: 'var(--psh-text-tertiary)', fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span
        onClick={handleClick}
        style={{
          color: copied ? '#22c55e' : valueColor,
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: 10,
          fontWeight: 600,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
          cursor: copyable ? 'pointer' : 'default',
          padding: copyable ? '2px 4px' : 0,
          borderRadius: copyable ? 3 : 0,
          transition: 'color 0.15s, background 0.15s',
        }}
        title={copyable ? `Clique para copiar: ${value}` : value}
      >
        {copied ? '✓ copiado!' : value}
      </span>
    </div>
  )
}
