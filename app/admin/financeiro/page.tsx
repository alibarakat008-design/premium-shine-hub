'use client'

/**
 * PÁGINA FINANCEIRO
 * Com aba: Visão Geral + Agregar Notas de Compra
 */
import { useEffect, useState } from 'react'

const AUTH = 'Basic ' + btoa('premium:shine2026')
const fmt = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

type Tab = 'visao' | 'notas' | 'contas'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface DREResponse {
  periodo: { mes: number; ano: number }
  resumo: {
    faturamento: number; cmv: number; lucro_bruto: number
    margem_bruta_pct: number; despesas: number; comissoes: number
    lucro_liquido: number; margem_liquida_pct: number
    num_pedidos: number; ticket_medio: number
  }
  despesas_por_categoria: { categoria: string; valor: number }[]
  vendas_por_canal: { canal: string; faturamento: number; lucro: number; pedidos: number }[]
}
interface TotaisFluxo {
  entradas_realizadas: number; saidas_realizadas: number; saldo_realizado: number
  entradas_previstas: number; saidas_previstas: number; saldo_previsto: number
}
interface NotaCompra {
  id: string; supplier_nome: string; supplier_cnpj: string; status: string
  valor_total: number | null; data_pedido: string | null; previsao_entrega: string | null
  numero_nota_fiscal: string; created_at: string
}
interface Expense {
  id: string; description: string; amount: string; category_type: string
  category: string; due_date: string; paid_date: string | null
  status: string; recurrence: string; notes: string | null; created_at: string
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, subtitle, big }: { label: string; value: string; color: string; subtitle?: string; big?: boolean }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: big ? 24 : 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? '1.8em' : '1.4em', fontWeight: 'bold', color }}>{value}</div>
      {subtitle && <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 4 }}>{subtitle}</div>}
    </div>
  )
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a3e' }}>
      <span style={{ color: '#9090b0', fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  )
}

