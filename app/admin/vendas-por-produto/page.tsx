'use client'

/**
 * VENDAS POR MÊS POR PRODUTO
 *
 * Tabela:
 * - Linhas: produtos
 * - Colunas: meses (qtd + receita)
 * - Comparativo: semana passada vs semana retrasada
 * - Filtro: só FULL
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type PorMes = { qtd: number; receita: number }
type Produto = {
  id: string
  sku: string
  nome: string
  foto: string | null
  custo: number
  isFull: boolean
  total: number
  receita: number
  custoTotal: number
  lucro: number
  margem_pct: number
  variacao_semana_pct: number
  lastWeek: number
  prevWeek: number
  porMes: PorMes[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function VendasPorProdutoPage() {
  const [labels, setLabels] = useState<string[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meses, setMeses] = useState(6)
  const [onlyFull, setOnlyFull] = useState(false)
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<'receita' | 'qtd' | 'margem' | 'variacao'>('receita')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const url = `/api/admin/sales-by-product?meses=${meses}${onlyFull ? '&full=true' : ''}&limit=100`
      const r = await apiFetch(url, { })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setLabels(j.labels)
      setProdutos(j.produtos)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [meses, onlyFull])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  const produtosFiltrados = produtos
    .filter((p) => {
      if (!busca) return true
      const b = busca.toLowerCase()
      return p.nome.toLowerCase().includes(b) || p.sku.toLowerCase().includes(b)
    })
    .sort((a, b) => {
      switch (ordenacao) {
        case 'qtd': return b.total - a.total
        case 'margem': return b.margem_pct - a.margem_pct
        case 'variacao': return b.variacao_semana_pct - a.variacao_semana_pct
        default: return b.receita - a.receita
      }
    })

  // Total de colunas
  const totaisMes = labels.map((_, i) => {
    return produtosFiltrados.reduce(
      (acc, p) => {
        acc.qtd += p.porMes[i]?.qtd || 0
        acc.receita += p.porMes[i]?.receita || 0
        return acc
      },
      { qtd: 0, receita: 0 }
    )
  })
  const totalReceita = produtosFiltrados.reduce((s, p) => s + p.receita, 0)
  const totalCusto = produtosFiltrados.reduce((s, p) => s + p.custoTotal, 0)
  const totalLucro = totalReceita - totalCusto
  const totalMargem = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0
  const totalGeral = {
    qtd: produtosFiltrados.reduce((s, p) => s + p.total, 0),
    receita: totalReceita,
    custo: totalCusto,
    lucro: totalLucro,
    margem_pct: totalMargem,
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📊 Vendas por Mês por Produto</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Comparativo mês a mês + variação semanal — descubra o que tá vendendo mais</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/admin/financeiro/dre-mensal" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>📊 DRE</Link>
          <Link href="/admin/full" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>📦 Painel FULL</Link>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔎 Buscar produto ou SKU..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 240, outline: 'none' }}
        />
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={9}>9 meses</option>
          <option value={12}>12 meses</option>
        </select>
        <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as any)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="receita">Ordenar por Receita</option>
          <option value="qtd">Ordenar por Quantidade</option>
          <option value="margem">Ordenar por Margem</option>
          <option value="variacao">Ordenar por Variação Semanal</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyFull} onChange={(e) => setOnlyFull(e.target.checked)} />
          Só FULL
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>{produtosFiltrados.length} produtos</div>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '2px solid #111827' }}>
                <th style={{ ...th, minWidth: 280, textAlign: 'left' }}>Produto</th>
                {labels.map((l) => (
                  <th key={l} colSpan={2} style={{ ...th, textAlign: 'center', minWidth: 100, background: 'var(--psh-bg-secondary, #f3f4f6)' }}>{l}</th>
                ))}
                <th style={{ ...th, textAlign: 'right', background: '#fef3c7' }}>Total</th>
                <th style={{ ...th, textAlign: 'right', background: '#dbeafe' }}>Var. Sem.</th>
                <th style={{ ...th, textAlign: 'right' }}>Margem</th>
              </tr>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                <th></th>
                {labels.map((l) => (
                  <>
                    <th key={l + 'q'} style={subTh}>Qtd</th>
                    <th key={l + 'r'} style={subTh}>R$</th>
                  </>
                ))}
                <th style={{ ...subTh, background: '#fef3c7' }}>R$</th>
                <th style={{ ...subTh, background: '#dbeafe' }}>%</th>
                <th style={subTh}>%</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha de totais */}
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', fontWeight: 700, borderBottom: '2px solid #111827' }}>
                <td style={{ ...td, color: 'var(--psh-text-primary, #111827)' }}>📊 TOTAL</td>
                {totaisMes.map((t, i) => (
                  <>
                    <td key={i + 'q'} style={{ ...td, textAlign: 'right' }}>{t.qtd.toLocaleString('pt-BR')}</td>
                    <td key={i + 'r'} style={{ ...td, textAlign: 'right', color: '#3b82f6' }}>{fmtBRL(t.receita)}</td>
                  </>
                ))}
                <td style={{ ...td, textAlign: 'right', background: '#fef3c7', color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(totalGeral.receita)}</td>
                <td style={{ ...td, textAlign: 'right', background: '#dbeafe' }}>—</td>
                <td style={{ ...td, textAlign: 'right', color: totalGeral.margem_pct >= 30 ? '#10b981' : '#f59e0b' }}>{totalGeral.margem_pct.toFixed(1)}%</td>
              </tr>

              {produtosFiltrados.map((p) => {
                const varCor = p.variacao_semana_pct > 5 ? '#10b981' : p.variacao_semana_pct < -5 ? '#ef4444' : 'var(--psh-text-secondary, #6b7280)'
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.foto ? <img src={p.foto} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.nome}
                            {p.isFull && <span style={{ display: 'inline-block', padding: '1px 8px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', borderRadius: 999, fontSize: 9, fontWeight: 700 }}>FULL</span>}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    {p.porMes.map((m, i) => (
                      <>
                        <td key={i + 'q'} style={{ ...td, textAlign: 'right', color: m.qtd > 0 ? 'var(--psh-text-primary, #111827)' : 'var(--psh-border, #d1d5db)' }}>{m.qtd || '—'}</td>
                        <td key={i + 'r'} style={{ ...td, textAlign: 'right', color: m.receita > 0 ? '#3b82f6' : 'var(--psh-border, #d1d5db)' }}>{m.receita > 0 ? fmtBRL(m.receita) : '—'}</td>
                      </>
                    ))}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#fef9c3', color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(p.receita)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: varCor, background: '#eff6ff' }}>
                      {p.variacao_semana_pct > 999 ? '🆕' : (p.variacao_semana_pct >= 0 ? '+' : '') + p.variacao_semana_pct.toFixed(1) + '%'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: p.margem_pct >= 30 ? '#10b981' : p.margem_pct >= 15 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{p.margem_pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }
const subTh: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', color: 'var(--psh-text-secondary, #9ca3af)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }
