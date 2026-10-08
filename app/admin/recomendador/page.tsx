'use client'

/**
 * RECOMENDADOR DE PRODUTOS
 * - Top 5 produtos recomendados pra cada cliente
 * - Score combinado: cross-sell + marca + gênero + preço
 * - Lista ordenada por LTV
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Rec = {
  sku: string; nome: string; marca: string; genero: string | null; preco: number
  score: number; motivo: string; lift: number
}

type Cliente = {
  cliente_id: string; cliente_nome: string; cliente_telefone: string | null; cliente_email: string | null
  total_pedidos: number; ticket_medio: number
  marcas_preferidas: string[]
  generos_preferidos: string[]
  recomendacoes: Rec[]
}

export default function RecomendadorPage() {
  const [data, setData] = useState<{ total_clientes: number; clientes: Cliente[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [topPorCliente, setTopPorCliente] = useState(5)
  const [limit, setLimit] = useState(100)
  const [expandido, setExpandido] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/recomendador?top_por_cliente=${topPorCliente}&limit=${limit}')
      const j = await r.json()
      if (j.ok) setData(j)
    } finally { setLoading(false) }
  }, [topPorCliente, limit])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🎯 Recomendador de Produtos</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Top 5 produtos recomendados por cliente (cross-sell + perfil)</p>
        </div>
        <Link href="/admin/cross-sell" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Cross-Sell</Link>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Recomendações por cliente:</label>
        <select value={topPorCliente} onChange={(e) => setTopPorCliente(Number(e.target.value))} style={selectStyle}>
          <option value={3}>Top 3</option>
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
        </select>
        <label style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Clientes:</label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={selectStyle}>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={200}>Top 200</option>
        </select>
      </div>

      {data && (
        <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
          {data.total_clientes} clientes com recomendações geradas
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Gerando recomendações...</div>
      ) : data && data.clientes ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.clientes.map((c) => (
            <div key={c.cliente_id} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{c.cliente_nome}</div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
                    {c.total_pedidos} pedidos • Ticket R$ {c.ticket_medio.toFixed(2)} • Marcas: {c.marcas_preferidas.join(', ') || '—'} • Gênero: {c.generos_preferidos.join(', ') || '—'}
                  </div>
                </div>
                {c.cliente_telefone && (
                  <a href={`https://wa.me/55${c.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', background: '#10b981', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>💬</a>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {c.recomendacoes.map((r, i) => (
                  <div key={r.sku} style={{ padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: '#3b82f6', color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>#{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome}</div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{r.marca} • {r.preco > 0 ? `R$ ${r.preco.toFixed(2)}` : '—'}</div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--psh-border, #e5e7eb)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${r.score}%`, height: '100%', background: r.score >= 50 ? '#10b981' : r.score >= 25 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)' }} />
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--psh-text-primary, #111827)', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{r.score}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>💡 {r.motivo}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.clientes.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum cliente com recomendações</div>}
        </div>
      ) : null}
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
