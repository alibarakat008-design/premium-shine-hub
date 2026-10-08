'use client'
import { useState, useEffect, useRef } from 'react'

/**
 * =====================================================
 * PÁGINA: Devolução
 * Caminho: app/admin/devolucao/page.tsx
 *
 * Área para colaboradores registrarem devoluções:
 * - EAN do produto (auto-preenche SKU)
 * - Número do pedido / venda
 * - Marketplace
 * - Empresa (selecionada pelo colaborador)
 * - Condição + Observação
 * =====================================================
 */

type Marketplace = 'ML' | 'Shopee' | 'B2B' | 'Físico' | 'Outro'
type Condicao = 'apto' | 'nao_apto'

interface Devolucao {
  id: string
  ean: string
  sku: string
  titulo: string
  quantidade: number
  pedido: string
  marketplace: Marketplace
  empresa: string
  empresaNome: string
  condicao: Condicao
  observacao: string
  data: string
  status: 'pendente' | 'processando' | 'devolvido' | 'cancelado'
}

interface Empresa {
  id: string
  nome_fantasia: string
  razao_social: string
  account_type: string
}

const STATUS_COLORS: Record<Devolucao['status'], { bg: string; color: string; label: string }> = {
  pendente:    { bg: '#f59e0b22', color: '#f59e0b', label: 'PENDENTE' },
  processando: { bg: '#6366f122', color: '#6366f1', label: 'PROCESSANDO' },
  devolvido:   { bg: '#22c55e22', color: '#22c55e', label: 'DEVOLVIDO' },
  cancelado:   { bg: '#ef444422', color: '#ef4444', label: 'CANCELADO' },
}

