'use client'

/**
 * PÁGINA: Notas de Compra (Notas Fiscais de Fornecedor)
 * Caminho: app/admin/notas-de-compra/page.tsx
 */
import { useEffect, useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface NotaItem {
  id?: string; product_id?: string; sku?: string; produto_nome?: string
  quantidade: number; custo_unitario: number | null; custo_total: number | null
}

interface Nota {
  id: string; company_id: string; company_nome: string
  supplier_id: string; supplier_nome: string; supplier_cnpj: string
  status: string; valor_total: number | null
  data_pedido: string | null; previsao_entrega: string | null
  data_recebimento: string | null; condicao_pagamento: string
  numero_nota_fiscal: string; chave_acesso_nf: string; observacoes: string
  created_at: string; items: NotaItem[]
}

interface Supplier {
  id: string; nome: string; cnpj: string
}

// ─── Const ───────────────────────────────────────────────────────────────────
const AUTH = 'Basic ' + btoa('premium:shine2026')
const fmt = (v: number | null | undefined) => (v != null ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

const STATUS = [
  { value: 'sugerida', label: '💡 Sugerida', cor: '#fbbf24' },
  { value: 'aprovada', label: '✅ Aprovada', cor: '#60a5fa' },
  { value: 'enviada', label: '📦 Enviada', cor: '#34d399' },
  { value: 'recebida', label: '🏁 Recebida', cor: '#10b981' },
  { value: 'cancelada', label: '❌ Cancelada', cor: '#ef4444' },
]
const corStatus = (s: string) => STATUS.find(x => x.value === s)?.cor || '#7070a0'
const labelStatus = (s: string) => STATUS.find(x => x.value === s)?.label || s

// ─── UI Helpers ──────────────────────────────────────────────────────────────
function Badge({ txt, cor }: { txt: string; cor: string }) {
  return <span style={{ background: cor + '22', color: cor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{txt}</span>
}

function Toast({ msg, cor = '#22c55e' }: { msg: string; cor?: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: cor, color: '#000', padding: '10px 24px', borderRadius: 10,
      fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>{msg}</div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 900 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16,
        width: '95vw', maxWidth: 720, maxHeight: '88vh', zIndex: 901,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#d0c0ff' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>
      </div>
    </>
  )
}

function inp(label: string, value: string, onChange: (v: string) => void, type = 'text', ph = '') {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={function(e: any) { onChange(e.target.value) }} placeholder={ph}
        style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
    </label>
  )
}

function sel(label: string, value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={function(e: any) { onChange(e.target.value) }}
        style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
        {opts.map(function(o: { value: string; label: string }) { return <option key={o.value} value={o.value}>{o.label}</option> })}
      </select>
    </label>
  )
}

function Btn({ label, onClick, cor = '#6366f1', loading = false }: { label: string; onClick: () => void; cor?: string; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ padding: '9px 20px', background: cor, border: 'none', borderRadius: 8, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: loading ? 0.7 : 1 }}>
      {loading ? '⏳' : label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotasDeCompraPage() {
  const [authOk, setAuthOk] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastCor, setToastCor] = useState('#22c55e')
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState<Nota[]>([])
  const [fornecedores, setFornecedores] = useState<Supplier[]>([])
  const [filtroStatus, setFiltroStatus] = useState('')
  const [modalNova, setModalNova] = useState(false)
  const [modalDetalhe, setModalDetalhe] = useState<Nota | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  // Form nova nota
  const [form, setForm] = useState({
    supplier_id: '', numero_nota_fiscal: '', chave_acesso_nf: '',
    data_pedido: '', previsao_entrega: '', condicao_pagamento: '',
    observacoes: '',
  })
  const [itens, setItens] = useState<NotaItem[]>([
    { quantidade: 1, custo_unitario: null, custo_total: null },
  ])

  function showToast(msg: string, cor = '#22c55e') {
    setToastCor(cor); setToast(msg); setTimeout(function() { setToast(null) }, 2500)
  }

  // Auth
  useEffect(function() {
    fetch('/api/admin/login-empresa', { headers: { Authorization: 'Basic ' + btoa('premium:shine2026') }, credentials: 'include' })
      .then(function(r: any) { return r.json() })
      .then(function(d: any) { if (d.ok) setAuthOk(true) })
  }, [])

  const loadNotas = useCallback(async function() {
    setLoading(true)
    try {
      const url = '/api/admin/purchase-invoices?' + (filtroStatus ? 'status=' + filtroStatus : '')
      const r = await fetch(url, { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) setNotas(d.notas || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filtroStatus])

  const loadFornecedores = useCallback(async function() {
    try {
      const r = await fetch('/api/suppliers')
      const d = await r.json()
      if (d.success) setFornecedores(d.data || [])
    } catch (e) { console.error(e) }
  }, [])

  useEffect(function() { if (authOk) { loadNotas(); loadFornecedores() } }, [authOk, loadNotas, loadFornecedores])

  // CRUD
  async function criarNota() {
    const validItems = itens.filter(function(it: NotaItem) { return it.quantidade > 0 && it.custo_unitario && it.custo_unitario > 0 })
    if (validItems.length === 0) { showToast('❌ Adicione pelo menos 1 item com quantidade e custo', '#ef4444'); return }
    if (!form.supplier_id) { showToast('❌ Selecione o fornecedor', '#ef4444'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        company_id: 'LIURA', // default
        items: validItems.map(function(it: NotaItem) {
          return { quantidade: it.quantidade, custo_unitario: it.custo_unitario }
        }),
      }
      const r = await fetch('/api/admin/purchase-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.ok) { showToast('✅ Nota criada!'); setModalNova(false); loadNotas() }
      else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') } finally { setSaving(false) }
  }

  async function atualizarStatus(id: string, status: string) {
    setSavingStatus(true)
    try {
      const r = await fetch('/api/admin/purchase-invoices/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status }),
      })
      const d = await r.json()
      if (d.ok) { showToast('✅ Status atualizado!'); loadNotas(); setModalDetalhe(null) }
      else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') } finally { setSavingStatus(false) }
  }

  function adicionarItem() {
    setItens(function(prev: NotaItem[]) { return [...prev, { quantidade: 1, custo_unitario: null, custo_total: null }] })
  }

  function removerItem(idx: number) {
    setItens(function(prev: NotaItem[]) { return prev.filter(function(_: any, i: number) { return i !== idx }) })
  }

  function atualizarItem(idx: number, campo: string, valor: any) {
    setItens(function(prev: NotaItem[]) {
      const updated = prev.map(function(it: NotaItem, i: number) {
        if (i !== idx) return it
        const novo = Object.assign({}, it, { [campo]: valor })
        if (campo === 'quantidade' || campo === 'custo_unitario') {
          novo.custo_total = (novo.quantidade || 0) * (novo.custo_unitario || 0)
        }
        return novo
      })
      return updated
    })
  }

  const totalNota = itens.reduce(function(a: number, it: NotaItem) { return a + (it.custo_total || 0) }, 0)

  if (!authOk) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏳ Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>

      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>🧾 Notas de Compra</h1>
            <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>{notas.length} nota(s)</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={filtroStatus} onChange={function(e: any) { setFiltroStatus(e.target.value) }}
              style={{ padding: '8px 14px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
              <option value="">Todos os status</option>
              {STATUS.map(function(s) { return <option key={s.value} value={s.value}>{s.label}</option> })}
            </select>
            <Btn label="↻ Atualizar" onClick={loadNotas} />
            <Btn label="➕ Nova Nota" onClick={function() { setForm({ supplier_id: '', numero_nota_fiscal: '', chave_acesso_nf: '', data_pedido: '', previsao_entrega: '', condicao_pagamento: '', observacoes: '' }); setItens([{ quantidade: 1, custo_unitario: null, custo_total: null }]); setModalNova(true) }} cor="#22c55e" />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Resumo por status */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {STATUS.map(function(s) {
            const count = notas.filter(function(n: Nota) { return n.status === s.value }).length
            return (
              <button key={s.value} onClick={function() { setFiltroStatus(filtroStatus === s.value ? '' : s.value) }}
                style={{
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: filtroStatus === s.value ? s.cor + '33' : '#12122a',
                  border: '1px solid ' + (filtroStatus === s.value ? s.cor : '#2a2a4a'),
                  color: filtroStatus === s.value ? s.cor : '#7070a0', transition: 'all 0.15s',
                }}>
                {s.label} <span style={{ marginLeft: 4 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳ Carregando...</div>
        ) : notas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: '#12122a', borderRadius: 12, border: '1px dashed #2a2a4a', color: '#4a4a7a' }}>
            Nenhuma nota encontrada.<br />Clique em "➕ Nova Nota" para cadastrar.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#7070a0', borderBottom: '1px solid #2a2a4a' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Fornecedor</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Nº Nota</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Pedido</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Previsão</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Valor</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {notas.map(function(n: Nota) {
                  return (
                    <tr key={n.id} style={{ borderBottom: '1px solid #1a1a3a', cursor: 'pointer' }}
                      onClick={function() { setModalDetalhe(n) }}
                      onMouseEnter={function(e: any) { e.currentTarget.style.background = '#12122a' }}
                      onMouseLeave={function(e: any) { e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{n.supplier_nome || '—'}</div>
                        {n.supplier_cnpj && <div style={{ color: '#4a4a7a', fontSize: 11 }}>{n.supplier_cnpj}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#d0c0ff' }}>{n.numero_nota_fiscal || '—'}</td>
                      <td style={{ textAlign: 'center', padding: '10px 12px', color: '#7070a0' }}>{fmtD(n.data_pedido)}</td>
                      <td style={{ textAlign: 'center', padding: '10px 12px', color: '#7070a0' }}>{fmtD(n.previsao_entrega)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', color: '#22c55e', fontWeight: 700 }}>{fmt(n.valor_total)}</td>
                      <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                        <Badge txt={labelStatus(n.status)} cor={corStatus(n.status)} />
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                        <button onClick={function(e: any) { e.stopPropagation(); setModalDetalhe(n) }}
                          style={{ padding: '4px 10px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11 }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL NOVA NOTA ────────────────────────────────────────────── */}
      {modalNova && (
        <Modal title='🧾 Nova Nota de Compra' onClose={function() { setModalNova(false) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {sel('Fornecedor *', form.supplier_id, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { supplier_id: v }) }) },
                [{ value: '', label: 'Selecione...' }].concat(fornecedores.map(function(f: Supplier) { return { value: f.id, label: f.nome + (f.cnpj ? ' (' + f.cnpj + ')' : '') } })))}
              {inp('Nº Nota Fiscal', form.numero_nota_fiscal, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { numero_nota_fiscal: v }) }) }, 'text', 'Ex: 12345')}
            </div>
            {inp('Chave de Acesso NF-e', form.chave_acesso_nf, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { chave_acesso_nf: v }) }) }, 'text', '44 dígitos')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {inp('Data Pedido', form.data_pedido, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { data_pedido: v }) }) }, 'date')}
              {inp('Previsão Entrega', form.previsao_entrega, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { previsao_entrega: v }) }) }, 'date')}
            </div>
            {sel('Condição Pagamento', form.condicao_pagamento, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { condicao_pagamento: v }) }) },
              [{ value: '', label: 'Selecione...' }, { value: 'à vista', label: 'À vista' }, { value: '7 dias', label: '7 dias' }, { value: '14 dias', label: '14 dias' }, { value: '30 dias', label: '30 dias' }, { value: 'parcelado', label: 'Parcelado' }])}
            {inp('Observações', form.observacoes, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { observacoes: v }) }) }, 'text')}

            {/* Itens */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ color: '#d0c0ff', fontSize: 13, fontWeight: 600 }}>📦 Itens</div>
                <button onClick={adicionarItem} style={{ padding: '4px 12px', background: '#1a2a2a', border: '1px solid #22c55e44', borderRadius: 6, color: '#22c55e', cursor: 'pointer', fontSize: 12 }}>➕ Item</button>
              </div>
              <div style={{ background: '#0a0a1a', borderRadius: 8, border: '1px solid #2a2a4a', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2a2a4a', color: '#7070a0', fontSize: 11 }}>
                  <span>SKU / Descrição</span><span>Quantidade</span><span>Custo Unit.</span><span>Total</span><span></span>
                </div>
                {itens.map(function(it: NotaItem, idx: number) {
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 12px', borderBottom: idx < itens.length - 1 ? '1px solid #1a1a3a' : 'none', alignItems: 'center' }}>
                      <input type="text" placeholder="SKU ou descrição" value={it.sku || ''}
                        onChange={function(e: any) { atualizarItem(idx, 'sku', e.target.value) }}
                        style={{ padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 6, color: '#e8e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                      <input type="number" min="1" value={it.quantidade || ''} placeholder="0"
                        onChange={function(e: any) { atualizarItem(idx, 'quantidade', parseInt(e.target.value) || 0) }}
                        style={{ padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 6, color: '#e8e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                      <input type="number" min="0" step="0.01" value={it.custo_unitario || ''} placeholder="R$ 0,00"
                        onChange={function(e: any) { atualizarItem(idx, 'custo_unitario', parseFloat(e.target.value) || 0) }}
                        style={{ padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 6, color: '#e8e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                      <div style={{ color: '#22c55e', fontWeight: 600, fontSize: 12 }}>{fmt(it.custo_total)}</div>
                      <button onClick={function() { removerItem(idx) }} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #3a2a2a', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </div>
                  )
                })}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, padding: '10px 12px', background: '#1a2a2a', fontWeight: 700, fontSize: 13 }}>
                  <span></span><span></span><span style={{ color: '#7070a0' }}>TOTAL:</span>
                  <span style={{ color: '#22c55e' }}>{fmt(totalNota)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn label="Salvar Nota" onClick={criarNota} cor="#22c55e" loading={saving} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL DETALHE ──────────────────────────────────────────────── */}
      {modalDetalhe && (
        <Modal title={'🧾 Nota — ' + (modalDetalhe.supplier_nome || 'Fornecedor')} onClose={function() { setModalDetalhe(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#0f0f22', borderRadius: 10, padding: '12px 16px' }}>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Fornecedor</span><br /><span style={{ color: '#d0c0ff', fontWeight: 600 }}>{modalDetalhe.supplier_nome || '—'}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>CNPJ</span><br /><span style={{ color: '#d0c0ff' }}>{modalDetalhe.supplier_cnpj || '—'}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Nº Nota</span><br /><span style={{ color: '#d0c0ff' }}>{modalDetalhe.numero_nota_fiscal || '—'}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Valor Total</span><br /><span style={{ color: '#22c55e', fontWeight: 700, fontSize: 18 }}>{fmt(modalDetalhe.valor_total)}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Data Pedido</span><br /><span style={{ color: '#d0c0ff' }}>{fmtD(modalDetalhe.data_pedido)}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Previsão</span><br /><span style={{ color: '#d0c0ff' }}>{fmtD(modalDetalhe.previsao_entrega)}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Recebimento</span><br /><span style={{ color: '#d0c0ff' }}>{fmtD(modalDetalhe.data_recebimento)}</span></div>
              <div><span style={{ color: '#7070a0', fontSize: 11 }}>Condição</span><br /><span style={{ color: '#d0c0ff' }}>{modalDetalhe.condicao_pagamento || '—'}</span></div>
            </div>

            {/* Status */}
            <div>
              <div style={{ color: '#d0c0ff', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS.map(function(s) {
                  return (
                    <button key={s.value} onClick={function() { atualizarStatus(modalDetalhe.id, s.value) }}
                      disabled={savingStatus}
                      style={{
                        padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: modalDetalhe.status === s.value ? s.cor + '33' : '#12122a',
                        border: '2px solid ' + (modalDetalhe.status === s.value ? s.cor : '#2a2a4a'),
                        color: modalDetalhe.status === s.value ? s.cor : '#7070a0', opacity: savingStatus ? 0.7 : 1,
                      }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Itens */}
            <div>
              <div style={{ color: '#d0c0ff', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📦 Itens ({modalDetalhe.items.length})</div>
              {modalDetalhe.items.length === 0 ? (
                <div style={{ color: '#4a4a7a', textAlign: 'center', padding: 16 }}>Sem itens registrados</div>
              ) : (
                <div style={{ background: '#0a0a1a', borderRadius: 8, border: '1px solid #2a2a4a', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2a2a4a', color: '#7070a0', fontSize: 11 }}>
                    <span>SKU / Produto</span><span style={{ textAlign: 'right' }}>Qtd</span><span style={{ textAlign: 'right' }}>Custo Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                  </div>
                  {modalDetalhe.items.map(function(it: NotaItem, idx: number) {
                    return (
                      <div key={it.id || idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '8px 12px', borderBottom: idx < modalDetalhe.items.length - 1 ? '1px solid #1a1a3a' : 'none', fontSize: 12 }}>
                        <span style={{ color: '#d0c0ff' }}>{it.sku || it.produto_nome || '—'}</span>
                        <span style={{ textAlign: 'right', color: '#7070a0' }}>{it.quantidade}</span>
                        <span style={{ textAlign: 'right', color: '#7070a0' }}>{fmt(it.custo_unitario)}</span>
                        <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(it.custo_total)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {modalDetalhe.observacoes && (
              <div style={{ background: '#0f0f22', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>Observações</div>
                <div style={{ color: '#d0c0ff', fontSize: 12 }}>{modalDetalhe.observacoes}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast} cor={toastCor} />}
    </div>
  )
}
