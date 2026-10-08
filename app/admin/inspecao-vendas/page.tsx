'use client'

/**
 * INSPEÇÃO DE VENDAS POR DIA
 * Calendário + lista detalhada de cada dia
 *
 * Recursos:
 * - Visão por mês com calendário de dias coloridos (verde = vendas, vermelho = canceladas)
 * - Clique em um dia → lista todas as vendas com cálculo completo (venda, comissão, recebimento, custo, margem)
 * - Navegação entre meses
 * - Comparativo mês a mês
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Dia = { dia: string; vendas: number; receita: number; cmv: number; margem: number; canceladas: number; canceladas_receita: number }
type Resumo = { total_vendas: number; total_receita: number; total_margem: number; total_canceladas: number; dias_com_venda: number; dias_no_mes: number; media_diaria: number }

type Item = {
  id: string
  sku: string
  nome: string
  foto: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  custo_unitario: number
}
type Order = {
  id: string
  order_number: string
  hora: string
  data_completa: string
  status: string
  conta: string
  venda: number
  comissao: number
  taxa_comissao_pct: number
  recebimento: number
  custo: number
  margem_reais: number
  margem_pct: number
  itens: Item[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + 'k'
  return v.toFixed(0)
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function InspecaoVendasPage() {
  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [resumoDia, setResumoDia] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setDiaSelecionado(null)
    setOrders([])

    apiFetch(`/api/admin/inspecao-vendas?mes=${mes}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (!j.ok) throw new Error(j.error)
        setDias(j.dias)
        setResumo(j.resumo)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true; ac.abort() }
  }, [mes])


  useEffect(() => {
    if (!diaSelecionado) {
      setOrders([])
      setResumoDia(null)
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    apiFetch(`/api/admin/inspecao-vendas?mes=${mes}&dia=${diaSelecionado}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (!j.ok) throw new Error(j.error)
        setOrders(j.orders)
        setResumoDia(j.resumo)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true; ac.abort() }
  }, [diaSelecionado, mes])


  const mudarMes = (delta: number) => {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const irParaHoje = () => {
    const d = new Date()
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setDiaSelecionado(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  // Calendário
  const [y, m] = mes.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const startWeekday = firstDay.getDay() // 0=dom

  const diasMap: Record<string, Dia> = {}
  for (const d of dias) diasMap[d.dia] = d

  const cells: ({ dia: string; num: number } | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${mes}-${String(d).padStart(2, '0')}`
    cells.push({ dia: key, num: d })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>
            🔍 Inspeção de Vendas por Dia
          </h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>
            Histórico completo do Mercado Livre — clique em um dia para ver as vendas detalhadas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/admin/vendas-ao-vivo"
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            🔴 Vendas ao Vivo
          </Link>
          <Link
            href="/admin/gestao-ativa"
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            ← Painel
          </Link>
        </div>
      </div>

      {/* Navegação mês */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'var(--psh-bg-primary, white)', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <button onClick={() => mudarMes(-1)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', cursor: 'pointer', fontSize: 14 }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', minWidth: 200, textAlign: 'center' }}>
          {MESES[m - 1]} de {y}
        </div>
        <button onClick={() => mudarMes(1)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', cursor: 'pointer', fontSize: 14 }}>→</button>
        <button onClick={irParaHoje} style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          📅 Hoje
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Calendário */}
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>
            📅 Calendário
          </h2>

          {resumo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16, padding: 12, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6 }}>
              <Stat label="Vendas" value={String(resumo.total_vendas)} color="#10b981" />
              <Stat label="Receita" value={fmtBRL(resumo.total_receita)} color="#3b82f6" />
              <Stat label="Lucro" value={fmtBRL(resumo.total_margem)} color={resumo.total_margem >= 0 ? '#10b981' : '#ef4444'} />
              <Stat label="Dias ativos" value={`${resumo.dias_com_venda}/${resumo.dias_no_mes}`} color="#8b5cf6" />
              <Stat label="Média/dia" value={resumo.media_diaria.toFixed(1)} color="#f59e0b" />
            </div>
          )}

          {/* Header dias semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} style={{ padding: 6, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary, #6b7280)' }}>{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((c, i) => {
              if (!c) return <div key={i} />
              const diaData = diasMap[c.dia]
              const isSelecionado = diaSelecionado === c.dia
              const hasVendas = (diaData?.vendas || 0) > 0
              const hasCanceladas = (diaData?.canceladas || 0) > 0
              const today = new Date()
              const isToday = today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === c.num

              let bg = 'white'
              let border = '1px solid #e5e7eb'
              if (isSelecionado) {
                bg = '#dbeafe'
                border = '2px solid #3b82f6'
              } else if (hasCanceladas) {
                bg = '#fef2f2'
                border = '1px solid #fecaca'
              } else if (hasVendas) {
                const intensity = Math.min(1, (diaData?.receita || 0) / (resumo?.total_receita || 1) * 10)
                bg = `rgba(16, 185, 129, ${0.15 + intensity * 0.5})`
                border = '1px solid rgba(16, 185, 129, 0.4)'
              }

              return (
                <button
                  key={i}
                  onClick={() => setDiaSelecionado(c.dia)}
                  style={{
                    aspectRatio: '1',
                    padding: 6,
                    background: bg,
                    border,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: isToday || isSelecionado ? 700 : 500, color: isToday ? '#3b82f6' : 'var(--psh-text-primary, #111827)' }}>
                      {c.num}
                    </span>
                    {isToday && <span style={{ fontSize: 8, color: '#3b82f6' }}>●</span>}
                  </div>
                  {hasVendas && (
                    <>
                      <div style={{ fontSize: 9, color: '#065f46', fontWeight: 600, lineHeight: 1.1 }}>
                        {diaData!.vendas} {diaData!.vendas === 1 ? 'venda' : 'vendas'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--psh-text-primary, #111827)', fontWeight: 600, lineHeight: 1.1, marginTop: 1 }}>
                        {fmtK(diaData!.receita)}<span style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontWeight: 400 }}>/</span><span style={{ color: diaData!.margem >= 0 ? '#10b981' : '#ef4444' }}>{fmtK(diaData!.margem)}</span>
                      </div>
                    </>
                  )}
                  {hasCanceladas && (
                    <div style={{ fontSize: 9, color: '#991b1b' }}>
                      {diaData!.canceladas} cancel.
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Detalhe do dia */}
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {!diaSelecionado ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
              👈 Clique em um dia do calendário para ver as vendas detalhadas
            </div>
          ) : loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>
                📋 {new Date(diaSelecionado + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </h2>

              {resumoDia && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, padding: 12, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6 }}>
                  <Stat label="Pedidos" value={String(orders.length)} color="#3b82f6" />
                  <Stat label="Receita" value={fmtBRL(resumoDia.receita)} color="#10b981" />
                  <Stat label="Recebimento" value={fmtBRL(resumoDia.recebimento)} color="#0ea5e9" />
                  <Stat label="Itens" value={String(resumoDia.itens)} color="#8b5cf6" />
                  <Stat label="Custo" value={fmtBRL(resumoDia.custo)} color="#6b7280" />
                  <Stat
                    label="Margem"
                    value={fmtBRL(resumoDia.margem)}
                    color={resumoDia.margem >= 0 ? '#10b981' : '#ef4444'}
                  />
                </div>
              )}

              {orders.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
                  Nenhuma venda neste dia
                </div>
              ) : (
                <>
                <div style={{
                  padding: '6px 10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#1e40af',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>📜 <strong>{orders.length}</strong> pedido(s) neste dia</span>
                  {orders.length > 3 && <span>↓ role pra ver todos</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {orders.map((o) => (
                    <div key={o.id} style={{ padding: 12, background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>
                            🕐 {o.hora} · #{o.order_number}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>{o.conta}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(o.venda)}</div>
                          <div style={{ fontSize: 10, color: o.margem_pct >= 30 ? '#10b981' : o.margem_pct >= 15 ? '#f59e0b' : '#ef4444' }}>
                            margem {o.margem_pct.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {o.itens.map((it) => (
                          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--psh-text-primary, #374151)' }}>
                            {it.foto ? (
                              <img src={it.foto} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {it.nome}
                            </div>
                            <div style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>×{it.quantidade}</div>
                            <div style={{ minWidth: 70, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(it.preco_total)}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
                        <span>Comissão: <strong style={{ color: '#dc2626' }}>−{fmtBRL(o.comissao)}</strong> ({o.taxa_comissao_pct}%)</span>
                        <span>Recebimento: <strong style={{ color: '#3b82f6' }}>{fmtBRL(o.recebimento)}</strong></span>
                        <span>Custo: <strong style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>−{fmtBRL(o.custo)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabela resumo por dia — drilldown visual */}
      {dias.length > 0 && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>
              💰 Faturamento por dia — {MESES[m - 1]} de {y}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Clique em uma linha para abrir o dia</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>Data</th>
                  <th style={th}>Dia semana</th>
                  <th style={{ ...th, textAlign: 'center' }}>Vendas</th>
                  <th style={{ ...th, textAlign: 'center' }}>Itens</th>
                  <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ticket médio</th>
                  <th style={{ ...th, textAlign: 'right' }}>vs. média</th>
                </tr>
              </thead>
              <tbody>
                {dias
                  .filter((d) => d.vendas > 0 || d.canceladas > 0)
                  .map((d) => {
                    const dt = new Date(d.dia + 'T00:00:00')
                    const dsIdx = dt.getDay()
                    const dsNome = DIAS_SEMANA[dsIdx]
                    const ticket = d.vendas > 0 ? d.receita / d.vendas : 0
                    const media = (resumo?.media_diaria || 0) * 66 // ticket medio aprox
                    const pctVsMedia = media > 0 ? ((d.receita - media) / media) * 100 : 0
                    const isSel = diaSelecionado === d.dia
                    const isWeekend = dsIdx === 0 || dsIdx === 6

                    return (
                      <tr
                        key={d.dia}
                        onClick={() => setDiaSelecionado(d.dia)}
                        style={{
                          borderBottom: '1px solid #f3f4f6',
                          background: isSel ? '#dbeafe' : 'white',
                          cursor: 'pointer',
                          fontWeight: isSel ? 600 : 400,
                        }}
                      >
                        <td style={{ ...td, color: 'var(--psh-text-primary, #111827)' }}>
                          {String(dt.getDate()).padStart(2, '0')}/{String(dt.getMonth() + 1).padStart(2, '0')}
                        </td>
                        <td style={{ ...td, color: isWeekend ? '#8b5cf6' : 'var(--psh-text-secondary, #6b7280)' }}>{dsNome}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{d.vendas}</td>
                        <td style={{ ...td, textAlign: 'center', color: 'var(--psh-text-secondary, #6b7280)' }}>{d.canceladas > 0 ? `−${d.canceladas}` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmtBRL(d.receita)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)' }}>{ticket > 0 ? fmtBRL(ticket) : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', color: pctVsMedia > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {pctVsMedia > 0 ? '+' : ''}{pctVsMedia.toFixed(1)}%
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.5 }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
