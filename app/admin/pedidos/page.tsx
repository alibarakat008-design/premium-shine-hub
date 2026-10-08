'use client'

/**
 * =====================================================
 * PÁGINA DE PEDIDOS — Consolidado (ML + Shopee + Manual)
 * Premium Shine Hub
 * =====================================================
 * Caminho: app/admin/pedidos/page.tsx
 * =====================================================
 */

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Order {
  id: string
  order_number: string
  origem: string
  status: string
  total: number
  custo_total: number | null
  lucro_liquido: number | null
  created_at: string
  customer: { id: string; nome: string; email: string } | null
  vendedor: { id: string; nome: string } | null
  company: { id: string; nome_fantasia: string } | null
  marketplace_account: { id: string; nickname: string; plataforma: string } | null
  items: { id: string; nome_produto: string; quantidade: number; preco_total: number; foto_url: string | null }[]
}

interface Stats {
  total_pedidos: number
  faturamento: number
  custo_total: number
  lucro_liquido: number
  ticket_medio: number
}

const ORIGEM_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  mercado_livre: { label: 'Mercado Livre', emoji: '🏪', color: '#ffe600' },
  shopee: { label: 'Shopee', emoji: '🛒', color: '#ee4d2d' },
  site_b2c: { label: 'Site B2C', emoji: '🌐', color: '#a78bfa' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#22c55e' },
  b2b: { label: 'B2B', emoji: '📋', color: '#60a5fa' },
  vendedora: { label: 'Vendedora', emoji: '👩‍💼', color: '#f472b6' },
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#eab308', bg: 'rgba(234,179,8,0.2)' },
  confirmado: { label: 'Confirmado', color: '#60a5fa', bg: 'rgba(96,165,250,0.2)' },
  separado: { label: 'Separado', color: '#a78bfa', bg: 'rgba(167,139,250,0.2)' },
  enviado: { label: 'Enviado', color: '#f472b6', bg: 'rgba(244,114,182,0.2)' },
  entregue: { label: 'Entregue', color: '#22c55e', bg: 'rgba(34,197,94,0.2)' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' },
  devolvido: { label: 'Devolvido', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' },
}

function PedidosContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterOrigem, setFilterOrigem] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchOrders()
  }, [status, page, filterOrigem, filterStatus])

  async function fetchOrders() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('q', search)
    if (filterOrigem) params.append('origem', filterOrigem)
    if (filterStatus) params.append('status', filterStatus)
    params.append('page', String(page))
    params.append('limit', '20')

    try {
      const res = await fetch(`/api/orders?${params}`)
      const json = await res.json()
      setOrders(json.data || [])
      setStats(json.stats || null)
      setTotal(json.pagination?.total || 0)
      setTotalPages(json.pagination?.total_pages || 1)
    } catch (err) {
      console.error('Erro:', err)
    } finally {
      setLoading(false)
    }
  }

  // Busca com debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (status === 'authenticated') {
        setPage(1)
        fetchOrders()
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  if (status === 'loading' || loading) {
    return <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 16, fontSize: '0.85em', display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/admin" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Dashboard</a>
          <span style={{ color: '#7070a0' }}>•</span>
          <a href="/admin/rastreamento" style={{ color: '#a78bfa', textDecoration: 'none' }}>📦 Rastreamento</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>📋 Pedidos</h1>
          <div style={{ color: '#7070a0', fontSize: '0.9em' }}>
            {total} pedidos no total · Atualiza em tempo real
          </div>
        </div>

        {/* Cards de Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statBox}>
              <div style={statLabel}>Pedidos</div>
              <div style={{ ...statValue, color: '#a78bfa' }}>{stats.total_pedidos}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Faturamento</div>
              <div style={{ ...statValue, color: '#22c55e' }}>R$ {stats.faturamento.toFixed(0)}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Custo Total</div>
              <div style={{ ...statValue, color: '#eab308' }}>R$ {stats.custo_total.toFixed(0)}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Lucro Líquido</div>
              <div style={{ ...statValue, color: '#22c55e' }}>R$ {stats.lucro_liquido.toFixed(0)}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Ticket Médio</div>
              <div style={{ ...statValue, color: '#60a5fa' }}>R$ {stats.ticket_medio.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por número, cliente, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <select value={filterOrigem} onChange={(e) => setFilterOrigem(e.target.value)} style={inputStyle}>
            <option value="">Todos os canais</option>
            <option value="mercado_livre">🏪 Mercado Livre</option>
            <option value="shopee">🛒 Shopee</option>
            <option value="site_b2c">🌐 Site B2C</option>
            <option value="whatsapp">💬 WhatsApp</option>
            <option value="b2b">📋 B2B</option>
            <option value="vendedora">👩‍💼 Vendedora</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputStyle}>
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="confirmado">Confirmado</option>
            <option value="separado">Separado</option>
            <option value="enviado">Enviado</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        {/* Lista de Pedidos */}
        <div style={cardStyle}>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#7070a0' }}>
              Nenhum pedido encontrado
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Canal</th>
                    <th style={thStyle}>Itens</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Lucro</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const origem = ORIGEM_LABELS[o.origem] || { label: o.origem, emoji: '📦', color: '#888' }
                    const status = STATUS_LABELS[o.status] || { label: o.status, color: '#888', bg: 'rgba(0,0,0,0.2)' }
                    return (
                      <tr key={o.id} style={{ cursor: 'pointer', borderBottom: '1px solid #2a2a4a' }} onClick={() => router.push(`/admin/pedidos/${o.id}`)}>
                        <td style={tdStyle}>
                          <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.85em' }}>{o.order_number}</div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ color: '#b0b0cc', fontSize: '0.85em' }}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em' }}>{new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ color: '#d0c0ff', fontSize: '0.9em' }}>{o.customer?.nome || '—'}</div>
                          {o.vendedor && <div style={{ color: '#7070a0', fontSize: '0.75em' }}>por {o.vendedor.nome}</div>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: `${origem.color}22`, color: origem.color, padding: '3px 10px', borderRadius: 12, fontSize: '0.8em', fontWeight: 600 }}>
                            {origem.emoji} {origem.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ color: '#b0b0cc', fontSize: '0.85em' }}>{o.items.length} {o.items.length === 1 ? 'item' : 'itens'}</div>
                          <div style={{ color: '#7070a0', fontSize: '0.75em', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.items[0]?.nome_produto}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ color: '#a78bfa', fontWeight: 600 }}>R$ {o.total.toFixed(2)}</div>
                        </td>
                        <td style={tdStyle}>
                          {o.lucro_liquido !== null ? (
                            <div style={{ color: o.lucro_liquido > 0 ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '0.9em' }}>
                              R$ {o.lucro_liquido.toFixed(2)}
                            </div>
                          ) : (
                            <div style={{ color: '#7070a0', fontSize: '0.85em' }}>—</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: status.bg, color: status.color, padding: '3px 10px', borderRadius: 12, fontSize: '0.8em', fontWeight: 600 }}>
                            {status.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: '#a78bfa', fontSize: '0.9em' }}>Ver →</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ ...btnSecondary, opacity: page === 1 ? 0.5 : 1 }}>
              ← Anterior
            </button>
            <span style={{ color: '#b0b0cc', padding: '0 16px' }}>Página {page} de {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ ...btnSecondary, opacity: page === totalPages ? 0.5 : 1 }}>
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const inputStyle = { padding: 10, background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: '0.9em' } as const
const statBox = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' as const }
const statLabel = { color: '#7070a0', fontSize: '0.7em', textTransform: 'uppercase' as const, marginBottom: 4 }
const statValue = { fontSize: '1.4em', fontWeight: 'bold' as const }
const thStyle = { padding: 12, textAlign: 'left' as const, color: '#a78bfa', fontSize: '0.75em', textTransform: 'uppercase' as const, borderBottom: '1px solid #2a2a4a' }
const tdStyle = { padding: 12 }
const btnSecondary = { padding: '8px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const

export default function PedidosPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#b0b0cc' }}>Carregando...</div>}>
      <PedidosContent />
    </Suspense>
  )
}
