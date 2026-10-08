'use client'

/**
 * ANÁLISES AVANÇADAS
 * - Heatmap 2D: dia da semana × hora (vendas)
 * - Produtos parados (sem vendas há 30+ dias)
 * - Produtos com margem baixa (< 15%)
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Celula = { count: number; receita: number }
type Parado = {
  id: string
  sku: string
  nome: string
  foto: string | null
  custo: number
  preco: number
  ultima_venda: string | null
  vendas_total: number
  dias_parado: number
}
type MargemBaixa = {
  product_id: string
  sku: string
  nome: string
  foto: string | null
  custo: number
  preco: number
  margem_pct: number
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const HOras = Array.from({ length: 24 }, (_, i) => i)

export default function AnalisesPage() {
  const [aba, setAba] = useState<'heatmap' | 'parados' | 'margem'>('heatmap')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState<{ dias: string[]; matrix: Celula[][]; max_count: number; total: number } | null>(null)
  const [parados, setParados] = useState<{ dias_limite: number; count: number; items: Parado[] } | null>(null)
  const [margem, setMargem] = useState<{ count: number; items: MargemBaixa[] } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch(`/api/admin/sales-heatmap?days=${days}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setHeatmap(j.heatmap)
      setParados(j.produtos_parados)
      setMargem(j.margem_baixa)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📊 Análises Avançadas</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Heatmap, produtos parados e margem baixa</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <Link href="/admin/insights" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>💡 Insights</Link>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {[
          { id: 'heatmap', label: '🔥 Heatmap Horário' },
          { id: 'parados', label: `⏸️ Produtos Parados (${parados?.count || 0})` },
          { id: 'margem', label: `📉 Margem Baixa (${margem?.count || 0})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: aba === t.id ? 'var(--psh-text-primary, #111827)' : 'transparent',
              color: aba === t.id ? 'white' : 'var(--psh-text-primary, #374151)',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              borderBottom: aba === t.id ? '2px solid #111827' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
      ) : aba === 'heatmap' ? (
        <HeatmapView heatmap={heatmap} />
      ) : aba === 'parados' ? (
        <ParadosView data={parados} />
      ) : (
        <MargemBaixaView data={margem} />
      )}
    </div>
  )
}

function HeatmapView({ heatmap }: { heatmap: any }) {
  if (!heatmap) return <div>Sem dados</div>
  const { dias, matrix, max_count, total } = heatmap

  // Função pra colorir a célula
  const colorCell = (count: number) => {
    if (count === 0) return 'var(--psh-bg-secondary, #f3f4f6)'
    const intensity = count / max_count
    if (intensity > 0.7) return '#7c3aed'
    if (intensity > 0.5) return '#a78bfa'
    if (intensity > 0.3) return '#c4b5fd'
    if (intensity > 0.1) return '#ddd6fe'
    return '#ede9fe'
  }

  return (
    <div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, overflowX: 'auto' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 4px 0' }}>
          🔥 Heatmap: Vendas por dia da semana × hora do dia
        </h2>
        <p style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', margin: '0 0 16px 0' }}>
          Total: <strong>{total}</strong> vendas • Quanto mais escuro, mais vendas no horário
        </p>
        <div style={{ minWidth: 800 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(24, 1fr)', gap: 2 }}>
            {/* Header com horas */}
            <div></div>
            {HOras.map((h) => (
              <div key={h} style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', textAlign: 'center', fontWeight: 500 }}>
                {h}
              </div>
            ))}

            {/* Linhas */}
            {dias.map((dia, di) => (
              <>
                <div key={dia} style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-primary, #374151)', display: 'flex', alignItems: 'center' }}>{dia}</div>
                {matrix[di].map((cell: Celula, hi: number) => (
                  <div
                    key={`${di}-${hi}`}
                    style={{
                      aspectRatio: '1/1.2',
                      background: colorCell(cell.count),
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      minHeight: 28,
                    }}
                    title={`${dia} ${hi}h: ${cell.count} vendas • R$ ${cell.receita.toFixed(0)}`}
                  >
                    {cell.count > 0 && (
                      <span style={{ fontSize: 8, color: cell.count > max_count * 0.3 ? 'white' : '#6b21a8', fontWeight: 600 }}>
                        {cell.count}
                      </span>
                    )}
                  </div>
                ))}
              </>
            ))}
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
            <span>Menos</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {['var(--psh-bg-secondary, #f3f4f6)', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#7c3aed'].map((c) => (
                <div key={c} style={{ width: 24, height: 14, background: c, borderRadius: 2 }} />
              ))}
            </div>
            <span>Mais vendas</span>
          </div>
        </div>
      </div>

      {/* Insights do heatmap */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {(() => {
          // Top 3 horários com mais vendas
          const allCells: { dia: string; hora: number; count: number; receita: number }[] = []
          matrix.forEach((row: Celula[], di: number) => {
            row.forEach((cell, hi) => {
              allCells.push({ dia: dias[di], hora: hi, count: cell.count, receita: cell.receita })
            })
          })
          const topCells = [...allCells].sort((a, b) => b.count - a.count).slice(0, 3)
          return topCells.map((c, i) => (
            <div key={i} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500 }}>🔥 {i === 0 ? 'Pico' : i === 1 ? '2º lugar' : '3º lugar'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginTop: 4 }}>
                {c.dia} às {c.hora}h
              </div>
              <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>
                {c.count} vendas • R$ {c.receita.toFixed(0)}
              </div>
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

function ParadosView({ data }: { data: any }) {
  if (!data) return <div>Sem dados</div>
  if (data.count === 0) {
    return <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: '#10b981' }}>✅ Nenhum produto parado! Tudo vendendo nos últimos {data.dias_limite} dias.</div>
  }
  return (
    <div>
      <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
        💡 {data.count} produtos sem vendas há mais de <strong>{data.dias_limite} dias</strong>. Considere descontinuar, fazer promoção ou aumentar estoque dos que vendiam bem antes.
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>Produto</th>
              <th style={{ ...th, textAlign: 'right' }}>Vendas total</th>
              <th style={{ ...th, textAlign: 'right' }}>Última venda</th>
              <th style={{ ...th, textAlign: 'right' }}>Parado há</th>
              <th style={{ ...th, textAlign: 'right' }}>Preço</th>
              <th style={{ ...th, textAlign: 'right' }}>Custo</th>
              <th style={th}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p: Parado) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.foto ? <img src={p.foto} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{p.sku}</div>
                    </div>
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{p.vendas_total}</td>
                <td style={{ ...td, textAlign: 'right', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>{p.ultima_venda ? new Date(p.ultima_venda).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, color: p.dias_parado > 60 ? '#ef4444' : p.dias_parado > 30 ? '#f59e0b' : '#3b82f6' }}>
                    {p.dias_parado}d
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(p.preco)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(p.custo)}</td>
                <td style={td}>
                  <Link
                    href={`/admin/produtos/${p.sku}`}
                    style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MargemBaixaView({ data }: { data: any }) {
  if (!data) return <div>Sem dados</div>
  if (data.count === 0) {
    return <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: '#10b981' }}>✅ Todos os produtos com custo têm margem saudável (≥ 15%)</div>
  }
  return (
    <div>
      <div style={{ padding: 12, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#991b1b' }}>
        🚨 <strong>{data.count} produtos</strong> com margem abaixo de 15%. Revise o preço de venda ou negocie o custo com fornecedor.
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>Produto</th>
              <th style={{ ...th, textAlign: 'right' }}>Preço</th>
              <th style={{ ...th, textAlign: 'right' }}>Custo</th>
              <th style={{ ...th, textAlign: 'right' }}>Lucro/un</th>
              <th style={{ ...th, textAlign: 'right' }}>Margem</th>
              <th style={th}>Sugestão</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p: MargemBaixa) => {
              const lucro = p.preco - p.custo
              const novo_preco_sugerido = p.custo / 0.30 // margem 30%
              const cor = p.margem_pct < 5 ? '#ef4444' : p.margem_pct < 10 ? '#f59e0b' : '#3b82f6'
              return (
                <tr key={p.product_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.foto ? <img src={p.foto} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{p.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(p.preco)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#dc2626' }}>{fmtBRL(p.custo)}</td>
                  <td style={{ ...td, textAlign: 'right', color: lucro > 0 ? '#10b981' : '#ef4444' }}>{fmtBRL(lucro)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: cor }}>{p.margem_pct.toFixed(1)}%</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
                    💡 Ajustar p/ {fmtBRL(novo_preco_sugerido)} (margem 30%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }
