'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Supplier {
  id: string
  nome: string
  cnpj?: string
  contato_nome?: string
  contato_email?: string
  contato_telefone?: string
  prazo_entrega_dias?: number
  pedido_minimo_valor?: number
  ativo?: boolean
  _count?: { products: number }
}

const empty: Omit<Supplier, 'id' | '_count'> = {
  nome: '',
  cnpj: '',
  contato_nome: '',
  contato_email: '',
  contato_telefone: '',
  prazo_entrega_dias: 7,
  pedido_minimo_valor: 0,
}

export default function FornecedoresPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(empty)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    fetch('/api/suppliers').then(r => r.json()).then(j => { if (j.success) setSuppliers(j.data); setLoading(false) })
  }

  useEffect(load, [])

  function abrirNovo() {
    setEditingId(null)
    setForm(empty)
    setOpen(true)
  }

  function abrirEditar(s: Supplier) {
    setEditingId(s.id)
    setForm({
      nome: s.nome,
      cnpj: s.cnpj || '',
      contato_nome: s.contato_nome || '',
      contato_email: s.contato_email || '',
      contato_telefone: s.contato_telefone || '',
      prazo_entrega_dias: s.prazo_entrega_dias || 7,
      pedido_minimo_valor: s.pedido_minimo_valor || 0,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.nome) return alert('Nome obrigatório')
    const url = editingId ? `/api/suppliers/${editingId}` : '/api/suppliers'
    const method = editingId ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const j = await res.json()
    if (j.success) {
      setOpen(false)
      load()
    } else {
      alert('❌ ' + j.error)
    }
  }

  async function remover(id: string) {
    if (!confirm('Remover este fornecedor?')) return
    const res = await apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (j.success) load()
    else alert('❌ ' + j.error)
  }

  if (status === 'loading' || loading) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  const filtrados = suppliers.filter(s =>
    !busca || s.nome.toLowerCase().includes(busca.toLowerCase()) || (s.cnpj || '').includes(busca)
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>🏭 Fornecedores</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>{suppliers.length} fornecedores cadastrados</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar..." style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6, minWidth: 200 }} />
            <button onClick={abrirNovo} style={{ padding: '8px 16px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Novo</button>
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {filtrados.map(s => (
            <div key={s.id} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1.05em' }}>🏭 {s.nome}</div>
                  {s.cnpj && <div style={{ color: '#7070a0', fontSize: '0.75em' }}>CNPJ: {s.cnpj}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => abrirEditar(s)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 3, cursor: 'pointer', fontSize: '0.8em' }}>✏️</button>
                  <button onClick={() => remover(s.id)} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 3, cursor: 'pointer', fontSize: '0.8em' }}>🗑️</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.85em', marginTop: 8 }}>
                {s.contato_nome && <div><span style={{ color: '#7070a0' }}>Contato:</span> <span style={{ color: '#b0b0cc' }}>{s.contato_nome}</span></div>}
                {s.contato_email && <div><span style={{ color: '#7070a0' }}>Email:</span> <span style={{ color: '#b0b0cc' }}>{s.contato_email}</span></div>}
                {s.contato_telefone && <div><span style={{ color: '#7070a0' }}>Tel:</span> <span style={{ color: '#b0b0cc' }}>{s.contato_telefone}</span></div>}
                {s.prazo_entrega_dias && <div><span style={{ color: '#7070a0' }}>Prazo:</span> <span style={{ color: '#eab308', fontWeight: 600 }}>{s.prazo_entrega_dias} dias</span></div>}
                {s._count && <div><span style={{ color: '#7070a0' }}>Produtos:</span> <span style={{ color: '#a78bfa', fontWeight: 600 }}>{s._count.products}</span></div>}
              </div>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 40, textAlign: 'center', color: '#7070a0', gridColumn: '1/-1' }}>
              Nenhum fornecedor encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: '#a78bfa' }}>{editingId ? '✏️ Editar' : '➕ Novo'} Fornecedor</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#b0b0cc', cursor: 'pointer', fontSize: '1.5em' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Nome *</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>CNPJ</label>
                <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" style={input} />
              </div>
              <div>
                <label style={lbl}>Contato (Nome)</label>
                <input value={form.contato_nome} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>E-mail</label>
                <input type="email" value={form.contato_email} onChange={(e) => setForm({ ...form, contato_email: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input value={form.contato_telefone} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>Prazo de Entrega (dias)</label>
                <input type="number" value={form.prazo_entrega_dias} onChange={(e) => setForm({ ...form, prazo_entrega_dias: parseInt(e.target.value) || 0 })} style={input} />
              </div>
              <div>
                <label style={lbl}>Pedido Mínimo (R$)</label>
                <input type="number" step="0.01" value={form.pedido_minimo_valor} onChange={(e) => setForm({ ...form, pedido_minimo_valor: parseFloat(e.target.value) || 0 })} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={salvar} style={{ flex: 1, padding: '12px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>💾 Salvar</button>
              <button onClick={() => setOpen(false)} style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }
