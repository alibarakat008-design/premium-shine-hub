'use client'
import { useState, useEffect } from 'react'

interface Produto {
  id: string
  sku: string
  nome: string
  marca?: string
  ean?: string
  qtd_vendida: number
  receita_bruta: number
  preco_medio: number
  custo_unitario: number
  cmv_total: number
  lucro_bruto: number
  margem_pct: number
  estoque: number
  alerta: string
}

export default function MargemProdutoPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(3)
  const [ordenar, setOrdenar] = useState<'qtd' | 'margem' | 'lucro'>('qtd')
  const [limite, setLimite] = useState(100)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/relatorios/margem-produto?meses=${meses}&ordenar=${ordenar}&limite=${limite}`)
      const json = await r.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [meses, ordenar, limite])

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const corMargem = (m: number) =>
    m < 20 ? '#dc2626' : m < 35 ? '#f59e0b' : '#10b981'
  const bgMargem = (m: number) =>
    m < 20 ? '#fef2f2' : m < 35 ? '#fffbeb' : '#f0fdf4'

  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111', margin: 0 }}>
          💰 Margem por Produto
        </h1>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
          CMV × preço × quantidade vendida nos últimos {meses} meses
        </p>
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
            Período
          </label>
          <select value={meses} onChange={(e) => setMeses(parseInt(e.target.value, 10))} style={selectStyle}>
            <option value="1">Último mês</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Ordenar por
          </label>
          <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as any)} style={selectStyle}>
            <option value="qtd">Mais vendidos</option>
            <option value="margem">Menor margem</option>
            <option value="lucro">Maior lucro absoluto</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Limite
          </label>
          <select value={limite} onChange={(e) => setLimite(parseInt(e.target.value, 10))} style={selectStyle}>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </div>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : '🔄 Atualizar'}
        </button>
        {data?.resumo && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
            <CardPequeno label="Receita" valor={fmt(data.resumo.receita_bruta)} cor="#3b82f6" />
            <CardPequeno label="Lucro" valor={fmt(data.resumo.lucro_bruto)} cor="#10b981" />
            <CardPequeno label="Margem" valor={`${data.resumo.margem_media_pct}%`} cor="#f59e0b" />
            {data.resumo.produtos_alerta_margem > 0 && (
              <CardPequeno label="⚠️ Alerta" valor={data.resumo.produtos_alerta_margem} cor="#dc2626" />
            )}
          </div>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>}

      {!loading && data?.produtos?.length === 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            padding: '60px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#999',
          }}
        >
          Nenhum produto com venda no período
        </div>
      )}

      {!loading && data?.produtos?.length > 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #fafbfc)', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={thStyle}>Produto</th>
                  <th style={thStyle}>SKU</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Qtd</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Preço médio</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Custo unit.</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Receita</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CMV</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Lucro</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Margem</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Estoque</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Alerta</th>
                </tr>
              </thead>
              <tbody>
                {data.produtos.map((p: Produto, i: number) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : 'var(--psh-bg-secondary, #fafbfc)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{p.nome}</div>
                      {p.marca && <div style={{ fontSize: '11px', color: '#666' }}>{p.marca}</div>}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{p.sku}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{p.qtd_vendida}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.preco_medio)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.custo_unitario)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(p.receita_bruta)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>{fmt(p.cmv_total)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: corMargem(p.margem_pct), fontWeight: 700 }}>
                      {fmt(p.lucro_bruto)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'center',
                        background: bgMargem(p.margem_pct),
                        color: corMargem(p.margem_pct),
                        fontWeight: 700,
                      }}
                    >
                      {p.margem_pct.toFixed(1)}%
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{p.estoque}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: '11px' }}>{p.alerta}</td>
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

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--psh-text-secondary, #6b7280)',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  color: '#111',
}

function CardPequeno({ cor, label, valor }: { cor: string; label: string; valor: any }) {
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
      <div style={{ fontSize: '14px', fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}