const ML_COLORS: Record<Marketplace, { bg: string; color: string }> = {
  ML:       { bg: '#fff60022', color: '#fff600' },
  Shopee:   { bg: '#ee4d2d22', color: '#ee4d2d' },
  B2B:      { bg: '#22c55e22', color: '#22c55e' },
  Físico:   { bg: '#a78bfa22', color: '#a78bfa' },
  Outro:    { bg: '#7070a022', color: '#7070a0' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#0a0a1a', border: '1px solid #2a2a4a',
  color: '#d0c0ff', borderRadius: 8, fontSize: 13,
  boxSizing: 'border-box',
}

export default function DevolucaoPage() {
  const [ean, setEan]           = useState('')
  const [sku, setSku]           = useState('')
  const [skuManual, setSkuManual] = useState(false) // true = usuário digitou SKU manualmente
  const [pedido, setPedido]     = useState('')
  const [marketplace, setMarketplace] = useState<Marketplace>('ML')
  const [empresa, setEmpresa]   = useState('')
  const [empresaNome, setEmpresaNome] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [quantidade, setQuantidade] = useState(1)
  const [condicao, setCondicao] = useState<Condicao>('apto')
  const [observacao, setObservacao] = useState('')
  const [devolucoes, setDevolucoes] = useState<Devolucao[]>([])
  const [toast, setToast]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<Devolucao['status'] | 'todas'>('todas')
  const [eanLoading, setEanLoading] = useState(false)

  const eanRef   = useRef<HTMLInputElement>(null)
  const skuRef   = useRef<HTMLInputElement>(null)
  const pedidoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    eanRef.current?.focus()
    // Carregar empresas
    fetch('/api/admin/empresas', {
      headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
    }).then(r => r.json()).then(d => {
      if (d.ok) setEmpresas(d.empresas || [])
    }).catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  // Busca produto por EAN e auto-preenche o SKU
  async function buscarPorEan(eanValue: string) {
    if (!eanValue.trim()) return
    setEanLoading(true)
    try {
      const res = await fetch(`/api/products?ean=${encodeURIComponent(eanValue.trim())}&limit=1`, {
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const data = await res.json()
      if (data.products && data.products.length > 0) {
        const prod = data.products[0]
        setSku(prod.sku || '')
        setSkuManual(false)
        showToast(`✅ SKU: ${prod.sku || '—'} (${prod.nome || 'sem nome'})`)
      } else {
        setSku('')
        setSkuManual(false)
        showToast('⚠️ Produto não encontrado para este EAN')
      }
    } catch {
      showToast('⚠️ Erro ao buscar EAN')
    } finally {
      setEanLoading(false)
    }
  }

  function adicionarDevolucao() {
    if (!ean.trim() && !sku.trim()) {
      showToast('⚠️ Preencha o EAN ou SKU')
      return
    }
    if (condicao === 'nao_apto' && !observacao.trim()) {
      showToast('⚠️ Observação obrigatória quando produto não está apto')
      return
    }
    const nova: Devolucao = {
      id: Date.now().toString(),
      ean: ean.trim(),
      sku: sku.trim(),
      titulo: '',
      quantidade,
      pedido: pedido.trim(),
      marketplace,
      empresa,
      empresaNome,
      condicao,
      observacao: observacao.trim(),
      data: new Date().toLocaleString('pt-BR'),
      status: 'pendente',
    }
    setDevolucoes(prev => [nova, ...prev])
    setEan('')
    setSku('')
    setSkuManual(false)
    setPedido('')
    setQuantidade(1)
    setMarketplace('ML')
    setEmpresa('')
    setEmpresaNome('')
    setCondicao('apto')
    setObservacao('')
    eanRef.current?.focus()
    showToast('✅ Devolução registrada')
  }

  function removerDevolucao(id: string) {
    setDevolucoes(prev => prev.filter(d => d.id !== id))
  }

  function atualizarStatus(id: string, status: Devolucao['status']) {
    setDevolucoes(prev => prev.map(d => d.id === id ? { ...d, status } : d))
  }

  const filtered = filter === 'todas'
    ? devolucoes
    : devolucoes.filter(d => d.status === filter)

  const counts: Record<string, number> = {
    todas: devolucoes.length,
    pendente: devolucoes.filter(d => d.status === 'pendente').length,
    processando: devolucoes.filter(d => d.status === 'processando').length,
    devolvido: devolucoes.filter(d => d.status === 'devolvido').length,
    cancelado: devolucoes.filter(d => d.status === 'cancelado').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>

      {/* HEADER */}
      <div style={{ maxWidth: 1100, margin: '0 auto', marginBottom: 20 }}>
        <h1 style={{ color: '#d0c0ff', fontSize: '1.6em', margin: 0 }}>↩️ Devolução</h1>
        <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>
          {counts.todas} item(s) · {counts.pendente} pendente(s)
        </p>
      </div>

      {/* FORMULÁRIO NOVA DEVOLUÇÃO */}
      <div style={{ maxWidth: 1100, margin: '0 auto', marginBottom: 20 }}>
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: '#a78bfa', fontSize: '1em', margin: '0 0 16px' }}>➕ Registrar Devolução</h2>

          {/* Linha 1: EAN + SKU + Pedido + Marketplace + Empresa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* EAN */}
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                📷 EAN / Código Barras
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={eanRef}
                  type="text"
                  value={ean}
                  onChange={e => { setEan(e.target.value); setSkuManual(false) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); buscarPorEan(ean) }
                    if (e.key === 'Tab') { e.preventDefault(); buscarPorEan(ean) }
                  }}
                  onBlur={() => { if (ean.trim()) buscarPorEan(ean) }}
                  placeholder="7891234567890"
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
                {eanLoading && (
                  <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#a78bfa' }}>⏳</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => buscarPorEan(ean)}
                style={{
                  marginTop: 4, width: '100%', padding: '5px',
                  background: '#6366f1', border: 'none', borderRadius: 6,
                  color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  opacity: eanLoading ? 0.6 : 1,
                }}
              >
                🔍 Buscar por EAN
              </button>
            </div>

            {/* SKU */}
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                🏷️ SKU {skuManual && <span style={{ color: '#f59e0b', fontSize: '0.65em' }}>(digitado)</span>}
              </label>
              <input
                ref={skuRef}
                type="text"
                value={sku}
                onChange={e => { setSku(e.target.value); setSkuManual(true) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); pedidoRef.current?.focus() }
                }}
                placeholder="ASAD-BOURBON-100ML"
                style={{
                  ...inputStyle,
                  background: sku && !skuManual ? '#0d1a0d' : '#0a0a1a',
                  borderColor: sku && !skuManual ? '#22c55e44' : '#2a2a4a',
                }}
              />
            </div>

            {/* Pedido */}
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                🔢 Nº Pedido / Venda
              </label>
              <input
                ref={pedidoRef}
                type="text"
                value={pedido}
                onChange={e => setPedido(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); adicionarDevolucao() }
                }}
                placeholder="MLB1234567890"
                style={inputStyle}
              />
            </div>

            {/* Marketplace */}
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                🛒 Marketplace
              </label>
              <select
                value={marketplace}
                onChange={e => setMarketplace(e.target.value as Marketplace)}
                style={{ ...inputStyle, padding: '10px 8px' }}
              >
                <option value="ML">ML (Mercado Livre)</option>
                <option value="Shopee">Shopee</option>
                <option value="B2B">B2B</option>
                <option value="Físico">Físico</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            {/* Empresa */}
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                🏢 Empresa
              </label>
              <select
                value={empresa}
                onChange={e => {
                  const sel = empresas.find(emp => emp.id === e.target.value)
                  setEmpresa(e.target.value)
                  setEmpresaNome(sel?.nome_fantasia || '')
                }}
                style={{ ...inputStyle, padding: '10px 8px' }}
              >
                <option value="">Selecionar empresa...</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nome_fantasia || emp.razao_social}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Condição + Qtd */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                🏷️ Condição do Produto
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCondicao('apto')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                    background: condicao === 'apto' ? '#22c55e' : '#1a1a3a',
                    color: condicao === 'apto' ? '#000' : '#22c55e',
                    border: condicao === 'apto' ? 'none' : '1px solid #22c55e44',
                  }}
                >✅ Apto para Revenda</button>
                <button
                  type="button"
                  onClick={() => setCondicao('nao_apto')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                    background: condicao === 'nao_apto' ? '#ef4444' : '#1a1a3a',
                    color: condicao === 'nao_apto' ? '#fff' : '#ef4444',
                    border: condicao === 'nao_apto' ? 'none' : '1px solid #ef444444',
                  }}
                >❌ Não Apto</button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
                📦 Qtd
              </label>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={e => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ ...inputStyle, padding: '10px 8px', textAlign: 'center', fontSize: 15 }}
              />
            </div>
          </div>

          {/* Observação */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#7070a0', fontSize: '0.72em', marginBottom: 4 }}>
              📝 Observação {condicao === 'nao_apto' && <span style={{ color: '#ef4444' }}>(obrigatório — motivo da não aptidão)</span>}
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder={condicao === 'nao_apto'
                ? 'Ex: embalagem violada, produto danificado, vidro trincado, prazo de validade vencido...'
                : 'Observação opcional...'}
              rows={2}
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0a0a1a', border: `1px solid ${condicao === 'nao_apto' && !observacao.trim() ? '#ef4444' : '#2a2a4a'}`,
                color: '#d0c0ff', borderRadius: 8, fontSize: 13,
                boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </div>

          <button
            onClick={adicionarDevolucao}
            style={{
              width: '100%', padding: '12px',
              background: condicao === 'nao_apto' ? '#ef4444' : '#22c55e',
              border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}
          >
            {condicao === 'nao_apto' ? '❌ Registrar Devolução (Não Apto)' : '✅ Registrar Devolução (Apto)'}
          </button>
        </div>
      </div>

      {/* FILTRO DE STATUS */}
      <div style={{ maxWidth: 1100, margin: '0 auto', marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['todas', 'pendente', 'processando', 'devolvido', 'cancelado'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              fontSize: 11, fontWeight: 700,
              background: filter === s
                ? (s === 'todas' ? '#6366f1' : STATUS_COLORS[s].bg)
                : '#1a1a3a',
              color: filter === s
                ? '#fff'
                : (s === 'todas' ? '#a78bfa' : STATUS_COLORS[s].color),
              border: filter === s ? 'none' : '1px solid #2a2a4a',
            }}
          >
            {s === 'todas' ? 'Todas' : STATUS_COLORS[s].label} ({counts[s]})
          </button>
        ))}
      </div>

      {/* LISTA DE DEVOLUÇÕES */}
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {filtered.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 40, textAlign: 'center', color: '#7070a0' }}>
            Nenhum item{filter !== 'todas' ? ` com status "${filter}"` : ''} encontrado
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(d => (
              <div key={d.id} style={{
                background: '#12122a',
                border: `1px solid ${d.condicao === 'nao_apto' ? '#ef444455' : '#2a2a4a'}`,
                borderRadius: 10,
                padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
                flexDirection: 'column',
              }}>
                {/* Linha 1: badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Status badge */}
                  <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: STATUS_COLORS[d.status].bg,
                    color: STATUS_COLORS[d.status].color,
                    whiteSpace: 'nowrap',
                  }}>
                    {STATUS_COLORS[d.status].label}
                  </span>

                  {/* Marketplace badge */}
                  <span style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: ML_COLORS[d.marketplace].bg,
                    color: ML_COLORS[d.marketplace].color,
                    whiteSpace: 'nowrap',
                  }}>
                    {d.marketplace}
                  </span>

                  {/* Empresa badge */}
                  {d.empresaNome && (
                    <span style={{
                      padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: '#fff60022', color: '#fff600',
                      whiteSpace: 'nowrap',
                    }}>
                      🏢 {d.empresaNome}
                    </span>
                  )}

                  {/* Condição badge */}
                  <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: d.condicao === 'apto' ? '#22c55e22' : '#ef444422',
                    color: d.condicao === 'apto' ? '#22c55e' : '#ef4444',
                    whiteSpace: 'nowrap',
                  }}>
                    {d.condicao === 'apto' ? '✅ APTO' : '❌ NÃO APTO'}
                  </span>

                  {/* Data + Qtd */}
                  <span style={{ color: '#4a4a7a', fontSize: 10, marginLeft: 'auto' }}>
                    {d.data} · Qtd: {d.quantidade}
                  </span>
                </div>

                {/* Linha 2: códigos */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {d.pedido && (
                    <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: 11 }}>
                      🔢 {d.pedido}
                    </span>
                  )}
                  {d.ean && (
                    <span style={{ fontFamily: 'monospace', color: '#a78bfa', fontSize: 11 }}>
                      📷 {d.ean}
                    </span>
                  )}
                  {d.sku && (
                    <span style={{ fontFamily: 'monospace', color: '#d0c0ff', fontSize: 11 }}>
                      🏷️ {d.sku}
                    </span>
                  )}
                </div>

                {/* Observação (se existir) */}
                {d.observacao && (
                  <div style={{
                    background: '#0a0a1a', borderRadius: 6, padding: '6px 10px',
                    borderLeft: '3px solid #ef4444',
                  }}>
                    <span style={{ color: '#7070a0', fontSize: 10, fontWeight: 700 }}>📝 OBS: </span>
                    <span style={{ color: '#d0c0ff', fontSize: 11 }}>{d.observacao}</span>
                  </div>
                )}

                {/* Linha 3: ações */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <select
                    value={d.status}
                    onChange={e => atualizarStatus(d.id, e.target.value as Devolucao['status'])}
                    style={{
                      padding: '4px 8px', background: '#0a0a1a',
                      border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6, fontSize: 11,
                    }}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="processando">Processando</option>
                    <option value="devolvido">Devolvido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  <button
                    onClick={() => removerDevolucao(d.id)}
                    title="Remover"
                    style={{
                      marginLeft: 'auto', padding: '4px 12px', borderRadius: 6,
                      background: '#ef444422', border: 'none', color: '#ef4444',
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    }}
                  >🗑️ Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', background: '#1f2937',
          color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
