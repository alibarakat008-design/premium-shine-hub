'use client'

/**
 * RASTREAMENTO DE PEDIDOS
 * Lista de orders com status, código de rastreio, transportadora
 * - Filtros: status, com/sem rastreio
 * - Atualização manual de status (com audit log)
 * - Atualização em massa
 * - Refresh individual via Mercado Livre
 * - Detalhe de cada pedido: itens, valor, dados de envio
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Order = {
  id: string
  order_number: string
  data: string
  status: string
  tracking_number: string | null
  transportadora: string | null
  previsao_entrega: string | null
  data_envio: string | null
  data_entrega: string | null
  total: number
  conta: string
  plataforma: string
  itens: { id: string; sku: string; nome: string; foto: string | null; quantidade: number; preco_total: number }[]
  itens_count: number
}

type Resumo = {
  total: number
  sem_rastreio: number
  com_rastreio: number
  por_status: Record<string, number>
}

const STATUS_COLORS: Record<string, string> = {
  pendente: 'var(--psh-text-secondary, #6b7280)',
  confirmado: '#3b82f6',
  separado: '#8b5cf6',
  enviado: '#f59e0b',
  entregue: '#10b981',
  cancelado: '#ef4444',
  devolvido: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  separado: 'Separado',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  devolvido: 'Devolvido',
}

const STATUS_OPTIONS = ['pendente', 'confirmado', 'separado', 'enviado', 'entregue', 'cancelado', 'devolvido']

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')

export default function RastreamentoPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [onlySemRastreio, setOnlySemRastreio] = useState(false)
  const [detalhe, setDetalhe] = useState<Order | null>(null)
  const [editando, setEditando] = useState<Order | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ days: String(days) })
      if (statusFilter !== 'todos') params.set('status', statusFilter)
      if (onlySemRastreio) params.set('sem_rastreio', 'true')
      const r = await apiFetch(`/api/admin/orders/shipments?${params}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setOrders(j.orders)
      setResumo({ total: j.total, sem_rastreio: j.sem_rastreio, com_rastreio: j.com_rastreio, por_status: j.por_status })
      setSelecionados(new Set())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days, statusFilter, onlySemRastreio])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    if (selecionados.size === orders.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(orders.map((o) => o.id)))
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📦 Rastreamento de Pedidos</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Status, código de rastreio e transportadora</p>
        </div>
        <Link href="/admin/pedidos" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Pedidos</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {/* KPIs */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi label="Total pedidos" value={resumo.total} color="#3b82f6" />
          <Kpi label="Com rastreio" value={resumo.com_rastreio} color="#10b981" />
          <Kpi label="Sem rastreio" value={resumo.sem_rastreio} color="#ef4444" />
          {Object.entries(resumo.por_status).slice(0, 3).map(([k, v]) => (
            <Kpi key={k} label={STATUS_LABELS[k] || k} value={v as number} color={STATUS_COLORS[k] || 'var(--psh-text-secondary, #6b7280)'} />
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value={7}>7 dias</option>
          <option value={15}>15 dias</option>
          <option value={30}>30 dias</option>
          <option value={60}>60 dias</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="todos">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="confirmado">Confirmado</option>
          <option value="separado">Separado</option>
          <option value="enviado">Enviado</option>
          <option value="entregue">Entregue</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlySemRastreio} onChange={(e) => setOnlySemRastreio(e.target.checked)} />
          Só sem rastreio
        </label>
        {selecionados.size > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>{selecionados.size} selecionados</span>
            <button
              onClick={() => setBulkOpen(true)}
              style={{ padding: '6px 12px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              ⚡ Atualizar em massa
            </button>
            <button
              onClick={() => setSelecionados(new Set())}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          Nenhum pedido encontrado
        </div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ ...th, width: 30 }}>
                    <input
                      type="checkbox"
                      checked={orders.length > 0 && selecionados.size === orders.length}
                      onChange={toggleTodos}
                    />
                  </th>
                  <th style={th}>Pedido</th>
                  <th style={th}>Data</th>
                  <th style={th}>Itens</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={th}>Status</th>
                  <th style={th}>Rastreio</th>
                  <th style={th}>Previsão</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6', background: selecionados.has(o.id) ? '#eff6ff' : 'white' }}>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(o.id)}
                        onChange={() => toggleSelecionado(o.id)}
                      />
                    </td>
                    <td style={td} onClick={() => setDetalhe(o)}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 600 }}>#{o.order_number}</div>
                      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{o.conta || o.plataforma}</div>
                    </td>
                    <td style={td} onClick={() => setDetalhe(o)}>{fmtDate(o.data)}</td>
                    <td style={td} onClick={() => setDetalhe(o)}>{o.itens_count}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }} onClick={() => setDetalhe(o)}>{fmtBRL(o.total)}</td>
                    <td style={td} onClick={() => setDetalhe(o)}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: STATUS_COLORS[o.status || 'pendente'],
                          color: 'var(--psh-bg-primary, white)',
                        }}
                      >
                        {STATUS_LABELS[o.status || 'pendente']}
                      </span>
                    </td>
                    <td style={td} onClick={() => setDetalhe(o)}>
                      {o.tracking_number ? (
                        <div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--psh-text-primary, #111827)' }}>{o.tracking_number}</div>
                          {o.transportadora && <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{o.transportadora}</div>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={td} onClick={() => setDetalhe(o)}>{fmtDate(o.previsao_entrega)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditando(o) }}
                          style={{ background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                          title="Atualizar status manualmente"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const ok = confirm(`Buscar status atual do pedido #${o.order_number} no Mercado Livre?`)
                            if (!ok) return
                            const r = await apiFetch('/api/admin/orders/${o.id}/refresh', { method: 'POST' })
                            const j = await r.json()
                            if (j.ok && j.mudou) {
                              alert(`✓ Atualizado! Status ML: ${j.ml_status}`)
                              fetchData()
                            } else if (j.ok && !j.mudou) {
                              alert('Sem mudanças no ML')
                            } else {
                              alert('Erro: ' + j.error)
                            }
                          }}
                          style={{ background: '#8b5cf6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                          title="Buscar status do Mercado Livre"
                        >
                          🔄
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetalhe(o) }}
                          style={{ background: 'transparent', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}
                        >
                          👁️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalhe && <DetalheModal order={detalhe} onClose={() => setDetalhe(null)} onEdit={() => { setEditando(detalhe); setDetalhe(null) }} />}
      {editando && <EditarModal order={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); fetchData() }} />}
      {bulkOpen && (
        <BulkModal
          ids={Array.from(selecionados)}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function DetalheModal({ order, onClose, onEdit }: { order: Order; onClose: () => void; onEdit: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--psh-bg-primary, white)',
          borderRadius: 12,
          zIndex: 1001,
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>Pedido #{order.order_number}</div>
            <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{fmtDate(order.data)} • {order.conta || order.plataforma}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onEdit}
              style={{ padding: '6px 12px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              ✏️ Editar
            </button>
            <button onClick={onClose} style={{ width: 32, height: 32, border: '1px solid #e5e7eb', background: 'var(--psh-bg-primary, white)', borderRadius: 6, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {/* Status atual */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Status atual:</span>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: STATUS_COLORS[order.status || 'pendente'],
                color: 'var(--psh-bg-primary, white)',
              }}
            >
              {STATUS_LABELS[order.status || 'pendente']}
            </span>
          </div>

          {/* Rastreio */}
          <div style={{ background: 'var(--psh-bg-secondary, #fafbfc)', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 6 }}>📦 Envio</div>
            {order.tracking_number ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--psh-text-primary, #111827)' }}>
                  <strong>Rastreio:</strong> <span style={{ fontFamily: 'monospace' }}>{order.tracking_number}</span>
                </div>
                {order.transportadora && (
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 4 }}>
                    <strong>Transportadora:</strong> {order.transportadora}
                  </div>
                )}
                {order.previsao_entrega && (
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 4 }}>
                    <strong>Previsão de entrega:</strong> {fmtDate(order.previsao_entrega)}
                  </div>
                )}
                {order.data_envio && (
                  <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                    ✓ Enviado em {fmtDate(order.data_envio)}
                  </div>
                )}
                {order.data_entrega && (
                  <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                    ✓ Entregue em {fmtDate(order.data_entrega)}
                  </div>
                )}
                {order.transportadora && order.tracking_number && (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(order.transportadora + ' rastreio ' + order.tracking_number)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 8, padding: '6px 12px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
                  >
                    🔍 Rastrear na transportadora
                  </a>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #9ca3af)', fontStyle: 'italic' }}>Sem código de rastreio</div>
            )}
          </div>

          {/* Itens */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 6 }}>Itens ({order.itens.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {order.itens.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 6 }}>
                  {it.foto ? <img src={it.foto} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome}</div>
                    <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{it.sku} • ×{it.quantidade}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(it.preco_total)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', fontSize: 14 }}>
            <span style={{ fontWeight: 600, color: 'var(--psh-text-primary, #374151)' }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(order.total)}</span>
          </div>
        </div>
      </div>
    </>
  )
}

function EditarModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(order.status || 'pendente')
  const [tracking, setTracking] = useState(order.tracking_number || '')
  const [transportadora, setTransportadora] = useState(order.transportadora || '')
  const [previsao, setPrevisao] = useState(order.previsao_entrega ? new Date(order.previsao_entrega).toISOString().slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await apiFetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({
          status,
          codigo_rastreio: tracking || null,
          transportadora: transportadora || null,
          previsao_entrega: previsao || null,
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      onSaved()
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setSaving(false)
    }
  }
  const handleRefreshFromML = async () => {
    if (!confirm('Buscar status atual do pedido no Mercado Livre? Os campos preenchidos serão sobrescritos.')) return
    setRefreshing(true)
    try {
      const r = await apiFetch(`/api/admin/orders/${order.id}/refresh`, {
        method: 'POST',
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      if (j.mudou) {
        alert(`✓ Atualizado do ML! Status: ${j.ml_status}`)
        onSaved()
      } else {
        alert('Sem mudanças no ML')
        onClose()
      }
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setRefreshing(false)
    }
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxWidth: '95vw',
          background: 'var(--psh-bg-primary, white)',
          borderRadius: 12,
          zIndex: 1001,
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>Atualizar Pedido #{order.order_number}</div>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>Status, rastreio, transportadora</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', background: 'var(--psh-bg-primary, white)', borderRadius: 6, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Código de rastreio">
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Ex: BR1234567890"
              style={inputStyle}
            />
          </Field>
          <Field label="Transportadora">
            <input
              type="text"
              value={transportadora}
              onChange={(e) => setTransportadora(e.target.value)}
              placeholder="Ex: Correios, Total Express, Mercado Envios"
              style={inputStyle}
            />
          </Field>
          <Field label="Previsão de entrega">
            <input
              type="date"
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <button
              onClick={handleRefreshFromML}
              disabled={refreshing}
              style={{ flex: 1, padding: '8px 12px', background: 'var(--psh-bg-primary, white)', border: '1px solid #8b5cf6', color: '#8b5cf6', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer' }}
            >
              {refreshing ? '⏳ Buscando...' : '🔄 Buscar do ML'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, padding: '8px 12px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
function BulkModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState('enviado')
  const [tracking, setTracking] = useState('')
  const [transportadora, setTransportadora] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [aplicarRastreio, setAplicarRastreio] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])
  const handleSave = async () => {
    if (!confirm(`Atualizar ${ids.length} pedidos para status "${STATUS_LABELS[status]}"?`)) return
    setSaving(true)
    try {
      const body: any = { ids, status }
      if (aplicarRastreio) {
        if (tracking) body.codigo_rastreio = tracking
        if (transportadora) body.transportadora = transportadora
        if (previsao) body.previsao_entrega = previsao
      }
      const r = await apiFetch('/api/admin/orders/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      alert(`✓ ${j.total_atualizados} pedidos atualizados`)
      onSaved()
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520,
          maxWidth: '95vw',
          background: 'var(--psh-bg-primary, white)',
          borderRadius: 12,
          zIndex: 1001,
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>⚡ Atualização em Massa</div>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{ids.length} pedidos selecionados</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', background: 'var(--psh-bg-primary, white)', borderRadius: 6, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Novo status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--psh-text-primary, #374151)', cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={aplicarRastreio} onChange={(e) => setAplicarRastreio(e.target.checked)} />
            Aplicar rastreio/transportadora para todos
          </label>
          {aplicarRastreio && (
            <>
              <Field label="Código de rastreio (opcional)">
                <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Deixe vazio pra não alterar" style={inputStyle} />
              </Field>
              <Field label="Transportadora (opcional)">
                <input type="text" value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Deixe vazio pra não alterar" style={inputStyle} />
              </Field>
              <Field label="Previsão de entrega (opcional)">
                <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={inputStyle} />
              </Field>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '8px 12px', background: 'var(--psh-bg-primary, white)', border: '1px solid #d1d5db', color: 'var(--psh-text-primary, #374151)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 2, padding: '8px 12px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? '⏳ Salvando...' : `💾 Atualizar ${ids.length} pedidos`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)' }
function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value.toLocaleString('pt-BR')}</div>
    </div>
  )
}
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', cursor: 'pointer' }
