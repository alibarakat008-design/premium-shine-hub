'use client'
import { useState, useEffect } from 'react'

interface PedidoAtrasado {
  id: string
  order_number: string
  total: number
  status: string
  created_at: string
  horas_atraso: number
  conta: string
  qtd_items: number
  items: Array<{ sku: string; nome_produto: string; quantidade: number }>
}

export default function PedidosAtrasadosPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [horas, setHoras] = useState(24)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/alertas/pedidos-atrasados?horas=${horas}&limite=100`)
      const json = await r.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [horas])

  // Auto-refresh a cada 60s
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [horas, autoRefresh])

  const corFaixa = (h: number) =>
    h >= 72 ? '#dc2626' : h >= 48 ? '#f59e0b' : '#3b82f6'
  const bgFaixa = (h: number) =>
    h >= 72 ? '#fef2f2' : h >= 48 ? '#fffbeb' : '#eff6ff'

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111', margin: 0 }}>
            ⏰ Pedidos Atrasados
          </h1>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
            Pedidos pagos que estão há mais de {horas}h sem expedir
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#666' }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh 60s
        </label>
      </div>

      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Atraso mínimo (horas)
          </label>
          <select value={horas} onChange={(e) => setHoras(parseInt(e.target.value, 10))} style={selectStyle}>
            <option value="12">12h</option>
            <option value="24">24h</option>
            <option value="48">48h</option>
            <option value="72">72h</option>
            <option value="120">5 dias</option>
          </select>
        </div>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : '🔄 Atualizar'}
        </button>
        {data && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
            <CardPequeno cor="#3b82f6" label="24-48h" valor={data.faixas?.['24-48h'] || 0} />
            <CardPequeno cor="#f59e0b" label="48-72h" valor={data.faixas?.['48-72h'] || 0} />
            <CardPequeno cor="#dc2626" label="72h+" valor={data.faixas?.['72h+'] || 0} />
          </div>
        )}
      </div>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>
      )}

      {data && data.total_atrasados === 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            padding: '60px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#10b981',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>Tudo em dia!</div>
          <div style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
            Nenhum pedido com mais de {horas}h sem expedir
          </div>
        </div>
      )}

      {data && data.orders?.length > 0 && (
        <div style={{ display: 'grid', gap: '12px' }}>
          {data.orders.map((p: PedidoAtrasado) => (
            <div
              key={p.id}
              style={{
                background: 'var(--psh-bg-primary, white)',
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                borderLeft: `4px solid ${corFaixa(p.horas_atraso)}`,
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '16px',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>📦 {p.order_number}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  {p.conta} · {p.qtd_items} {p.qtd_items === 1 ? 'item' : 'itens'}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {p.items?.slice(0, 3).map((it, i) => (
                    <span key={i}>
                      {it.quantidade}× {it.sku}
                      {i < Math.min(p.items.length, 3) - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {p.items?.length > 3 && ` +${p.items.length - 3}`}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>
                  R$ {p.total.toFixed(2)}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>{new Date(p.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: bgFaixa(p.horas_atraso),
                  color: corFaixa(p.horas_atraso),
                  fontSize: '13px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                ⏰ {p.horas_atraso}h
                <div style={{ fontSize: '10px', fontWeight: 500, marginTop: '2px' }}>
                  {p.horas_atraso >= 72 ? 'URGENTE' : p.horas_atraso >= 48 ? 'ATRASADO' : 'ATENÇÃO'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: 'var(--psh-bg-primary, white)',
  outline: 'none',
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

function CardPequeno({ cor, label, valor }: { cor: string; label: string; valor: number }) {
  return (
    <div
      style={{
        background: 'var(--psh-bg-secondary, #fafbfc)',
        padding: '8px 14px',
        borderRadius: '8px',
        borderLeft: `3px solid ${cor}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '10px', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}
