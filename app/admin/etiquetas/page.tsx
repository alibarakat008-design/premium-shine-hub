'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'

interface Etiqueta {
  sku: string
  titulo: string
  quantidade: number
  preco_unitario: number
  marca: string
  order_id: number
  order_number: string
  item_id: number
}

interface Pedido {
  id: number
  order_number: string
  total: number
  status: string
  origem: string
  plataforma: string
  conta: string
  envio_full: boolean
  etiqueta_impressa: boolean
  etiqueta_impressa_em: string | null
  created_at: string
  total_etiquetas: number
  etiquetas: Etiqueta[]
}

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (s: string) => {
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function EtiquetasPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterPlataforma, setFilterPlataforma] = useState('')
  const [filterFull, setFilterFull] = useState('all')
  const [filterImpresso, setFilterImpresso] = useState('nao')
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState('')
  const [etiquetasPorPagina, setEtiquetasPorPagina] = useState(1)
const [formato, setFormato] = useState<'ml' | 'picking'>('ml')

  const totalEtiquetas = pedidos
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + p.total_etiquetas, 0)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: filterStatus,
        ja_impresso: filterImpresso,
        limit: '200',
      })
      if (filterPlataforma) params.set('plataforma', filterPlataforma)
      if (filterFull !== 'all') params.set('envio_full', filterFull)
      if (dataInicio) params.set('data_inicio', dataInicio)
      if (dataFim) params.set('data_fim', dataFim)

      const r = await fetch(`/api/admin/etiquetas?${params}`)
      const json = await r.json()
      if (json.ok) {
        setPedidos(json.pedidos || [])
        setSelected(new Set())
      }
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterPlataforma, filterFull, filterImpresso, dataInicio, dataFim])

  useEffect(() => {
    carregar()
  }, [carregar])

  const toggleSelect = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => {
    if (selected.size === pedidos.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pedidos.map((p) => p.id)))
    }
  }

  const imprimir = () => {
    if (selected.size === 0) {
      alert('Selecione pelo menos 1 pedido')
      return
    }
    const ids = Array.from(selected).join(',')
    // Usa endpoint HTML server-side (não precisa de auth cross-window)
    const url = `/api/admin/etiquetas/html?ids=${ids}&por_pagina=${etiquetasPorPagina}&formato=${formato}`
    window.open(url, '_blank', 'width=900,height=700')
  }

  const marcarImpresso = async () => {
    if (selected.size === 0) return
    const r = await apiFetch('/api/admin/etiquetas/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ids: Array.from(selected) }),
    })
    const j = await r.json()
    if (j.ok) {
      alert(`✅ ${j.atualizados} pedidos marcados como etiqueta impressa`)
      carregar()
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111', margin: 0 }}>
          🏷️ Impressão de Etiquetas
        </h1>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
          Selecione os pedidos e imprima etiquetas com SKU visível para facilitar o picking
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="todos">Todos (não cancelados)</option>
            <option value="confirmado,separado,enviado,entregue">Pagos (todos após pagamento)</option>
            <option value="confirmado">Só Confirmado</option>
            <option value="separado">Só Separado</option>
            <option value="enviado">Só Enviado</option>
            <option value="confirmado,separado">Confirmado + Separado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Plataforma
          </label>
          <select
            value={filterPlataforma}
            onChange={(e) => setFilterPlataforma(e.target.value)}
            style={selectStyle}
          >
            <option value="">Todas</option>
            <option value="mercado_livre">Mercado Livre</option>
            <option value="shopee">Shopee</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Envio
          </label>
          <select
            value={filterFull}
            onChange={(e) => setFilterFull(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Todos</option>
            <option value="true">Só FULL</option>
            <option value="false">Sem FULL</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Impressão
          </label>
          <select
            value={filterImpresso}
            onChange={(e) => setFilterImpresso(e.target.value)}
            style={selectStyle}
          >
            <option value="nao">Não impressas</option>
            <option value="sim">Já impressas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Período rápido
          </label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[
              { label: 'Hoje', dias: 0 },
              { label: '7d', dias: 7 },
              { label: '30d', dias: 30 },
              { label: '90d', dias: 90 },
              { label: 'Tudo', dias: 3650 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  if (opt.dias === 0) {
                    const hoje = new Date().toISOString().split('T')[0]
                    setDataInicio(hoje)
                    setDataFim(hoje)
                  } else if (opt.dias >= 3650) {
                    setDataInicio('2020-01-01')
                    setDataFim('')
                  } else {
                    const dt = new Date(Date.now() - opt.dias * 24 * 3600 * 1000)
                    setDataInicio(dt.toISOString().split('T')[0])
                    setDataFim('')
                  }
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  background: 'var(--psh-bg-primary, white)',
                  color: 'var(--psh-text-primary, #374151)',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Data início
          </label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Data fim
          </label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Formato
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setFormato('ml')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: formato === 'ml' ? '#3b82f6' : 'white',
                color: formato === 'ml' ? 'white' : 'var(--psh-text-primary, #374151)',
                border: '1px solid ' + (formato === 'ml' ? '#3b82f6' : 'var(--psh-border, #d1d5db)'),
                borderRadius: '6px',
                cursor: 'pointer',
                flex: 1,
              }}
            >
              📦 Etiqueta ML
            </button>
            <button
              onClick={() => setFormato('picking')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: formato === 'picking' ? '#3b82f6' : 'white',
                color: formato === 'picking' ? 'white' : 'var(--psh-text-primary, #374151)',
                border: '1px solid ' + (formato === 'picking' ? '#3b82f6' : 'var(--psh-border, #d1d5db)'),
                borderRadius: '6px',
                cursor: 'pointer',
                flex: 1,
              }}
            >
              🏷️ Picking
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Por página
          </label>
          <select
            value={etiquetasPorPagina}
            onChange={(e) => setEtiquetasPorPagina(parseInt(e.target.value, 10))}
            style={selectStyle}
          >
            {formato === 'ml' ? (
              <>
                <option value="1">1 etiqueta ML (padrão)</option>
                <option value="2">2 etiquetas ML</option>
              </>
            ) : (
              <>
                <option value="4">4 etiquetas (padrão)</option>
                <option value="8">8 (denso)</option>
                <option value="12">12 (pequeno)</option>
                <option value="21">21 (picking rápido)</option>
              </>
            )}
          </select>
        </div>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : '🔄 Atualizar'}
        </button>
      </div>

      {/* Resumo + ações */}
      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          padding: '16px 20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '14px', color: '#444' }}>
          <strong>{pedidos.length}</strong> pedidos • <strong>{totalEtiquetas}</strong> etiquetas selecionadas
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={selectAll}
          disabled={pedidos.length === 0}
          style={btnSecondary}
        >
          {selected.size === pedidos.length && pedidos.length > 0 ? '☐ Desmarcar' : '☑ Selecionar todos'}
        </button>
        <button onClick={marcarImpresso} disabled={selected.size === 0} style={btnSecondary}>
          ✅ Marcar impressas
        </button>
        <button
          onClick={imprimir}
          disabled={selected.size === 0}
          style={{
            ...btnPrimary,
            background: selected.size > 0 ? '#10b981' : 'var(--psh-border, #d1d5db)',
            cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          🖨️ Imprimir {selected.size > 0 ? `(${totalEtiquetas})` : ''}
        </button>
      </div>

      {/* Lista de pedidos */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Carregando pedidos...
        </div>
      )}

      {!loading && pedidos.length === 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            padding: '60px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#999',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <div style={{ fontSize: '16px' }}>Nenhum pedido encontrado com esses filtros</div>
        </div>
      )}

      {!loading && pedidos.length > 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #fafbfc)', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>
                  <input
                    type="checkbox"
                    checked={selected.size === pedidos.length}
                    onChange={selectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={thStyle}>Pedido</th>
                <th style={thStyle}>Plataforma</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>FULL</th>
                <th style={thStyle}>Itens</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Impresso</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: selected.has(p.id) ? '#eff6ff' : 'transparent',
                  }}
                >
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.order_number}</td>
                  <td style={tdStyle}>
                    {p.plataforma === 'mercado_livre' ? '🛒 ML' : p.plataforma === 'shopee' ? '🛍️ Shopee' : p.origem}
                    <div style={{ fontSize: '11px', color: '#999' }}>{p.conta}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStatus(p.status)}>{p.status}</span>
                  </td>
                  <td style={tdStyle}>{p.envio_full ? '✅' : '—'}</td>
                  <td style={tdStyle}>
                    <strong>{p.total_etiquetas}</strong> etiquetas
                  </td>
                  <td style={tdStyle}>{fmtBRL(p.total)}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{fmtDate(p.created_at)}</td>
                  <td style={tdStyle}>
                    {p.etiqueta_impressa ? (
                      <span style={{ fontSize: '11px', color: '#10b981' }}>
                        ✅ {fmtDate(p.etiqueta_impressa_em || '')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--psh-text-secondary, #9ca3af)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: 'var(--psh-bg-primary, white)',
  outline: 'none',
}

const inputStyle: React.CSSProperties = {
  ...selectStyle,
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  background: '#3b82f6',
  color: 'var(--psh-bg-primary, white)',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  background: 'var(--psh-bg-primary, white)',
  color: 'var(--psh-text-primary, #374151)',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  cursor: 'pointer',
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--psh-text-secondary, #6b7280)',
  textTransform: 'uppercase',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  color: '#111',
}

const badgeStatus = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; fg: string }> = {
    confirmado: { bg: '#dbeafe', fg: '#1e40af' },
    separado: { bg: '#fef3c7', fg: '#92400e' },
    enviado: { bg: '#d1fae5', fg: '#065f46' },
    entregue: { bg: '#d1fae5', fg: '#065f46' },
    cancelado: { bg: '#fee2e2', fg: '#991b1b' },
  }
  const c = colors[status] || { bg: 'var(--psh-bg-secondary, #f3f4f6)', fg: 'var(--psh-text-primary, #374151)' }
  return {
    background: c.bg,
    color: c.fg,
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    display: 'inline-block',
  }
}
