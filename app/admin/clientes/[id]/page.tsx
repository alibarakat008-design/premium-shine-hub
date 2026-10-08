'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Customer {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  cpf: string | null
  total_pedidos: number
  total_gasto: number
  ultima_compra: string | null
  origem_lead: string | null
  created_at: string
  orders: {
    id: string
    total: number
    status: string
    created_at: string
    marketplace_accounts: { plataforma: string } | null
    order_items: { quantidade: number; products: { nome: string; sku: string } }[]
  }[]
  customer_notes: { id: string; nota: string; autor: string | null; created_at: string }[]
  customer_tags: { id: string; tag: string; cor: string | null }[]
}

export default function ClienteDetalhePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [novaNota, setNovaNota] = useState('')
  const [novaTag, setNovaTag] = useState('')
  const [corTag, setCorTag] = useState('#a78bfa')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch(`/api/customers/${id}`).then(r => r.json()).then(j => {
      if (j.success) setCustomer(j.data)
      setLoading(false)
    })
  }

  useEffect(load, [id])

  async function adicionarNota() {
    if (!novaNota) return
    await apiFetch(`/api/customers/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nota: novaNota, autor: 'Admin' }),
    })
    setNovaNota('')
    load()
  }

  async function adicionarTag() {
    if (!novaTag) return
    await apiFetch(`/api/customers/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: novaTag, cor: corTag }),
    })
    setNovaTag('')
    load()
  }

  async function removerNota(noteId: string) {
    if (!confirm('Remover esta nota?')) return
    await apiFetch(`/api/customers/${id}/notes?noteId=${noteId}`, { method: 'DELETE' })
    load()
  }

  async function removerTag(tagId: string) {
    await apiFetch(`/api/customers/${id}/tags?tagId=${tagId}`, { method: 'DELETE' })
    load()
  }

  if (status === 'loading' || loading || !customer) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <button onClick={() => router.push('/admin/clientes')} style={{ background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 16 }}>
          ← Voltar
        </button>

        {/* Header */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2em', fontWeight: 700, color: '#000' }}>
              {customer.nome.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ color: '#d0c0ff', margin: '0 0 4px 0' }}>{customer.nome}</h1>
              <div style={{ color: '#7070a0', fontSize: '0.85em' }}>
                {customer.email && `📧 ${customer.email} • `}
                {customer.telefone && `📱 ${customer.telefone} • `}
                Cliente desde {new Date(customer.created_at).toLocaleDateString('pt-BR')}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {customer.customer_tags.map(t => (
                  <span key={t.id} onClick={() => removerTag(t.id)} style={{ padding: '3px 10px', background: t.cor || '#a78bfa', color: '#000', borderRadius: 4, fontSize: '0.75em', fontWeight: 600, cursor: 'pointer' }} title="Clique pra remover">
                    {t.tag} ✕
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, minWidth: 300 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Pedidos</div>
                <div style={{ color: '#a78bfa', fontSize: '1.4em', fontWeight: 700 }}>{customer.total_pedidos}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.7em' }}>LTV</div>
                <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>R$ {Number(customer.total_gasto).toFixed(0)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Ticket Médio</div>
                <div style={{ color: '#eab308', fontSize: '1.4em', fontWeight: 700 }}>
                  R$ {customer.total_pedidos > 0 ? (Number(customer.total_gasto) / customer.total_pedidos).toFixed(0) : '0'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Pedidos */}
          <div>
            <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>📦 Pedidos ({customer.orders.length})</h3>
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
              {customer.orders.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#7070a0' }}>Nenhum pedido</div>
              ) : (
                <div style={{ maxHeight: 500, overflow: 'auto' }}>
                  {customer.orders.map(o => (
                    <div key={o.id} style={{ padding: 12, borderBottom: '1px solid #1a1a3a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '0.9em' }}>
                            #{o.id.slice(0, 8)} • {o.marketplace_accounts?.plataforma || 'outros'}
                          </div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>
                            {new Date(o.created_at).toLocaleDateString('pt-BR')} • {o.order_items.length} itens
                          </div>
                          <div style={{ color: '#b0b0cc', fontSize: '0.75em', marginTop: 2 }}>
                            {o.order_items.slice(0, 2).map(i => i.products.nome).join(', ')}
                            {o.order_items.length > 2 && ` +${o.order_items.length - 2}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#22c55e', fontWeight: 700 }}>R$ {Number(o.total).toFixed(2)}</div>
                          <div style={{ padding: '2px 8px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: 3, fontSize: '0.7em' }}>{o.status}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Tags + Notas */}
          <div>
            {/* Tags */}
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3 style={{ color: '#a78bfa', marginTop: 0 }}>🏷️ Tags</h3>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {customer.customer_tags.map(t => (
                  <span key={t.id} onClick={() => removerTag(t.id)} style={{ padding: '4px 10px', background: t.cor || '#a78bfa', color: '#000', borderRadius: 4, fontSize: '0.8em', fontWeight: 600, cursor: 'pointer' }}>
                    {t.tag} ✕
                  </span>
                ))}
                {customer.customer_tags.length === 0 && <span style={{ color: '#7070a0', fontSize: '0.8em' }}>Nenhuma tag</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova tag..." style={{ flex: 1, padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 4, fontSize: '0.85em' }} />
                <input type="color" value={corTag} onChange={(e) => setCorTag(e.target.value)} style={{ width: 36, height: 32, background: 'transparent', border: '1px solid #2a2a4a', borderRadius: 4 }} />
                <button onClick={adicionarTag} style={{ padding: '6px 12px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>+</button>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.7em', color: '#7070a0' }}>
                Sugestões: <span onClick={() => setNovaTag('VIP')} style={{ color: '#eab308', cursor: 'pointer' }}>VIP</span> • <span onClick={() => setNovaTag('Inadimplente')} style={{ color: '#ef4444', cursor: 'pointer' }}>Inadimplente</span> • <span onClick={() => setNovaTag('Recorrente')} style={{ color: '#22c55e', cursor: 'pointer' }}>Recorrente</span>
              </div>
            </div>

            {/* Notas */}
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
              <h3 style={{ color: '#a78bfa', marginTop: 0 }}>📝 Notas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflow: 'auto' }}>
                {customer.customer_notes.map(n => (
                  <div key={n.id} style={{ background: '#0a0a1a', padding: 8, borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: '#a78bfa', fontSize: '0.7em' }}>{n.autor} • {new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                      <button onClick={() => removerNota(n.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7em' }}>✕</button>
                    </div>
                    <div style={{ color: '#d0c0ff', fontSize: '0.85em' }}>{n.nota}</div>
                  </div>
                ))}
                {customer.customer_notes.length === 0 && <div style={{ color: '#7070a0', fontSize: '0.8em', textAlign: 'center', padding: 12 }}>Nenhuma nota</div>}
              </div>
              <textarea value={novaNota} onChange={(e) => setNovaNota(e.target.value)} placeholder="Escreva uma nota..." rows={3} style={{ width: '100%', padding: '8px 10px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 4, fontSize: '0.85em', resize: 'vertical' }} />
              <button onClick={adicionarNota} style={{ width: '100%', marginTop: 8, padding: '8px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                💾 Adicionar Nota
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
