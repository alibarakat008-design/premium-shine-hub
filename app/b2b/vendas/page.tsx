'use client'

/**
 * B2B VENDAS
 * Lista de vendas com filtros e exportação
 */

import { useEffect, useState, useCallback } from 'react'

type Venda = {
  id: string
  order_number: string
  data: string
  total: number
  status: string
  cliente: string
  marketplace: string
  plataforma: string
  itens: number
  unidades: number
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const STATUS_COLORS: any = {
  pendente: '#6b7280', confirmado: '#3b82f6', separado: '#8b5cf6',
  enviado: '#f59e0b', entregue: '#10b981', cancelado: '#ef4444',
}
const STATUS_LABELS: any = {
  pendente: 'Pendente', confirmado: 'Confirmado', separado: 'Separado',
  enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado',
}

export default function B2bVendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(6)
  const [status, setStatus] = useState('todos')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/b2b/vendas?meses=${meses}&status=${status}&limit=100`)
      .then((r) => r.json())
      .then((j) => { setVendas(j.vendas || []); setTotal(j.total || 0); setLoading(false) })
  }, [meses, status])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>💰 Vendas</h1>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0 0' }}>{total.toLocaleString('pt-BR')} vendas no período</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={selectStyle}>
            <option value={1}>1 mês</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            <option value="todos">Todos status</option>
            <option value="confirmado">Confirmado</option>
            <option value="enviado">Enviado</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : vendas.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, color: '#9ca3af' }}>
          Nenhuma venda no período
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={th}>Pedido</th>
                  <th style={th}>Data</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Marketplace</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Itens</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>#{v.order_number}</td>
                    <td style={td}>{new Date(v.data).toLocaleDateString('pt-BR')}</td>
                    <td style={td}>{v.cliente}</td>
                    <td style={td}><div>{v.marketplace}</div><div style={{ fontSize: 9, color: '#6b7280', textTransform: 'capitalize' }}>{v.plataforma}</div></td>
                    <td style={td}><span style={{ padding: '2px 6px', background: STATUS_COLORS[v.status] + '20', color: STATUS_COLORS[v.status], borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{STATUS_LABELS[v.status] || v.status}</span></td>
                    <td style={{ ...td, textAlign: 'right' }}>{v.itens} ({v.unidades} un)</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmtBRL(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: '#111827', background: 'white' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
