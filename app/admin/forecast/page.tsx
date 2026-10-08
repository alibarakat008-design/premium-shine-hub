'use client'

/**
 * /admin/forecast
 *
 * Previsão de vendas dos próximos meses usando média móvel ponderada
 * + tendência dos últimos 90 dias.
 *
 * - Histórico dos últimos 6 meses
 * - Projeção dos próximos N meses (1-12)
 * - Tendência (alta/baixa/estável)
 * - Comparativo mês-a-mês
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Historico { key: string; label: string; receita: number; pedidos: number; itens: number; ticket_medio: number }
interface Projecao { key: string; label: string; receita: number; pedidos: number; itens: number; confianca: number; limite_inferior: number; limite_superior: number }

interface Data {
  historico: Historico[]
  projecoes: Projecao[]
  tendencia_pct: number
  crescimento_mensal_pct: number
  sazonalidade: Record<number, number>
  total_historico_receita: number
  media_mensal_receita: number
  melhor_mes: Historico | null
  pior_mes: Historico | null
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtBRLFull = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ForecastPage() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(3)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/relatorios/forecast?meses_futuro=${meses}`, { credentials: 'include' })
      const j = await r.json()
      if (j.success) setData(j.data)
      else setError(j.error || 'Erro ao carregar')
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [meses])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--psh-text-secondary)' }}>
        ⏳ Carregando projeções de forecast...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 16, borderRadius: 12 }}>
          ⚠️ {error}
          <button onClick={fetchData} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#991b1b', color: 'var(--psh-bg-primary, #fff)', cursor: 'pointer' }}>🔄 Tentar de novo</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const maxValor = Math.max(
    ...(data.historico || []).map(h => h.receita),
    ...(data.projecoes || []).map(p => p.receita),
    ...(data.projecoes || []).map(p => p.limite_superior || 0),
    1
  )

  const tendenciaCor = data.tendencia_pct > 5 ? '#22c55e' : data.tendencia_pct < -5 ? '#ef4444' : '#eab308'
  const tendenciaEmoji = data.tendencia_pct > 5 ? '📈' : data.tendencia_pct < -5 ? '📉' : '➡️'
  const tendenciaLabel = data.tendencia_pct > 5 ? 'Em alta' : data.tendencia_pct < -5 ? 'Em queda' : 'Estável'

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--psh-text-primary)' }}>
            🔮 Forecast de Vendas
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--psh-text-secondary)', fontSize: 14 }}>
            Projeção dos próximos meses usando média móvel ponderada + sazonalidade dos últimos 6 meses
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={fetchData}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--psh-border)', background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            🔄 Atualizar
          </button>
          <select
            value={meses}
            onChange={e => setMeses(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--psh-border)', background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)', fontSize: 14, cursor: 'pointer' }}
          >
            {[1, 2, 3, 6, 12].map(m => (
              <option key={m} value={m}>Próximo {m} {m === 1 ? 'mês' : 'meses'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={kpiCard}>
          <div style={kpiLabel}>Tendência</div>
          <div style={{ ...kpiValue, color: tendenciaCor }}>
            {tendenciaEmoji} {tendenciaLabel}
          </div>
          <div style={kpiSub}>{data.tendencia_pct > 0 ? '+' : ''}{data.tendencia_pct.toFixed(1)}% vs últimos 3 meses</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Crescimento Mensal</div>
          <div style={{ ...kpiValue, color: data.crescimento_mensal_pct >= 0 ? '#22c55e' : '#ef4444' }}>
            {data.crescimento_mensal_pct >= 0 ? '+' : ''}{data.crescimento_mensal_pct.toFixed(1)}%
          </div>
          <div style={kpiSub}>CAGR últimos 6 meses</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Média Mensal</div>
          <div style={kpiValue}>{fmtBRL(data.media_mensal_receita)}</div>
          <div style={kpiSub}>Últimos 6 meses</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Melhor Mês</div>
          <div style={{ ...kpiValue, fontSize: 18, color: '#22c55e' }}>
            {data.melhor_mes ? `${data.melhor_mes.label}` : '-'}
          </div>
          <div style={kpiSub}>{data.melhor_mes ? fmtBRL(data.melhor_mes.receita) : ''}</div>
        </div>
      </div>

      {/* Gráfico histórico + projeção */}
      <div style={card}>
        <h2 style={cardTitle}>📊 Histórico + Projeção</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 280, padding: '20px 0', overflowX: 'auto' }}>
          {[...data.historico, ...data.projecoes].map((item, idx) => {
            const isProjecao = 'confianca' in item
            const heightPct = maxValor > 0 ? (item.receita / maxValor) * 100 : 0
            return (
              <div key={item.key} style={{ flex: 1, minWidth: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                  {fmtBRL(item.receita)}
                </div>
                <div style={{
                  width: '70%',
                  height: `${heightPct}%`,
                  background: isProjecao
                    ? `linear-gradient(180deg, ${tendenciaCor}88, ${tendenciaCor}44)`
                    : 'linear-gradient(180deg, #3b82f6, #1e40af)',
                  borderRadius: '6px 6px 0 0',
                  border: isProjecao ? `2px dashed ${tendenciaCor}` : '2px solid #1e40af',
                  position: 'relative',
                  minHeight: 4,
                }}>
                  {isProjecao && (item as Projecao).limite_superior && maxValor > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      transform: 'translate(-50%, -100%)',
                      width: 2,
                      height: `${((item as Projecao).limite_superior / maxValor) * 100}%`,
                      background: tendenciaCor,
                      opacity: 0.4,
                    }} />
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--psh-text-secondary)', marginTop: 6, textAlign: 'center' }}>
                  {item.label}
                </div>
                {isProjecao && (
                  <div style={{ fontSize: 9, color: tendenciaCor, marginTop: 2, fontWeight: 600 }}>
                    {Math.round((item as Projecao).confianca)}% confiança
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: '#1e40af', borderRadius: 2 }} />
            Histórico (real)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: tendenciaCor, border: `2px dashed ${tendenciaCor}`, borderRadius: 2 }} />
            Projeção
          </div>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={cardTitle}>📋 Detalhamento Mensal</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                <th style={th}>Mês</th>
                <th style={th}>Tipo</th>
                <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
                <th style={{ ...th, textAlign: 'right' }}>Itens</th>
                <th style={{ ...th, textAlign: 'right' }}>Ticket Médio</th>
                <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                {data.historico.length > 0 && 'limite_inferior' in data.historico[data.historico.length - 1] && (
                  <>
                    <th style={{ ...th, textAlign: 'right' }}>Min</th>
                    <th style={{ ...th, textAlign: 'right' }}>Max</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[...data.historico, ...data.projecoes].map((item, idx) => {
                const isProjecao = 'confianca' in item
                return (
                  <tr key={item.key} style={{ borderBottom: '1px solid var(--psh-border)', background: isProjecao ? 'var(--psh-bg-secondary)' : 'transparent' }}>
                    <td style={td}>{item.label}</td>
                    <td style={td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: isProjecao ? `${tendenciaCor}22` : '#1e40af22',
                        color: isProjecao ? tendenciaCor : '#1e40af',
                      }}>
                        {isProjecao ? '🔮 Projeção' : '📊 Real'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{item.pedidos}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{item.itens}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRLFull((item as any).ticket_medio || 0)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtBRLFull(item.receita)}</td>
                    {isProjecao && (
                      <>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-secondary)', fontSize: 12 }}>
                          {fmtBRL((item as Projecao).limite_inferior || 0)}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--psh-text-secondary)', fontSize: 12 }}>
                          {fmtBRL((item as Projecao).limite_superior || 0)}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sazonalidade */}
      {data.sazonalidade && Object.keys(data.sazonalidade).length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h2 style={cardTitle}>📅 Sazonalidade por Mês</h2>
          <p style={{ fontSize: 13, color: 'var(--psh-text-secondary)', marginTop: -8, marginBottom: 16 }}>
            Índice sazonal — qual mês vende mais vs média anual (100 = média, &gt;100 = pico, &lt;100 = vale)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
            {Object.entries(data.sazonalidade).map(([mes, idx]) => {
              const maxIdx = Math.max(...Object.values(data.sazonalidade))
              const heightPct = maxIdx > 0 ? (idx / maxIdx) * 100 : 0
              const cor = idx > 110 ? '#22c55e' : idx < 90 ? '#ef4444' : '#3b82f6'
              return (
                <div key={mes} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginBottom: 4 }}>
                    {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][Number(mes) - 1]}
                  </div>
                  <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{
                      width: '60%',
                      height: `${heightPct}%`,
                      background: cor,
                      borderRadius: '4px 4px 0 0',
                      minHeight: 4,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: cor, fontWeight: 700, marginTop: 4 }}>
                    {idx.toFixed(0)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumo final */}
      <div style={{ ...card, marginTop: 16, background: 'var(--psh-bg-secondary)' }}>
        <h3 style={{ ...cardTitle, margin: 0, marginBottom: 8 }}>💡 Insights</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--psh-text-secondary)', lineHeight: 1.7 }}>
          <li>Total projetado para os próximos {meses} {meses === 1 ? 'mês' : 'meses'}: <b style={{ color: 'var(--psh-text-primary)' }}>{fmtBRL(data.projecoes.reduce((s, p) => s + p.receita, 0))}</b></li>
          <li>Média mensal projetada: <b style={{ color: 'var(--psh-text-primary)' }}>{fmtBRL(data.projecoes.reduce((s, p) => s + p.receita, 0) / meses)}</b></li>
          {data.tendencia_pct > 0 ? (
            <li>Crescimento esperado de <b style={{ color: '#22c55e' }}>{data.tendencia_pct.toFixed(1)}%</b> vs últimos 3 meses — preparar estoque!</li>
          ) : data.tendencia_pct < 0 ? (
            <li>Queda esperada de <b style={{ color: '#ef4444' }}>{Math.abs(data.tendencia_pct).toFixed(1)}%</b> — considerar ações pra impulsionar</li>
          ) : (
            <li>Vendas estáveis — manter operação atual</li>
          )}
        </ul>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--psh-bg-primary)',
  border: '1px solid var(--psh-border)',
  borderRadius: 12,
  padding: 20,
}
const cardTitle: React.CSSProperties = {
  margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)',
}
const kpiCard: React.CSSProperties = {
  background: 'var(--psh-bg-primary)',
  border: '1px solid var(--psh-border)',
  borderRadius: 12,
  padding: 16,
}
const kpiLabel: React.CSSProperties = { fontSize: 12, color: 'var(--psh-text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }
const kpiValue: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--psh-text-primary)', marginBottom: 4 }
const kpiSub: React.CSSProperties = { fontSize: 11, color: 'var(--psh-text-secondary)' }
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px 8px', color: 'var(--psh-text-primary)' }