function Badge({ txt, cor }: { txt: string; cor: string }) {
  return <span style={{ background: cor + '22', color: cor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{txt}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const [tab, setTab] = useState<Tab>('visao')
  const [dre, setDre] = useState<DREResponse['resumo'] | null>(null)
  const [drePeriodo, setDrePeriodo] = useState({ mes: 0, ano: 0 })
  const [fluxo, setFluxo] = useState<TotaisFluxo | null>(null)
  const [comissoesData, setComissoesData] = useState<any>(null)
  const [comprasTotais, setComprasTotais] = useState<{ total: number; sugeridas: number; aprovadas: number; enviadas: number; recebidas: number } | null>(null)
  const [notas, setNotas] = useState<NotaCompra[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selector mês/ano
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/financeiro/dre?year=${ano}&month=${mes}`, { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
      fetch('/api/financeiro/fluxo-caixa?limit=1', { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
      fetch('/api/financeiro/comissoes', { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
      fetch('/api/financeiro/compras', { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
      fetch('/api/admin/purchase-invoices', { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
      fetch(`/api/admin/expenses?mes=${mes}&ano=${ano}`, { headers: { Authorization: AUTH } }).then(r => r.json()).catch(e => ({ error: e.message })),
    ]).then(([d, f, c, co, notasRaw, expRaw]) => {
      try {
        // DRE
        if (d.success && d.data) {
          setDrePeriodo({ mes: d.data.periodo?.month || d.data.periodo?.mes || mes, ano: d.data.periodo?.year || d.data.periodo?.ano || ano })
          const dre_ = d.data.dre || {}
          setDre({
            faturamento: dre_.receita_liquida || dre_.receita_bruta || 0,
            cmv: dre_['cm v'] || dre_.cmv || 0,
            lucro_bruto: dre_.lucro_bruto || 0,
            margem_bruta_pct: dre_.margem_bruta_pct || 0,
            despesas: dre_.despesas_operacionais || 0,
            comissoes: (dre_.comissao_ml || 0) + (dre_.comissao_vendedora || 0),
            lucro_liquido: dre_.lucro_liquido || 0,
            margem_liquida_pct: dre_.margem_liquida_pct || 0,
            num_pedidos: d.data.kpis?.total_pedidos || 0,
            ticket_medio: d.data.kpis?.ticket_medio || 0,
          })
        }
        // Fluxo
        if (f.success) {
          setFluxo(f.totais || null)
        }
        // Comissoes
        if (c.success) setComissoesData(c.data || null)
        // Compras totais
        if (co.success && Array.isArray(co.data)) {
          const total = co.data.reduce((a: number, r: any) => a + parseFloat(r.valor_total || 0), 0)
          const s = (st: string) => co.data.filter((r: any) => r.status === st).length
          setComprasTotais({ total, sugeridas: s('sugerida'), aprovadas: s('aprovada'), enviadas: s('enviada'), recebidas: s('recebida') })
        }
        // Notas de compra
        if (notasRaw.ok && Array.isArray(notasRaw.notas)) {
          setNotas(notasRaw.notas)
        }
        // Expenses (contas a pagar)
        if (expRaw.ok && Array.isArray(expRaw.expenses)) {
          setExpenses(expRaw.expenses)
        }
      } catch (err: any) {
        console.error('[Financeiro] transform error:', err)
        setError(err.message)
      }
      setLoading(false)
    }).catch(function(err: any) {
      console.error('[Financeiro] fetch error:', err)
      setError(err.message)
      setLoading(false)
    })
  }, [mes, ano])

  if (loading) {
    return <div style={{ padding: 40, color: '#e8e8f0', background: '#0a0a1a', minHeight: '100vh' }}>⏳ Carregando dados financeiros...</div>
  }

  return (
    <div style={{ padding: 24, color: '#e8e8f0', background: '#0a0a1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8em', margin: 0, color: '#d0c0ff' }}>💰 Financeiro</h1>
          <p style={{ color: '#7070a0', margin: '4px 0 0' }}>
            {drePeriodo.mes}/{drePeriodo.ano} — {dre?.num_pedidos || 0} pedidos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={mes} onChange={e => setMes(parseInt(e.target.value))}
            style={{ padding: '7px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1
              return <option key={m} value={m}>{(m + '').padStart(2, '0')}/{ano}</option>
            })}
          </select>
          <select value={ano} onChange={e => setAno(parseInt(e.target.value))}
            style={{ padding: '7px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
            {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2a2a4a' }}>
        {([['visao', '📊 Visão Geral'], ['notas', '🧾 Agregar Notas'], ['contas', '💳 Contas a Pagar']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid #a78bfa' : '2px solid transparent',
              color: tab === t ? '#a78bfa' : '#7070a0', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            }}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: 10, padding: 14, color: '#ef4444', marginBottom: 16, fontSize: 13 }}>
          ⚠️ Erro ao carregar: {error}
        </div>
      )}

      {/* ── ABA: VISÃO GERAL ─────────────────────────────────────────── */}
      {tab === 'visao' && (
        <div>
          {/* DRE */}
          <h2 style={{ fontSize: '1.1em', color: '#d0c0ff', margin: '0 0 12px 0' }}>📊 DRE do Mês</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard label="💵 Faturamento" value={fmt(dre?.faturamento || 0)} color="#34d399" subtitle={`${dre?.num_pedidos || 0} pedidos`} />
            <KpiCard label="📦 CMV" value={fmt(dre?.cmv || 0)} color="#f59e0b" />
            <KpiCard label="📈 Lucro Bruto" value={fmt(dre?.lucro_bruto || 0)} color={(dre?.lucro_bruto || 0) > 0 ? '#34d399' : '#ef4444'} subtitle={`${(dre?.margem_bruta_pct || 0).toFixed(1)}% margem`} />
            <KpiCard label="💸 Comissões" value={fmt(dre?.comissoes || 0)} color="#fbbf24" />
            <KpiCard label="💎 Lucro Líquido" value={fmt(dre?.lucro_liquido || 0)} color={(dre?.lucro_liquido || 0) > 0 ? '#10b981' : '#ef4444'} subtitle={`${(dre?.margem_liquida_pct || 0).toFixed(1)}% margem`} big />
          </div>

          {/* Fluxo de Caixa */}
          <h2 style={{ fontSize: '1.1em', color: '#d0c0ff', margin: '16px 0 12px 0' }}>💸 Fluxo de Caixa</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard label="↗️ Entradas realizadas" value={fmt(fluxo?.entradas_realizadas || 0)} color="#34d399" />
            <KpiCard label="↘️ Saídas realizadas" value={fmt(fluxo?.saidas_realizadas || 0)} color="#ef4444" />
            <KpiCard label="💰 Saldo Realizado" value={fmt(fluxo?.saldo_realizado || 0)} color={(fluxo?.saldo_realizado || 0) >= 0 ? '#34d399' : '#ef4444'} big />
            <KpiCard label="📅 Saldo Previsto" value={fmt(fluxo?.saldo_previsto || 0)} color={(fluxo?.saldo_previsto || 0) >= 0 ? '#10b981' : '#fbbf24'} />
          </div>

          {/* Compras e Comissões */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#d0c0ff', fontSize: '1em' }}>🛒 Compras (fornecedor)</h3>
              <Row label="Total valor" value={fmt(comprasTotais?.total || 0)} color="#a78bfa" bold />
              <Row label="Sugeridas (BI)" value={String(comprasTotais?.sugeridas || 0) + ' notas'} color="#fbbf24" />
              <Row label="Aprovadas" value={String(comprasTotais?.aprovadas || 0) + ' notas'} color="#60a5fa" />
              <Row label="Enviadas" value={String(comprasTotais?.enviadas || 0) + ' notas'} color="#34d399" />
              <Row label="Recebidas" value={String(comprasTotais?.recebidas || 0) + ' notas'} color="#10b981" />
            </div>
            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#d0c0ff', fontSize: '1em' }}>💸 Comissões (mês)</h3>
              <Row label="Total" value={fmt(comissoesData?.totais?.total_geral || 0)} color="#f472b6" bold />
              <Row label="Vendedoras" value={fmt(comissoesData?.totais?.vendedoras?.comissao || 0)} color="#a78bfa" />
              <Row label="Afiliados" value={fmt(comissoesData?.totais?.afiliados?.comissao || 0)} color="#34d399" />
            </div>
          </div>

          {/* Top Vendedoras */}
          {comissoesData?.ranking_vendedoras?.length > 0 && (
            <>
              <h2 style={{ fontSize: '1.1em', color: '#d0c0ff', margin: '0 0 12px 0' }}>🏆 Top Vendedoras</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
                {comissoesData.ranking_vendedoras.slice(0, 3).map((v: any, i: number) => (
                  <div key={i} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: '1.8em' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e8e8f0', fontWeight: 600 }}>{v.nome}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.85em' }}>{v.total_vendas} vendas · {fmt(v.valor_vendido)}</div>
                    </div>
                    <div style={{ color: '#a78bfa', fontWeight: 'bold' }}>{fmt(v.comissao_gerada)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA: AGREGAR NOTAS DE COMPRA ─────────────────────────────── */}
      {tab === 'notas' && (
        <AgregarNotas notas={notas} />
      )}

      {/* ── ABA: CONTAS A PAGAR ───────────────────────────────────── */}
      {tab === 'contas' && (
        <ContasAPagar mes={mes} ano={ano} />
      )}
    </div>
  )
}

// ─── Componente: Agregar Notas de Compra ──────────────────────────────────────
function AgregarNotas({ notas }: { notas: NotaCompra[] }) {
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')

  const STATUS_OPTS = [
    { value: '', label: 'Todos' },
    { value: 'sugerida', label: '💡 Sugerida' },
    { value: 'aprovada', label: '✅ Aprovada' },
    { value: 'enviada', label: '📦 Enviada' },
    { value: 'recebida', label: '🏁 Recebida' },
    { value: 'cancelada', label: '❌ Cancelada' },
  ]

  const COR_STATUS: Record<string, string> = {
    sugerida: '#fbbf24', aprovada: '#60a5fa', enviada: '#34d399', recebida: '#10b981', cancelada: '#ef4444'
  }

  const filtradas = notas.filter(n => {
    if (filtroStatus && n.status !== filtroStatus) return false
    if (filtroFornecedor && !n.supplier_nome?.toLowerCase().includes(filtroFornecedor.toLowerCase())) return false
    return true
  })

  // Agregação por fornecedor
  const porFornecedor: Record<string, { nome: string; total: number; count: number; porStatus: Record<string, number> }> = {}
  for (const n of filtradas) {
    const key = n.supplier_nome || 'Sem fornecedor'
    if (!porFornecedor[key]) porFornecedor[key] = { nome: key, total: 0, count: 0, porStatus: {} }
    porFornecedor[key].total += n.valor_total || 0
    porFornecedor[key].count++
    porFornecedor[key].porStatus[n.status] = (porFornecedor[key].porStatus[n.status] || 0) + 1
  }
  const aggFornecedor = Object.values(porFornecedor).sort((a, b) => b.total - a.total)

  // Agregação por status
  const porStatus: Record<string, { total: number; count: number }> = {}
  for (const n of filtradas) {
    const s = n.status || 'desconhecido'
    if (!porStatus[s]) porStatus[s] = { total: 0, count: 0 }
    porStatus[s].total += n.valor_total || 0
    porStatus[s].count++
  }

  // Total geral
  const totalGeral = filtradas.reduce((a, n) => a + (n.valor_total || 0), 0)

  // Fornecedores únicos pro filtro
  const fornecedoresUnicos = [...new Set(notas.map(n => n.supplier_nome).filter(Boolean))].sort()

  return (
    <div>
      {/* KPIs de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total notas" value={String(filtradas.length)} color="#a78bfa" />
        <KpiCard label="Valor total" value={fmt(totalGeral)} color={totalGeral > 0 ? '#34d399' : '#7070a0'} />
        <KpiCard label="Fornecedores" value={String(aggFornecedor.length)} color="#60a5fa" />
        <KpiCard label="Recebidas" value={String(porStatus['recebida']?.count || 0)} color="#10b981" />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '8px 14px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="text" placeholder="🔍 Filtrar fornecedor..." value={filtroFornecedor}
          onChange={e => setFiltroFornecedor(e.target.value)}
          style={{ padding: '8px 14px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, minWidth: 200 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Por status */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#d0c0ff', fontSize: '1em' }}>📊 Por Status</h3>
          {Object.entries(porStatus).sort((a, b) => b[1].total - a[1].total).map(([s, dados]) => (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a3e' }}>
              <Badge txt={s} cor={COR_STATUS[s] || '#7070a0'} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#e8e8f0', fontWeight: 600, fontSize: 13 }}>{fmt(dados.total)}</div>
                <div style={{ color: '#7070a0', fontSize: 11 }}>{dados.count} nota(s)</div>
              </div>
            </div>
          ))}
          {Object.keys(porStatus).length === 0 && (
            <div style={{ color: '#4a4a7a', fontSize: 13, textAlign: 'center', padding: 20 }}>Nenhuma nota</div>
          )}
        </div>

        {/* Por fornecedor */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#d0c0ff', fontSize: '1em' }}>🏭 Por Fornecedor</h3>
          {aggFornecedor.slice(0, 10).map((f) => (
            <div key={f.nome} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a3e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#d0c0ff', fontSize: 13, fontWeight: 600 }}>{f.nome}</span>
                <span style={{ color: '#34d399', fontWeight: 700, fontSize: 13 }}>{fmt(f.total)}</span>
              </div>
              <div style={{ color: '#7070a0', fontSize: 11 }}>
                {f.count} nota(s) ·{' '}
                {Object.entries(f.porStatus).map(([s, c]) => (
                  <span key={s} style={{ color: COR_STATUS[s] || '#7070a0' }}>{s}: {c}{' '}</span>
                ))}
              </div>
            </div>
          ))}
          {aggFornecedor.length === 0 && (
            <div style={{ color: '#4a4a7a', fontSize: 13, textAlign: 'center', padding: 20 }}>Nenhuma nota</div>
          )}
        </div>
      </div>

      {/* Tabela de notas filtradas */}
      {filtradas.length > 0 && (
        <div style={{ marginTop: 20, background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a4a', color: '#7070a0', fontSize: 12, fontWeight: 600 }}>
            📋 Detalhe das notas ({filtradas.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#7070a0', borderBottom: '1px solid #2a2a4a' }}>
                  <th style={{ textAlign: 'left', padding: '8px 14px' }}>Fornecedor</th>
                  <th style={{ textAlign: 'center', padding: '8px 14px' }}>Nº Nota</th>
                  <th style={{ textAlign: 'center', padding: '8px 14px' }}>Pedido</th>
                  <th style={{ textAlign: 'center', padding: '8px 14px' }}>Previsão</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px' }}>Valor</th>
                  <th style={{ textAlign: 'center', padding: '8px 14px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 50).map(n => (
                  <tr key={n.id} style={{ borderBottom: '1px solid #1a1a3a' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{n.supplier_nome || '—'}</div>
                      {n.supplier_cnpj && <div style={{ color: '#4a4a7a', fontSize: 10 }}>{n.supplier_cnpj}</div>}
                    </td>
                    <td style={{ textAlign: 'center', color: '#9090b0' }}>{n.numero_nota_fiscal || '—'}</td>
                    <td style={{ textAlign: 'center', color: '#7070a0' }}>{n.data_pedido ? new Date(n.data_pedido).toLocaleDateString('pt-BR') : '—'}</td>
                    <td style={{ textAlign: 'center', color: '#7070a0' }}>{n.previsao_entrega ? new Date(n.previsao_entrega).toLocaleDateString('pt-BR') : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{fmt(n.valor_total || 0)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge txt={n.status} cor={COR_STATUS[n.status] || '#7070a0'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtradas.length > 50 && (
            <div style={{ padding: 10, textAlign: 'center', color: '#7070a0', fontSize: 12 }}>
              Mostrando 50 de {filtradas.length} notas — use os filtros acima
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente: Contas a Pagar ───────────────────────────────────────────────
const FIXED_CATS = ['aluguel', 'salário', 'luz', 'água', 'internet', 'telefone', 'software', 'contabilidade', 'seguros', 'empréstimo', 'outro_fixo']
const VARIABLE_CATS = ['marketing', 'fretes', 'insumos', 'embalagens', 'impostos', 'comissões', 'vale', 'bonificação', 'insumos_loja', 'manutenção', 'outro_var']
const RECURRENCE_OPTS = [
  { value: 'one_time', label: 'Única' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

const CAT_ICONS: Record<string, string> = {
  aluguel: '🏠', 'salário': '👤', luz: '💡', água: '🚿', internet: '📶',
  telefone: '📱', software: '💻', contabilidade: '📊', seguros: '🛡️',
  empréstimo: '🏦', outro_fixo: '📌',
  marketing: '📢', fretes: '🚚', insumos: '📦', embalagens: '📦',
  impostos: '🏛️', comissões: '💸', vale: '💵', bonificação: '🎁',
  insumos_loja: '🏪', manutenção: '🔧', outro_var: '📌',
}

function ContasAPagar({ mes, ano }: { mes: number; ano: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totais, setTotais] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [mesFiltro, setMesFiltro] = useState(mes)
  const [anoFiltro, setAnoFiltro] = useState(ano)

  const [form, setForm] = useState({
    description: '', amount: '', category_type: 'fixed' as 'fixed' | 'variable',
    category: 'aluguel', due_date: '', recurrence: 'monthly' as string, notes: '',
  })

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({ mes: String(mesFiltro), ano: String(anoFiltro) })
    if (filtroTipo) params.set('category_type', filtroTipo)
    if (filtroStatus) params.set('status', filtroStatus)
    fetch(`/api/admin/expenses?${params}`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setExpenses(d.expenses || []); setTotais(d.totais) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [mesFiltro, anoFiltro, filtroTipo, filtroStatus])

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  const openEdit = (e: Expense) => {
    setEditing(e)
    setForm({
      description: e.description,
      amount: String(e.amount),
      category_type: e.category_type as 'fixed' | 'variable',
      category: e.category,
      due_date: e.due_date ? new Date(e.due_date).toISOString().slice(0, 10) : '',
      recurrence: e.recurrence,
      notes: e.notes || '',
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null); setForm({ description: '', amount: '', category_type: 'fixed', category: 'aluguel', due_date: '', recurrence: 'monthly', notes: '' }) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = editing
        ? `/api/admin/expenses/${editing.id}`
        : '/api/admin/expenses'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.ok || d.expense) {
        showMsg('ok', editing ? '✅ Despesa atualizada!' : '✅ Despesa criada!')
        closeForm()
        load()
      } else {
        showMsg('err', d.error || 'Erro ao salvar')
      }
    } catch { showMsg('err', 'Erro de conexão') }
    setSaving(false)
  }

  const togglePaid = async (e: Expense) => {
    const paid = e.status !== 'paid'
    const res = await fetch(`/api/admin/expenses/${e.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({ paid, paid_date: paid ? e.due_date : undefined }),
    })
    const d = await res.json()
    if (d.ok) { load() }
    else showMsg('err', d.error || 'Erro')
  }

  const deleteExp = async (id: string) => {
    if (!confirm('Excluir esta despesa?')) return
    setDeleting(id)
    const res = await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE', headers: { Authorization: AUTH } })
    const d = await res.json()
    if (d.ok) { load(); showMsg('ok', '🗑️ Excluída!') }
    else showMsg('err', d.error || 'Erro ao excluir')
    setDeleting(null)
  }

  // Merge with all-time fixed for category filter
  const allCats = [...new Set(expenses.map(e => e.category))].sort()
  const catOpts = filtroTipo === 'fixed' ? FIXED_CATS : filtroTipo === 'variable' ? VARIABLE_CATS : [...new Set([...FIXED_CATS, ...VARIABLE_CATS, ...allCats])].sort()

  const filtradas = expenses.filter(e => {
    if (filtroCat && e.category !== filtroCat) return false
    if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const COR_STATUS: Record<string, string> = { pending: '#fbbf24', paid: '#34d399', cancelled: '#ef4444' }
  const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="💰 Total Pendente" value={fmt(totais?.total_pendente || 0)} color="#fbbf24" subtitle={`${totais?.count_pendente || 0} despesas`} />
        <KpiCard label="✅ Total Pago" value={fmt(totais?.total_pago || 0)} color="#34d399" subtitle={`${totais?.count_pago || 0} pagas`} />
        <KpiCard label="📌 Gastos Fixos" value={fmt(totais?.total_fixo || 0)} color="#a78bfa" subtitle="mensais/aluguel/salário" />
        <KpiCard label="📊 Gastos Variáveis" value={fmt(totais?.total_variavel || 0)} color="#60a5fa" subtitle="marketing/fretes/vale" />
        <KpiCard label="💸 Total do Mês" value={fmt((totais?.total_pendente || 0) + (totais?.total_pago || 0))} color="#f472b6" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={mesFiltro} onChange={e => setMesFiltro(parseInt(e.target.value))}
          style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{(i + 1 + '').padStart(2, '0')}/{anoFiltro}</option>)}
        </select>
        <select value={anoFiltro} onChange={e => setAnoFiltro(parseInt(e.target.value))}
          style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroCat('') }}
          style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          <option value="">Todos os tipos</option>
          <option value="fixed">📌 Fixos</option>
          <option value="variable">📊 Variáveis</option>
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          <option value="">Todos status</option>
          <option value="pending">⏳ Pendentes</option>
          <option value="paid">✅ Pagas</option>
          <option value="cancelled">❌ Canceladas</option>
        </select>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
          <option value="">Todas categorias</option>
          {catOpts.map(c => <option key={c} value={c}>{CAT_ICONS[c] || '📌'} {c}</option>)}
        </select>
        <input type="text" placeholder="🔍 Buscar descrição..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 14px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, flex: 1, minWidth: 180 }} />
        <button onClick={() => setShowForm(true)} style={{
          padding: '8px 18px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          + Nova Despesa
        </button>
      </div>

      {/* Msg feedback */}
      {msg && (
        <div style={{
          background: msg.type === 'ok' ? '#0d2d1a' : '#2d0d0d',
          border: `1px solid ${msg.type === 'ok' ? '#34d399' : '#ef4444'}`,
          borderRadius: 8, padding: '10px 16px', color: msg.type === 'ok' ? '#34d399' : '#ef4444',
          fontSize: 13, marginBottom: 14,
        }}>
          {msg.text}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div style={{ color: '#7070a0', textAlign: 'center', padding: 40 }}>⏳ Carregando...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ color: '#4a4a7a', textAlign: 'center', padding: 60, fontSize: 14 }}>
          Nenhuma despesa neste período.{' '}
          <button onClick={() => setShowForm(true)} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontWeight: 600 }}>Cadastrar a primeira →</button>
        </div>
      ) : (
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a2a4a', color: '#7070a0', fontSize: 12, fontWeight: 600 }}>
            {filtradas.length} despesa(s)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#7070a0', borderBottom: '1px solid #2a2a4a' }}>
                  <th style={{ textAlign: 'left', padding: '9px 14px' }}>Descrição</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Categoria</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Vencimento</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Pago em</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Recorrência</th>
                  <th style={{ textAlign: 'right', padding: '9px 14px' }}>Valor</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '9px 14px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #1a1a3a', background: e.status === 'paid' ? '#0a1a0a' : 'transparent' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{e.description}</div>
                      {e.notes && <div style={{ color: '#4a4a7a', fontSize: 10 }}>{e.notes}</div>}
                    </td>
                    <td style={{ textAlign: 'center', color: '#9090b0', fontSize: 12 }}>
                      <span style={{ color: e.category_type === 'fixed' ? '#a78bfa' : '#60a5fa', fontWeight: 600 }}>
                        {CAT_ICONS[e.category] || '📌'} {e.category}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#9090b0', fontSize: 12 }}>{fmtD(e.due_date)}</td>
                    <td style={{ textAlign: 'center', color: '#34d399', fontSize: 12 }}>{fmtD(e.paid_date)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: '#1a1a3a', color: '#7070a0', borderRadius: 4, padding: '2px 6px', fontSize: 10 }}>
                        {e.recurrence === 'monthly' ? '↺ Mensal' : e.recurrence === 'yearly' ? '📅 Anual' : '⚡ Única'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: '#f472b6', fontWeight: 700 }}>{fmt(parseFloat(String(e.amount)))}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        background: COR_STATUS[e.status] + '22', color: COR_STATUS[e.status],
                        borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }} onClick={() => togglePaid(e)} title="Clique para trocar status">
                        {e.status === 'paid' ? '✅ Paga' : e.status === 'cancelled' ? '❌ Cancel.' : '⏳ Pend.'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button onClick={() => openEdit(e)} style={{ background: '#1a1a3a', border: '1px solid #2a2a4a', borderRadius: 5, color: '#60a5fa', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>✏️</button>
                        <button onClick={() => deleteExp(e.id)} disabled={deleting === e.id}
                          style={{ background: '#1a1a3a', border: '1px solid #2a2a4a', borderRadius: 5, color: '#ef4444', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>
                          {deleting === e.id ? '...' : '🗑️'}
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

      {/* Modal Form */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, color: '#e8e8f0', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: '#d0c0ff', fontSize: '1.2em' }}>{editing ? '✏️ Editar Despesa' : '➕ Nova Despesa'}</h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <form onSubmit={submit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Descrição *</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required
                  placeholder="Ex: Aluguel warehouse agosto"
                  style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Valor (R$) *</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
                    placeholder="0,00"
                    style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Vencimento *</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required
                    style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Tipo</label>
                  <select value={form.category_type} onChange={e => {
                    const ct = e.target.value as 'fixed' | 'variable'
                    setForm(f => ({ ...f, category_type: ct, category: ct === 'fixed' ? 'aluguel' : 'marketing' }))
                  }}
                    style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                    <option value="fixed">📌 Fixo</option>
                    <option value="variable">📊 Variável</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Recorrência</label>
                  <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                    {RECURRENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Categoria</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                  {(form.category_type === 'fixed' ? FIXED_CATS : VARIABLE_CATS).map(c => (
                    <option key={c} value={c}>{CAT_ICONS[c] || '📌'} {c}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: '#7070a0', fontSize: 12, marginBottom: 5 }}>Observações</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ex: Pago via Nubank, ref. agosto/2026"
                  rows={2}
                  style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeForm} style={{ padding: '9px 20px', background: '#1a1a3a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#9090b0', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{
                  padding: '9px 24px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}>
                  {saving ? 'Salvando...' : editing ? '💾 Atualizar' : '✅ Criar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
