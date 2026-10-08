'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')

interface Product {
  id: string
  sku: string
  nome: string
  custo_atual?: number
}

interface Compra {
  id: string
  data_compra: string
  numero_pedido: string
  total: string
  status: string
  fornecedor_nome: string
  qtd_items: number
  observacoes: string
}

export default function MinhasComprasPage() {
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [companyId, setCompanyId] = useState<string>('')

  // Form state
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [numeroPedido, setNumeroPedido] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [items, setItems] = useState<Array<{ product_id: string, sku: string, nome_produto: string, quantidade: number, custo_unitario: number }>>([
    { product_id: '', sku: '', nome_produto: '', quantidade: 1, custo_unitario: 0 }
  ])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string, nome_fantasia: string }>>([])

  useEffect(() => {
    fetch('/api/admin/company-active', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        const cid = j.company_id || 'a2176d33-f604-48cf-8d8a-df4313ce1417'  // GH SHOP default
        setCompanyId(cid)
      })
      .catch(() => {
        setCompanyId('a2176d33-f604-48cf-8d8a-df4313ce1417')
      })
  }, [])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/parceiro/compras?days=90&company_id=${companyId}`, { credentials: 'include' })
      const j = await r.json()
      if (j.ok) setCompras(j.compras || [])

      // Pega lista de fornecedores (= todas companies)
      const r2 = await fetch(`/api/admin/companies-list`, { credentials: 'include' })
      const j2 = await r2.json()
      if (j2.ok) setFornecedores(j2.companies || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const addItem = () => {
    setItems([...items, { product_id: '', sku: '', nome_produto: '', quantidade: 1, custo_unitario: 0 }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const submitCompra = async () => {
    if (!companyId || !fornecedorId) {
      alert('Selecione o fornecedor')
      return
    }
    if (items.length === 0) {
      alert('Adicione ao menos 1 item')
      return
    }

    try {
      setLoading(true)
      const r = await fetch('/api/admin/parceiro/compras', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          fornecedor_company_id: fornecedorId,
          numero_pedido: numeroPedido || null,
          observacoes: observacoes || null,
          items: items.map(it => ({
            product_id: it.product_id || null,
            sku: it.sku,
            nome_produto: it.nome_produto,
            quantidade: it.quantidade,
            custo_unitario: it.custo_unitario,
          })),
        }),
      })
      const j = await r.json()
      if (j.ok) {
        alert(`Compra registrada! Total: R$ ${(j.total || 0).toFixed(2)}`)
        setShowForm(false)
        setItems([{ product_id: '', sku: '', nome_produto: '', quantidade: 1, custo_unitario: 0 }])
        setNumeroPedido('')
        setObservacoes('')
        load()
      } else {
        alert('Erro: ' + j.error)
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!companyId) return <div style={{ padding: 32, color: 'var(--psh-text-secondary)' }}>Carregando empresa...</div>

  const totalGeral = compras.reduce((s, c) => s + Number(c.total), 0)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            Minhas Compras de Fornecedor
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Registre aqui cada lote que voce compra de um fornecedor
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '10px 20px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {showForm ? 'Cancelar' : '+ Nova Compra'}
        </button>
      </div>

      {/* Resumo */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Stat label="Total de Compras (90d)" value={K(compras.length)} />
          <Stat label="Total Gasto" value={fmtBRL(totalGeral)} highlight />
          <Stat label="Ticket Medio" value={fmtBRL(compras.length > 0 ? totalGeral / compras.length : 0)} />
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
            Registrar Compra
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Fornecedor *</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
                <option value="">Selecione...</option>
                {fornecedores.map(f => (
                  <option key={f.id} value={f.id}>{f.nome_fantasia}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Numero do Pedido</label>
              <input type="text" value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)}
                placeholder="Opcional"
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
            </div>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: 'var(--psh-text-primary)' }}>Itens</h3>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 40px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input type="text" placeholder="SKU ou nome" value={it.sku} onChange={(e) => {
                const newItems = [...items]; newItems[idx].sku = e.target.value; setItems(newItems)
              }} style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
              <input type="text" placeholder="Nome" value={it.nome_produto} onChange={(e) => {
                const newItems = [...items]; newItems[idx].nome_produto = e.target.value; setItems(newItems)
              }} style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
              <input type="number" min="1" placeholder="Qtd" value={it.quantidade} onChange={(e) => {
                const newItems = [...items]; newItems[idx].quantidade = Number(e.target.value); setItems(newItems)
              }} style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
              <input type="number" step="0.01" placeholder="Custo" value={it.custo_unitario} onChange={(e) => {
                const newItems = [...items]; newItems[idx].custo_unitario = Number(e.target.value); setItems(newItems)
              }} style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
              <button onClick={() => removeItem(idx)} style={{ padding: 8, background: '#ef4444', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>X</button>
            </div>
          ))}
          <button onClick={addItem} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--psh-accent, #3b82f6)', border: '1px solid var(--psh-accent, #3b82f6)', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
            + Adicionar Item
          </button>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Observacoes</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
          </div>

          <div style={{ marginTop: 16, padding: 12, background: 'var(--psh-bg-primary)', borderRadius: 6, fontSize: 14, color: 'var(--psh-text-primary)' }}>
            <strong>Total: {fmtBRL(items.reduce((s, it) => s + it.quantidade * it.custo_unitario, 0))}</strong>
          </div>

          <button onClick={submitCompra} disabled={loading}
            style={{ marginTop: 16, padding: '10px 24px', background: '#10b981', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {loading ? 'Salvando' : 'Salvar Compra'}
          </button>
        </div>
      )}

      {/* Lista de compras */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
          Historico de Compras
        </h2>
        {compras.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Data</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Fornecedor</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Pedido</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Itens</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>{new Date(c.data_compra).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>{c.fornecedor_nome || '-'}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-secondary)' }}>{c.numero_pedido || '-'}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>{K(c.qtd_items)}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(Number(c.total))}</td>
                    <td style={{ padding: 10, color: c.status === 'recebida' ? '#10b981' : '#f59e0b' }}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhuma compra registrada ainda</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: highlight ? '#10b981' : 'var(--psh-text-primary)' }}>{value}</div>
    </div>
  )
}
