'use client'

/**
 * /admin/rentabilidade
 *
 * Calendário mensal de rentabilidade pra empresa parceira.
 * - Bloco por dia com `faturamento / lucro` (verde/amarelo/vermelho pela margem)
 * - Click no bloco → drill-down com vendas + items do dia
 * - Multi-tenant: filtra por company_id do cookie
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Dia = {
  date: string
  vendas_count: number
  faturamento: number
  recebimento: number
  cmv: number
  lucro: number
  margem_pct: number
}

type Item = {
  sku: string
  nome: string | null
  foto: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  custo_unitario: number
  custo_total: number
  lucro_item: number
}

type Venda = {
  id: string
  order_number: string
  status: string
  tipo_envio: string | null
  total: number
  comissao: number
  frete: number
  recebimento: number
  cmv: number
  lucro: number
  margem_pct: number
  created_at: string
  items: Item[]
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtBRLcent(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function margemColor(margem: number, hasVendas: boolean) {
  if (!hasVendas) return { bg: 'var(--psh-bg-primary)', border: 'var(--psh-border-secondary)', text: 'var(--psh-text-muted)', lucro: 'var(--psh-text-muted)' }
  if (margem > 30) return { bg: '#d1fae5', border: '#10b981', text: '#065f46', lucro: '#047857' }
  if (margem > 15) return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', lucro: '#b45309' }
  return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', lucro: '#dc2626' }
}

export default function RentabilidadePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [companyName, setCompanyName] = useState('')

  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
  const [dias, setDias] = useState<Dia[]>([])
  const [totais, setTotais] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drill-down
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [vendasDia, setVendasDia] = useState<Venda[]>([])
  const [totaisDia, setTotaisDia] = useState<any>(null)
  const [loadingDia, setLoadingDia] = useState(false)

  // Auth check
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (!j.ok || !j.user) { router.push('/login-parceiro'); return }
        setCompanyName(j.company?.nome || '')
        setAuthChecked(true)
      })
      .catch(() => { if (!cancelled) router.push('/login-parceiro') })
    return () => { cancelled = true }
  }, [router])

  // Carrega mês
  const loadMes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/rentabilidade?mes=${mes}`, { credentials: 'include' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setDias(j.dias || [])
      setTotais(j.totais || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [mes])

  useEffect(() => {
    if (authChecked) loadMes()
  }, [authChecked, loadMes])

  // Drill-down
  const openDay = useCallback(async (date: string) => {
    if (selectedDate === date) {
      // Toggle: fecha
      setSelectedDate(null)
      setVendasDia([])
      setTotaisDia(null)
      return
    }
    setSelectedDate(date)
    setLoadingDia(true)
    setVendasDia([])
    setTotaisDia(null)
    try {
      const r = await fetch(`/api/admin/rentabilidade?data=${date}`, { credentials: 'include' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setVendasDia(j.vendas || [])
      setTotaisDia(j.totais || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingDia(false)
    }
  }, [selectedDate])

  if (!authChecked || loading) {
    return <div style={{ padding: 40, color: 'var(--psh-text-secondary)' }}>⏳ Carregando rentabilidade...</div>
  }

  const [yearStr, monthStr] = mes.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)

  // Calcula grid: dia da semana do primeiro dia + total de dias
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0=Dom
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: ({ type: 'empty' } | { type: 'day'; dia: Dia })[] = []
  for (let i = 0; i < firstDay; i++) cells.push({ type: 'empty' })
  for (const d of dias) cells.push({ type: 'day', dia: d })

  const prevMes = () => {
    const d = new Date(Date.UTC(year, month - 2, 1))
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    setSelectedDate(null)
  }
  const nextMes = () => {
    const d = new Date(Date.UTC(year, month, 1))
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    setSelectedDate(null)
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--psh-text-primary)' }}>
          📈 Rentabilidade
        </h1>
        {companyName && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
            <b>{companyName}</b> · clique em um dia para ver as vendas detalhadas
          </p>
        )}
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      {/* Header com navegação de mês + totais */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevMes} style={navBtn}>‹</button>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--psh-text-primary)', minWidth: 180, textAlign: 'center' }}>
              {MESES[month - 1]} {year}
            </div>
            <button onClick={nextMes} style={navBtn}>›</button>
          </div>
          {totais && (
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--psh-text-secondary)', flexWrap: 'wrap' }}>
              <Kpi label="Faturamento" value={fmtBRL(totais.faturamento)} color="var(--psh-text-primary)" />
              <Kpi label="Lucro" value={fmtBRL(totais.lucro)} color={totais.lucro > 0 ? '#10b981' : '#ef4444'} />
              <Kpi label="Margem" value={`${totais.margem_pct.toFixed(1)}%`} color={totais.margem_pct > 30 ? '#10b981' : totais.margem_pct > 15 ? '#f59e0b' : '#ef4444'} />
              <Kpi label="Vendas" value={String(totais.vendas_count)} color="var(--psh-text-primary)" />
            </div>
          )}
        </div>
      </div>

      {/* Calendário */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
          marginBottom: 6,
        }}>
          {DIAS_SEMANA.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--psh-text-muted)', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
        }}>
          {cells.map((cell, i) => {
            if (cell.type === 'empty') {
              return <div key={i} style={{ aspectRatio: '1.4 / 1' }} />
            }
            const d = cell.dia
            const dayNum = Number(d.date.slice(8, 10))
            const c = margemColor(d.margem_pct, d.vendas_count > 0)
            const isSelected = selectedDate === d.date
            return (
              <button
                key={d.date}
                onClick={() => openDay(d.date)}
                disabled={d.vendas_count === 0}
                style={{
                  aspectRatio: '1.4 / 1',
                  padding: 6,
                  borderRadius: 8,
                  border: `2px solid ${isSelected ? '#7c3aed' : (d.vendas_count > 0 ? c.border : 'var(--psh-border-secondary)')}`,
                  background: c.bg,
                  cursor: d.vendas_count > 0 ? 'pointer' : 'default',
                  opacity: d.vendas_count === 0 ? 0.4 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontFamily: 'inherit',
                  color: c.text,
                  transition: 'transform 0.1s',
                  transform: isSelected ? 'scale(1.04)' : undefined,
                }}
                title={d.vendas_count > 0 ? `${d.vendas_count} vendas · ${fmtBRLcent(d.faturamento)} / ${fmtBRLcent(d.lucro)}` : 'Sem vendas'}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{dayNum}</div>
                {d.vendas_count > 0 && (
                  <>
                    <div style={{ fontSize: 10, lineHeight: 1.2, marginTop: 2, fontWeight: 600 }}>
                      {fmtBRL(d.faturamento)}
                    </div>
                    <div style={{ fontSize: 9, lineHeight: 1.2, color: c.lucro, fontWeight: 700 }}>
                      / {fmtBRL(d.lucro)}
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--psh-text-secondary)', marginBottom: 16, flexWrap: 'wrap' }}>
        <Legenda cor="#10b981" texto="Margem > 30% (saudável)" />
        <Legenda cor="#f59e0b" texto="Margem 15-30% (atenção)" />
        <Legenda cor="#ef4444" texto="Margem < 15% (prejuízo)" />
      </div>

      {/* Drill-down do dia selecionado */}
      {selectedDate && (
        <div style={{
          background: 'var(--psh-bg-secondary)',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 12,
          padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: 'var(--psh-text-primary)' }}>
              📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => setSelectedDate(null)} style={{
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--psh-border-primary)',
              background: 'transparent', color: 'var(--psh-text-secondary)',
              fontSize: 12, cursor: 'pointer',
            }}>
              ✕ Fechar
            </button>
          </div>

          {loadingDia ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>⏳ Carregando...</div>
          ) : vendasDia.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-muted)' }}>
              Nenhuma venda neste dia.
            </div>
          ) : (
            <>
              {totaisDia && (
                <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <Kpi label="Faturamento" value={fmtBRL(totaisDia.faturamento)} color="var(--psh-text-primary)" />
                  <Kpi label="CMV" value={fmtBRL(totaisDia.cmv)} color="#ef4444" />
                  <Kpi label="Lucro" value={fmtBRL(totaisDia.lucro)} color={totaisDia.lucro > 0 ? '#10b981' : '#ef4444'} />
                  <Kpi label="Margem" value={`${totaisDia.margem_pct.toFixed(1)}%`} color={totaisDia.margem_pct > 30 ? '#10b981' : totaisDia.margem_pct > 15 ? '#f59e0b' : '#ef4444'} />
                  <Kpi label="Vendas" value={String(totaisDia.vendas_count)} color="var(--psh-text-primary)" />
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--psh-bg-primary)', color: 'var(--psh-text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={th}>#</th>
                      <th style={th}>Pedido</th>
                      <th style={th}>Produto</th>
                      <th style={{ ...th, textAlign: 'right' }}>Qtd</th>
                      <th style={{ ...th, textAlign: 'right' }}>Venda</th>
                      <th style={{ ...th, textAlign: 'right' }}>Custo</th>
                      <th style={{ ...th, textAlign: 'right' }}>Lucro</th>
                      <th style={{ ...th, textAlign: 'center' }}>Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasDia.flatMap((v, vi) =>
                      v.items.map((it, ii) => (
                        <tr key={`${v.id}-${ii}`} style={{ borderTop: ii === 0 ? '2px solid var(--psh-border-primary)' : '1px solid var(--psh-border-secondary)' }}>
                          <td style={td}>
                            {ii === 0 && <span style={{ color: 'var(--psh-text-muted)', fontSize: 11 }}>#{vi + 1}</span>}
                          </td>
                          <td style={td}>
                            {ii === 0 && (
                              <div>
                                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--psh-text-secondary)' }}>{v.order_number}</div>
                                <div style={{ fontSize: 10, color: 'var(--psh-text-muted)' }}>{v.status} · {v.tipo_envio || '—'}</div>
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {it.foto && <img src={it.foto} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: 'var(--psh-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                  {it.nome || it.sku}
                                </div>
                                <div style={{ color: 'var(--psh-text-muted)', fontSize: 10, fontFamily: 'monospace' }}>{it.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{it.quantidade}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#10b981' }}>{fmtBRLcent(it.preco_total)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#ef4444' }}>{fmtBRLcent(it.custo_total)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: it.lucro_item > 0 ? '#7c3aed' : '#ef4444' }}>
                            {fmtBRLcent(it.lucro_item)}
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: it.preco_total > 0 && (it.lucro_item / it.preco_total) * 100 > 30 ? '#10b981' : (it.lucro_item / it.preco_total) * 100 > 15 ? '#f59e0b' : '#ef4444' }}>
                            {it.preco_total > 0 ? `${((it.lucro_item / it.preco_total) * 100).toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: 6,
  border: '1px solid var(--psh-border-primary)',
  background: 'var(--psh-bg-primary)',
  color: 'var(--psh-text-primary)',
  fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 10px', background: 'var(--psh-bg-primary)', borderRadius: 6, minWidth: 90 }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: cor }} />
      <span>{texto}</span>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontWeight: 600 }
const td: React.CSSProperties = { padding: '6px 10px', verticalAlign: 'middle' }