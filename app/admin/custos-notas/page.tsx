'use client'

/**
 * /admin/custos-notas
 *
 * Página pra gerenciar NOTAS DE COMPRA (entrada de mercadoria).
 * Multi-tenant: parceiro vê SÓ as notas da própria empresa.
 *
 * Features:
 *   - Lista de notas (com filtros: status, fornecedor, período)
 *   - Criar nova nota (form com produtos da empresa)
 *   - Ver histórico de custos de cada produto (variação de preço entre notas)
 *   - Custo médio é recalculado automaticamente após criar nota
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Supplier { id: string; nome: string; cnpj?: string }
interface Product { id: string; sku: string; nome: string; custo_atual?: number | null }
interface Item { id?: string; product_id: string; sku: string; produto_nome: string; quantidade: number; custo_unitario: number | null; custo_total?: number | null }
interface Nota {
  id: string
  company_id: string
  supplier_id: string | null
  supplier?: { nome: string; cnpj?: string } | null
  status: string
  valor_total: number | null
  data_pedido: string | null
  previsao_entrega: string | null
  data_recebimento: string | null
  condicao_pagamento: string | null
  numero_nota_fiscal: string | null
  chave_acesso_nf: string | null
  observacoes: string | null
  created_at: string
  items: Item[]
}

const STATUS_COLOR: Record<string, string> = {
  sugerida: '#a78bfa',
  aprovada: '#60a5fa',
  enviada: '#fbbf24',
  recebida: '#10b981',
  cancelada: '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
  sugerida: 'Sugerida',
  aprovada: 'Aprovada',
  enviada: 'Enviada',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
}

export default function CustosNotasPage() {
  const router = useRouter()
  const [notas, setNotas] = useState<Nota[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [modalNova, setModalNova] = useState(false)
  const [modalDetalhes, setModalDetalhes] = useState<Nota | null>(null)
  const [modalHistorico, setModalHistorico] = useState<string | null>(null) // product_id
  const [historico, setHistorico] = useState<any[]>([])

  // Detecta se é parceiro (cookie psh_session_role) e pega company_id
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [isParceiro, setIsParceiro] = useState(false)

  useEffect(() => {
    const role = document.cookie.match(/psh_session_role=([^;]+)/)?.[1]
    const cid = document.cookie.match(/psh_(active_)?company=([^;]+)/)?.[2]
    setIsParceiro(role === 'parceiro')
    setCompanyId(cid || null)
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = isParceiro
        ? `/api/public/purchase-invoices?company_id=${companyId || ''}`
        : `/api/admin/purchase-invoices${companyId ? `?company_id=${companyId}` : ''}`
      const r = await apiFetch(url)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setNotas(j.notas || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, isParceiro])

  useEffect(() => { if (companyId) carregar() }, [companyId, carregar])

  const carregarSuppliers = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/suppliers' + (isParceiro ? '?public=1' : ''))
      if (r.ok) {
        const j = await r.json()
        setSuppliers(j.suppliers || j.data || [])
      }
    } catch {}
  }, [isParceiro])

  useEffect(() => { carregarSuppliers() }, [carregarSuppliers])

  const carregarProdutos = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await apiFetch(`/api/admin/meus-custos?company_id=${companyId}`)
      if (r.ok) {
        const j = await r.json()
        setProducts((j.produtos || j.data || []).map((p: any) => ({ id: p.product_id || p.id, sku: p.sku, nome: p.nome, custo_atual: p.custo })))
      }
    } catch {}
  }, [companyId])

  useEffect(() => { carregarProdutos() }, [carregarProdutos])

  const carregarHistorico = useCallback(async (productId: string) => {
    try {
      const r = await apiFetch(`/api/admin/product-cost-history?product_id=${productId}${companyId ? `&company_id=${companyId}` : ''}`)
      if (r.ok) {
        const j = await r.json()
        setHistorico(j.historico || [])
      }
    } catch {}
  }, [companyId])

  const notasFiltradas = useMemo(() => {
    let r = notas
    if (filtroStatus !== 'todos') r = r.filter(n => n.status === filtroStatus)
    if (busca) {
      const b = busca.toLowerCase()
      r = r.filter(n =>
        (n.numero_nota_fiscal || '').toLowerCase().includes(b) ||
        (n.supplier?.nome || '').toLowerCase().includes(b) ||
        (n.observacoes || '').toLowerCase().includes(b) ||
        (n.chave_acesso_nf || '').toLowerCase().includes(b)
      )
    }
    return r
  }, [notas, filtroStatus, busca])

  if (loading && notas.length === 0) {
    return <div style={{ padding: 40, color: 'var(--psh-text-secondary, #6b7280)' }}>Carregando notas de compra...</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--psh-text-primary)', margin: 0 }}>
            📋 Notas de Compra
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Cada nota atualiza o <b>custo médio</b> ponderado dos produtos automaticamente.
          </p>
        </div>
        <button
          onClick={() => setModalNova(true)}
          style={{
            padding: '12px 24px', background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'var(--psh-bg-primary, #fff)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          ➕ Nova Nota
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
        background: 'var(--psh-bg-secondary)', padding: 12, borderRadius: 12,
        border: '1px solid var(--psh-border)',
      }}>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--psh-border)',
            background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)', fontSize: 14, minWidth: 140,
          }}
        >
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          type="text"
          placeholder="🔍 Buscar por NF, fornecedor, chave..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--psh-border)', background: 'var(--psh-bg-primary)',
            color: 'var(--psh-text-primary)', fontSize: 14,
          }}
        />
        <span style={{ color: 'var(--psh-text-secondary)', fontSize: 13 }}>
          {notasFiltradas.length} de {notas.length} notas
        </span>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Lista de notas */}
      <div style={{ display: 'grid', gap: 12 }}>
        {notasFiltradas.map(n => (
          <div
            key={n.id}
            onClick={() => setModalDetalhes(n)}
            style={{
              background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 16, cursor: 'pointer',
              border: '1px solid var(--psh-border)', transition: 'all 0.15s',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#10b981')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--psh-border)')}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--psh-text-primary)', fontSize: 15 }}>
                {n.numero_nota_fiscal || `NF ${n.id.substring(0, 8)}`}
              </div>
              <div style={{ color: 'var(--psh-text-secondary)', fontSize: 12, marginTop: 2 }}>
                {n.supplier?.nome || 'Sem fornecedor'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>Data</div>
              <div style={{ color: 'var(--psh-text-primary)', fontSize: 13, fontWeight: 600 }}>
                {n.data_pedido ? new Date(n.data_pedido).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>Valor</div>
              <div style={{ color: 'var(--psh-text-primary)', fontSize: 14, fontWeight: 700 }}>
                R$ {n.valor_total?.toFixed(2) || '0,00'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>Itens</div>
              <div style={{ color: 'var(--psh-text-primary)', fontSize: 13, fontWeight: 600 }}>
                {n.items.length} produto{n.items.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div>
              <span style={{
                background: STATUS_COLOR[n.status] || '#94a3b8',
                color: 'var(--psh-bg-primary, #fff)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                {STATUS_LABEL[n.status] || n.status}
              </span>
            </div>
          </div>
        ))}
        {notasFiltradas.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)', background: 'var(--psh-bg-secondary)', borderRadius: 12, border: '1px dashed var(--psh-border)' }}>
            Nenhuma nota encontrada. Clique em "➕ Nova Nota" pra começar.
          </div>
        )}
      </div>

      {/* Modal Nova Nota */}
      {modalNova && (
        <NovaNotaModal
          companyId={companyId || ''}
          isParceiro={isParceiro}
          suppliers={suppliers}
          products={products}
          onClose={() => setModalNova(false)}
          onSave={() => { setModalNova(false); carregar() }}
        />
      )}

      {/* Modal Detalhes */}
      {modalDetalhes && (
        <DetalhesNotaModal
          nota={modalDetalhes}
          onClose={() => setModalDetalhes(null)}
          onShowHistorico={(productId) => {
            setModalDetalhes(null)
            setModalHistorico(productId)
            carregarHistorico(productId)
          }}
        />
      )}

      {/* Modal Histórico de Custos */}
      {modalHistorico && (
        <HistoricoCustoModal
          productId={modalHistorico}
          historico={historico}
          onClose={() => { setModalHistorico(null); setHistorico([]) }}
        />
      )}
    </div>
  )
}

/* ========== MODAL NOVA NOTA ========== */
function NovaNotaModal({ companyId, isParceiro, suppliers, products, onClose, onSave }: {
  companyId: string; isParceiro: boolean; suppliers: Supplier[]; products: Product[];
  onClose: () => void; onSave: () => void;
}) {
  const [supplierId, setSupplierId] = useState('')
  const [novoFornecedor, setNovoFornecedor] = useState('')
  const [numeroNF, setNumeroNF] = useState('')
  const [chaveNF, setChaveNF] = useState('')
  const [dataPedido, setDataPedido] = useState(new Date().toISOString().slice(0, 10))
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState('recebida')
  const [condicao, setCondicao] = useState('')
  const [obs, setObs] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [busca, setBusca] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [xmlUrl, setXmlUrl] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/admin/purchase-invoices/upload?company_id=${companyId}`, { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Erro no upload')
      setXmlUrl(j.url)
      setNomeArquivo(j.filename)
      // Se o XML foi parseado, preenche automático
      if (j.parsed?.chave_acesso_nf) setChaveNF(j.parsed.chave_acesso_nf)
      if (j.parsed?.numero_nota_fiscal) setNumeroNF(j.parsed.numero_nota_fiscal)
      if (j.parsed?.data_pedido) setDataPedido(j.parsed.data_pedido)
      if (j.parsed?.nome_emitente && !novoFornecedor) setNovoFornecedor(j.parsed.nome_emitente)
    } catch (e: any) {
      setError(`Erro no upload: ${e.message}`)
    }
    setUploadingFile(false)
  }

  const produtosFiltrados = useMemo(() => {
    if (!busca) return products.slice(0, 30)
    const b = busca.toLowerCase()
    return products.filter(p => p.sku?.toLowerCase().includes(b) || p.nome?.toLowerCase().includes(b)).slice(0, 30)
  }, [products, busca])

  const adicionarItem = (p: Product) => {
    if (items.find(i => i.product_id === p.id)) return
    setItems([...items, {
      product_id: p.id,
      sku: p.sku,
      produto_nome: p.nome,
      quantidade: 1,
      custo_unitario: p.custo_atual || null,
      custo_total: p.custo_atual || null,
    }])
    setBusca('')
  }

  const atualizarItem = (idx: number, campo: string, valor: any) => {
    const novos = [...items]
    ;(novos[idx] as any)[campo] = valor
    if (campo === 'quantidade' || campo === 'custo_unitario') {
      novos[idx].custo_total = Number(novos[idx].quantidade || 0) * Number(novos[idx].custo_unitario || 0)
    }
    setItems(novos)
  }

  const removerItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const valorTotal = items.reduce((s, i) => s + (i.custo_total || 0), 0)

  const salvar = async () => {
    if (!companyId) {
      setError('company_id não detectado')
      return
    }
    if (items.length === 0) {
      setError('Adicione pelo menos 1 item')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let supplier_id = supplierId
      if (novoFornecedor && !supplierId) {
        // Cria supplier novo
        const r = await apiFetch('/api/admin/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: novoFornecedor }),
        })
        const j = await r.json()
        if (j.ok) supplier_id = j.supplier.id
      }
      const url = isParceiro ? '/api/public/purchase-invoices' : '/api/admin/purchase-invoices'
      const body = {
        company_id: companyId,
        supplier_id: supplier_id || null,
        numero_nota_fiscal: numeroNF || null,
        chave_acesso_nf: chaveNF || null,
        data_pedido: dataPedido || null,
        data_recebimento: dataRecebimento || null,
        status,
        condicao_pagamento: condicao || null,
        observacoes: obs || null,
        xml_url: xmlUrl || null,
        items: items.map(i => ({
          product_id: i.product_id,
          quantidade: i.quantidade,
          custo_unitario: i.custo_unitario,
        })),
      }
      const r = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      onSave()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{
        background: 'var(--psh-bg-primary)', borderRadius: 16, padding: 24,
        maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 20, color: 'var(--psh-text-primary)' }}>
          ➕ Nova Nota de Compra
        </h2>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Field label="Fornecedor">
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={fieldStyle}>
              <option value="">— Selecione —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Field>
          {!supplierId && (
            <Field label="Ou novo fornecedor">
              <input type="text" value={novoFornecedor} onChange={e => setNovoFornecedor(e.target.value)} placeholder="Nome do fornecedor" style={fieldStyle} />
            </Field>
          )}
          <Field label="Nº NF">
            <input type="text" value={numeroNF} onChange={e => setNumeroNF(e.target.value)} placeholder="000.000.000" style={fieldStyle} />
          </Field>
          <Field label="Chave de Acesso (55 dígitos)">
            <input type="text" value={chaveNF} onChange={e => setChaveNF(e.target.value)} maxLength={60} style={fieldStyle} />
          </Field>
          <Field label="Data do Pedido">
            <input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Data Recebimento">
            <input type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={e => setStatus(e.target.value)} style={fieldStyle}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Condição de Pagamento">
            <input type="text" value={condicao} onChange={e => setCondicao(e.target.value)} placeholder="Ex: 30/60/90 dias" style={fieldStyle} />
          </Field>
        </div>

        {/* Upload de NF (PDF/XML) */}
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--psh-bg-secondary)', borderRadius: 8, border: '1px dashed var(--psh-border)' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--psh-text-primary)' }}>
            📎 Anexar NF (PDF ou XML) — preenche automático
          </label>
          <input
            type="file"
            accept=".pdf,.xml,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            disabled={uploadingFile}
            style={{ ...fieldStyle, padding: 8, cursor: 'pointer' }}
          />
          {uploadingFile && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--psh-text-secondary)' }}>⏳ Enviando arquivo...</p>}
          {xmlUrl && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--psh-bg-primary)', borderRadius: 6, fontSize: 12 }}>
              ✅ <a href={xmlUrl} target="_blank" rel="noopener" style={{ color: '#3b82f6' }}>{nomeArquivo}</a>
              {chaveNF && <span style={{ marginLeft: 8, color: 'var(--psh-text-secondary)' }}>(dados preenchidos automaticamente)</span>}
            </div>
          )}
        </div>

        <Field label="Observações" full>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
        </Field>

        <h3 style={{ margin: '20px 0 8px', fontSize: 16, color: 'var(--psh-text-primary)' }}>📦 Itens da Nota</h3>

        <input
          type="text"
          placeholder="🔍 Buscar produto por SKU ou nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ ...fieldStyle, marginBottom: 8 }}
        />

        {busca && (
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--psh-border)', borderRadius: 8, marginBottom: 12 }}>
            {produtosFiltrados.map(p => (
              <div
                key={p.id}
                onClick={() => adicionarItem(p)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--psh-border)',
                  background: items.find(i => i.product_id === p.id) ? '#d1fae5' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)' }}>{p.nome} {p.custo_atual ? `• Custo atual: R$ ${p.custo_atual.toFixed(2)}` : ''}</div>
              </div>
            ))}
            {produtosFiltrados.length === 0 && <div style={{ padding: 12, color: 'var(--psh-text-secondary)', fontSize: 13 }}>Nenhum produto encontrado</div>}
          </div>
        )}

        {items.length > 0 && (
          <div style={{ border: '1px solid var(--psh-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary)' }}>
                  <th style={thStyle}>Produto</th>
                  <th style={thStyle}>Qtd</th>
                  <th style={thStyle}>Custo Unit.</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid var(--psh-border)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{it.sku}</div>
                      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>{it.produto_nome}</div>
                    </td>
                    <td style={tdStyle}>
                      <input type="number" min="1" value={it.quantidade} onChange={e => atualizarItem(idx, 'quantidade', Number(e.target.value))} style={{ ...fieldStyle, width: 70 }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" step="0.01" min="0" value={it.custo_unitario ?? ''} onChange={e => atualizarItem(idx, 'custo_unitario', e.target.value ? Number(e.target.value) : null)} style={{ ...fieldStyle, width: 100 }} />
                    </td>
                    <td style={tdStyle}>
                      <strong>R$ {(it.custo_total || 0).toFixed(2)}</strong>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removerItem(idx)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--psh-bg-secondary)', fontWeight: 700 }}>
                  <td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>TOTAL:</td>
                  <td style={tdStyle}>R$ {valorTotal.toFixed(2)}</td>
                  <td style={tdStyle}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving || items.length === 0} style={{ ...btnStyle, background: '#10b981', color: 'var(--psh-bg-primary, #fff)', opacity: (saving || items.length === 0) ? 0.5 : 1 }}>
            {saving ? '⏳ Salvando...' : '💾 Salvar Nota'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/* ========== MODAL DETALHES ========== */
function DetalhesNotaModal({ nota, onClose, onShowHistorico }: {
  nota: Nota; onClose: () => void; onShowHistorico: (productId: string) => void;
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ background: 'var(--psh-bg-primary)', borderRadius: 16, padding: 24, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--psh-text-primary)' }}>
              📄 NF {nota.numero_nota_fiscal || nota.id.substring(0, 8)}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--psh-text-secondary)', marginTop: 4 }}>
              {nota.supplier?.nome || 'Sem fornecedor'}
            </div>
          </div>
          <span style={{
            background: STATUS_COLOR[nota.status] || '#94a3b8',
            color: 'var(--psh-bg-primary, #fff)', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          }}>
            {STATUS_LABEL[nota.status] || nota.status}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Info label="Data Pedido" value={nota.data_pedido ? new Date(nota.data_pedido).toLocaleDateString('pt-BR') : '—'} />
          <Info label="Previsão Entrega" value={nota.previsao_entrega ? new Date(nota.previsao_entrega).toLocaleDateString('pt-BR') : '—'} />
          <Info label="Recebimento" value={nota.data_recebimento ? new Date(nota.data_recebimento).toLocaleDateString('pt-BR') : '—'} />
          <Info label="Valor Total" value={`R$ ${nota.valor_total?.toFixed(2) || '0,00'}`} highlight />
          <Info label="Condição" value={nota.condicao_pagamento || '—'} />
          {nota.chave_acesso_nf && <Info label="Chave NF" value={nota.chave_acesso_nf} small />}
        </div>

        {nota.observacoes && (
          <div style={{ padding: 12, background: 'var(--psh-bg-secondary)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <b>Obs:</b> {nota.observacoes}
          </div>
        )}

        <h3 style={{ fontSize: 16, marginBottom: 8, color: 'var(--psh-text-primary)' }}>📦 Itens ({nota.items.length})</h3>
        <div style={{ border: '1px solid var(--psh-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary)' }}>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>Qtd</th>
                <th style={thStyle}>Custo Unit.</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {nota.items.map((it, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid var(--psh-border)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{it.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>{it.produto_nome}</div>
                  </td>
                  <td style={tdStyle}>{it.quantidade}</td>
                  <td style={tdStyle}>R$ {it.custo_unitario?.toFixed(2) || '—'}</td>
                  <td style={tdStyle}><strong>R$ {it.custo_total?.toFixed(2) || '0,00'}</strong></td>
                  <td style={tdStyle}>
                    {it.product_id && (
                      <button
                        onClick={() => onShowHistorico(it.product_id!)}
                        style={{ background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        title="Ver histórico de custos deste produto"
                      >
                        📈 Histórico
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>Fechar</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/* ========== MODAL HISTÓRICO ========== */
function HistoricoCustoModal({ productId, historico, onClose }: { productId: string; historico: any[]; onClose: () => void }) {
  const sku = historico[0]?.sku || ''
  const nome = historico[0]?.produto_nome || ''

  const custoMedio = historico.length > 0
    ? historico.reduce((s, h) => s + (h.custo_unitario || 0) * (h.quantidade || 0), 0) / Math.max(1, historico.reduce((s, h) => s + (h.quantidade || 0), 0))
    : 0

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ background: 'var(--psh-bg-primary)', borderRadius: 16, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--psh-text-primary)' }}>
          📈 Histórico de Custos
        </h2>
        <div style={{ fontSize: 13, color: 'var(--psh-text-secondary)', marginBottom: 16 }}>
          {sku} — {nome}
        </div>

        {historico.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'var(--psh-bg-primary, #fff)', padding: 16, borderRadius: 12, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>CUSTO MÉDIO PONDERADO</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>R$ {custoMedio.toFixed(2)}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              Baseado em {historico.length} compra{historico.length !== 1 ? 's' : ''} • {historico.reduce((s, h) => s + h.quantidade, 0)} unidades
            </div>
          </div>
        )}

        {historico.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
            Nenhuma nota de compra registrada pra esse produto.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {historico.map((h, idx) => {
              const diff = idx > 0 ? ((h.custo_unitario - historico[idx - 1].custo_unitario) / historico[idx - 1].custo_unitario) * 100 : 0
              return (
                <div key={idx} style={{ background: 'var(--psh-bg-secondary)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', border: '1px solid var(--psh-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.numero_nota_fiscal || `NF ${h.purchase_id?.substring(0, 8)}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>
                      {h.data_pedido ? new Date(h.data_pedido).toLocaleDateString('pt-BR') : '—'} • {h.quantidade} un • {h.supplier_nome || 'Sem fornecedor'}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                    R$ {h.custo_unitario?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: diff > 0 ? '#ef4444' : diff < 0 ? '#10b981' : '#94a3b8', minWidth: 60, textAlign: 'right' }}>
                    {idx === 0 ? '—' : `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff).toFixed(1)}%`}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>Fechar</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/* ========== HELPERS ========== */
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

function Info({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>{label}</div>
      <div style={{
        fontSize: small ? 11 : 14,
        color: highlight ? '#10b981' : 'var(--psh-text-primary)',
        fontWeight: highlight ? 700 : 600,
        wordBreak: 'break-all',
      }}>{value}</div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--psh-border)',
  background: 'var(--psh-bg-primary)',
  color: 'var(--psh-text-primary)',
  fontSize: 14,
  boxSizing: 'border-box',
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--psh-text-secondary)',
  textTransform: 'uppercase',
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--psh-text-primary)',
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}