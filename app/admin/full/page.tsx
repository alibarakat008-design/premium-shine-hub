'use client'

/**
 * PAINEL FULL — 3 áreas:
 * - VENDAS: lista com horário, valor, status
 * - ESTOQUE: produtos em FULL com estoque atual
 * - REPOSIÇÃO: sugestão de quando reabastecer (cobertura 30d)
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Venda = {
  id: string
  order_number: string
  hora: string
  data: string
  status: string
  conta: string
  venda: number
  comissao: number
  recebimento: number
  custo: number
  margem_reais: number
  margem_pct: number
  qtd_itens: number
  itens: { id: string; sku: string; nome: string; foto: string | null; quantidade: number; preco_total: number }[]
}

type Estoque = {
  product_id: string
  sku: string
  nome: string
  foto: string | null
  preco_venda: number
  custo: number
  stock_ml: number
  stock_local: number
  minimo: number
  vendas_periodo: number
  media_dia: number
  cobertura_dias: number
  estoque_ideal_30d: number
  repor: number
  urgencia: 'critica' | 'alta' | 'media' | 'baixa'
  permalink?: string | null
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS_COLOR: Record<string, string> = {
  confirmado: '#3b82f6',
  separado: '#8b5cf6',
  enviado: '#f59e0b',
  entregue: '#10b981',
  cancelado: '#ef4444',
}
const URGENCIA_COLOR: Record<string, string> = {
  critica: '#ef4444',
  alta: '#f59e0b',
  media: '#3b82f6',
  baixa: '#10b981',
}
const URGENCIA_LABEL: Record<string, string> = {
  critica: '🔴 Crítica',
  alta: '🟠 Alta',
  media: '🟡 Média',
  baixa: '🟢 Ok',
}

export default function PainelFullPage() {
  const [aba, setAba] = useState<'vendas' | 'estoque' | 'reposicao' | 'horarios'>('vendas')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumo, setResumo] = useState<any>(null)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [estoque, setEstoque] = useState<Estoque[]>([])
  const [vendasPorDia, setVendasPorDia] = useState<{ dia: string; qtd: number }[]>([])
  const [vendasPorHora, setVendasPorHora] = useState<{ hora: string; qtd: number }[]>([])
  const [filtroUrg, setFiltroUrg] = useState<string>('todos')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch(`/api/admin/full?days=${days}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setResumo(j.resumo)
      setVendas(j.vendas)
      setEstoque(j.estoque)
      setVendasPorDia(j.vendas_por_dia)
      setVendasPorHora(j.vendas_por_hora)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days])


  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000) // 60s
    return () => clearInterval(interval)
  }, [fetchData])

  const estoqueFiltrado = estoque.filter((e) => filtroUrg === 'todos' || e.urgencia === filtroUrg)
  const reposicaoList = estoque.filter((e) => e.repor > 0).sort((a, b) => a.cobertura_dias - b.cobertura_dias)
  const valorTotalReposicao = reposicaoList.reduce((s, e) => s + e.repor * e.custo, 0)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-block', padding: '4px 14px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>FULL</span>
            Painel Mercado Livre Full
          </h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Vendas, estoque e reposição do Full • Atualiza a cada 60s</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <Link href="/admin/vendas-ao-vivo" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>🔴 Ao Vivo</Link>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {/* KPIs */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Kpi label="📦 Pedidos FULL" value={resumo.total_pedidos.toLocaleString('pt-BR')} sub={`últimos ${days} dias`} color="#3b82f6" />
          <Kpi label="💰 Receita FULL" value={fmtBRL(resumo.total_receita)} sub={`${resumo.total_itens} itens`} color="#10b981" />
          <Kpi label="🎯 Ticket Médio" value={fmtBRL(resumo.ticket_medio)} sub="" color="#8b5cf6" />
          <Kpi label="📦 Produtos FULL" value={resumo.produtos_em_full.toString()} sub={`${resumo.produtos_criticos} críticos`} color="#f59e0b" />
          <Kpi label="💵 Estoque (custo)" value={fmtBRL(resumo.valor_total_estoque)} sub="em poder do ML" color="#6b7280" />
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {[
          { id: 'vendas', label: '🛒 Vendas', count: vendas.length },
          { id: 'estoque', label: '📦 Estoque FULL', count: estoque.length },
          { id: 'reposicao', label: '🔄 Reposição', count: reposicaoList.length },
          { id: 'horarios', label: '⏰ Horários', count: null },
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
            {t.label} {t.count !== null && <span style={{ opacity: 0.7 }}>({t.count})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
      ) : aba === 'vendas' ? (
        <VendasTab vendas={vendas} />
      ) : aba === 'estoque' ? (
        <EstoqueTab estoque={estoque.filter((e) => filtroUrg === 'todos' || e.urgencia === filtroUrg)} filtroUrg={filtroUrg} setFiltroUrg={setFiltroUrg} />
      ) : aba === 'reposicao' ? (
        <ReposicaoTab list={reposicaoList} total={valorTotalReposicao} />
      ) : (
        <HorariosTab porDia={vendasPorDia} porHora={vendasPorHora} />
      )}
    </div>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function VendasTab({ vendas }: { vendas: Venda[] }) {
  if (vendas.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8 }}>Nenhuma venda FULL no período</div>
  }
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>🕐 Horário</th>
              <th style={th}>Pedido</th>
              <th style={th}>Itens</th>
              <th style={{ ...th, textAlign: 'right' }}>Venda</th>
              <th style={{ ...th, textAlign: 'right' }}>Comissão</th>
              <th style={{ ...th, textAlign: 'right' }}>Recebimento</th>
              <th style={{ ...th, textAlign: 'right' }}>Margem</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{v.hora}</div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>{v.data ? new Date(v.data).toLocaleDateString('pt-BR') : '—'}</div>
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>#{v.order_number}</td>
                <td style={td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {v.itens.slice(0, 2).map((it) => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {it.foto ? <img src={it.foto} alt="" style={{ width: 18, height: 18, borderRadius: 2, objectFit: 'cover' }} /> : <div style={{ width: 18, height: 18, borderRadius: 2, background: 'var(--psh-border, #e5e7eb)' }} />}
                        <span style={{ fontSize: 10, color: 'var(--psh-text-primary, #374151)' }}>×{it.quantidade}</span>
                      </div>
                    ))}
                    {v.itens.length > 2 && <span style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>+{v.itens.length - 2}</span>}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(v.venda)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#dc2626' }}>−{fmtBRL(v.comissao)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#3b82f6' }}>{fmtBRL(v.recebimento)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: v.margem_pct >= 30 ? '#10b981' : v.margem_pct >= 15 ? '#f59e0b' : '#ef4444' }}>
                    {fmtBRL(v.margem_reais)}
                  </div>
                  <div style={{ fontSize: 10, color: v.margem_pct >= 30 ? '#10b981' : v.margem_pct >= 15 ? '#f59e0b' : '#ef4444' }}>{v.margem_pct.toFixed(1)}%</div>
                </td>
                <td style={td}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: STATUS_COLOR[v.status] || 'var(--psh-text-secondary, #6b7280)', color: 'var(--psh-bg-primary, white)', textTransform: 'capitalize' }}>{v.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EstoqueTab({ estoque, filtroUrg, setFiltroUrg }: { estoque: Estoque[]; filtroUrg: string; setFiltroUrg: (s: string) => void }) {
  const ord: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 }
  const sorted = [...estoque].sort((a, b) => ord[a.urgencia] - ord[b.urgencia])

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {['todos', 'critica', 'alta', 'media', 'baixa'].map((u) => {
          const count = u === 'todos' ? estoque.length : estoque.filter((e) => e.urgencia === u).length
          return (
            <button
              key={u}
              onClick={() => setFiltroUrg(u)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: filtroUrg === u ? 'var(--psh-text-primary, #111827)' : 'white',
                color: filtroUrg === u ? 'white' : 'var(--psh-text-primary, #374151)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {u === 'todos' ? `Todos (${count})` : `${URGENCIA_LABEL[u]} (${count})`}
            </button>
          )
        })}
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'center' }}>Urgência</th>
                <th style={{ ...th, textAlign: 'right' }}>Estoque ML</th>
                <th style={{ ...th, textAlign: 'right' }}>Estoque Local</th>
                <th style={{ ...th, textAlign: 'right' }}>Vendidos</th>
                <th style={{ ...th, textAlign: 'right' }}>Média/dia</th>
                <th style={{ ...th, textAlign: 'right' }}>Cobertura</th>
                <th style={{ ...th, textAlign: 'right' }}>Ideal 30d</th>
                <th style={{ ...th, textAlign: 'right' }}>Repor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.product_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {e.foto ? <img src={e.foto} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>{e.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: URGENCIA_COLOR[e.urgencia], color: 'var(--psh-bg-primary, white)' }}>
                      {URGENCIA_LABEL[e.urgencia]}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: e.stock_ml < 10 ? '#ef4444' : 'var(--psh-text-primary, #111827)' }}>{e.stock_ml}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)' }}>{e.stock_local}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#3b82f6' }}>{e.vendas_periodo}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{e.media_dia}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ color: e.cobertura_dias < 15 ? '#ef4444' : e.cobertura_dias < 30 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                      {e.cobertura_dias < 999 ? `${e.cobertura_dias}d` : '∞'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)' }}>{e.estoque_ideal_30d}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {e.repor > 0 ? (
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>+{e.repor} un</span>
                    ) : (
                      <span style={{ color: '#10b981' }}>✓ OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ReposicaoTab({ list, total }: { list: Estoque[]; total: number }) {
  if (list.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8 }}>✅ Estoque FULL está saudável — nenhum produto precisa repor</div>
  }
  return (
    <div>
      <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 30 }}>🔄</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>
            {list.length} produtos precisam de reposição
          </div>
          <div style={{ fontSize: 12, color: '#7f1d1d' }}>
            Custo total estimado: <strong>{fmtBRL(total)}</strong> • Baseado em cobertura ideal de 30 dias
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>#</th>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'center' }}>Urgência</th>
                <th style={{ ...th, textAlign: 'right' }}>Estoque atual</th>
                <th style={{ ...th, textAlign: 'right' }}>Média/dia</th>
                <th style={{ ...th, textAlign: 'right' }}>Cobertura</th>
                <th style={{ ...th, textAlign: 'right' }}>Repor</th>
                <th style={{ ...th, textAlign: 'right' }}>Custo total</th>
                {list[0]?.permalink !== undefined && <th style={th}>Link ML</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={e.product_id} style={{ borderBottom: '1px solid #f3f4f6', background: e.urgencia === 'critica' ? '#fef2f2' : 'transparent' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)' }}>{i + 1}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {e.foto ? <img src={e.foto} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--psh-text-primary, #111827)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>{e.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: URGENCIA_COLOR[e.urgencia], color: 'var(--psh-bg-primary, white)' }}>
                      {URGENCIA_LABEL[e.urgencia]}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{e.stock_ml}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{e.media_dia}</td>
                  <td style={{ ...td, textAlign: 'right', color: e.cobertura_dias < 15 ? '#ef4444' : e.cobertura_dias < 30 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{e.cobertura_dias < 999 ? `${e.cobertura_dias}d` : '∞'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: 14 }}>+{e.repor}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(e.repor * e.custo)}</td>
                  {list[0]?.permalink !== undefined && (
                    <td style={td}>
                      {e.permalink ? <a href={e.permalink} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 11 }}>Ver no ML ↗</a> : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HorariosTab({ porDia, porHora }: { porDia: { dia: string; qtd: number }[]; porHora: { hora: string; qtd: number }[] }) {
  const maxHora = Math.max(...porHora.map((h) => h.qtd), 1)
  const maxDia = Math.max(...porDia.map((d) => d.qtd), 1)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📅 Vendas por dia</h3>
        {porDia.length === 0 ? <div style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>Sem dados</div> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
            {porDia.slice(-30).map((d) => (
              <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${d.dia}: ${d.qtd} vendas`}>
                <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{d.qtd}</div>
                <div style={{ width: '100%', height: `${(d.qtd / maxDia) * 100}%`, minHeight: 2, background: '#3b82f6', borderRadius: '2px 2px 0 0' }} />
                <div style={{ fontSize: 8, color: 'var(--psh-text-secondary, #9ca3af)', transform: 'rotate(-45deg)', marginTop: 4 }}>{d.dia.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>⏰ Vendas por hora do dia</h3>
        {porHora.length === 0 ? <div style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>Sem dados</div> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
            {Array.from({ length: 24 }, (_, h) => {
              const item = porHora.find((x) => x.hora === String(h).padStart(2, '0'))
              const qtd = item?.qtd || 0
              return (
                <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${h}h: ${qtd} vendas`}>
                  <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{qtd || ''}</div>
                  <div style={{ width: '100%', height: `${(qtd / maxHora) * 100}%`, minHeight: 2, background: '#10b981', borderRadius: '2px 2px 0 0' }} />
                  <div style={{ fontSize: 8, color: 'var(--psh-text-secondary, #9ca3af)', marginTop: 4 }}>{h}h</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' }
