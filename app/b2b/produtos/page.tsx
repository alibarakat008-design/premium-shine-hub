'use client'

/**
 * B2B PRODUTOS
 * - Top produtos do B2B
 * - Filtros por marca
 */

import { useEffect, useState } from 'react'

type TopProd = { sku: string; nome: string; marca: string; unidades: number; receita: number; pedidos: number }

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function B2bProdutosPage() {
  const [produtos, setProdutos] = useState<TopProd[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    fetch('/api/b2b/dashboard?meses=6')
      .then((r) => r.json())
      .then((j) => { setProdutos(j.top_produtos || []); setLoading(false) })
  }, [])

  const filtered = produtos.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.sku.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>🛍️ Produtos</h1>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0 0' }}>{produtos.length} produtos que você vende</p>
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..." style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, minWidth: 200 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#f9fafb' }}>
              <th style={th}>#</th>
              <th style={th}>Produto</th>
              <th style={th}>Marca</th>
              <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
              <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
              <th style={{ ...th, textAlign: 'right' }}>Receita</th>
            </tr></thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.sku} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, textAlign: 'center', color: i < 3 ? '#f59e0b' : '#9ca3af', fontWeight: 700, fontSize: 11 }}>#{i + 1}</td>
                  <td style={td}><div style={{ color: '#111827', fontWeight: 500 }}>{p.nome}</div><div style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>{p.sku}</div></td>
                  <td style={td}>{p.marca}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.pedidos}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.unidades}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{fmtBRL(p.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
