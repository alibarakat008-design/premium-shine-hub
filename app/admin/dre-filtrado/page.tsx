'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')

interface Linha {
  chave: string
  tipo: 'origem' | 'company'
  label: string
  account_type?: string
  vendas: number
  receita: number
  cmv: number
  cmv_pct: number
  comissao: number
  frete: number
  custo_flex: number
  lucro: number
  margem_pct: number
}

interface Data {
  periodo_dias: number
  group_by: string
  linhas: Linha[]
  totais: {
    vendas: number
    receita: number
    cmv: number
    cmv_pct: number
    comissao: number
    frete: number
    custo_flex: number
    lucro: number
    margem_pct: number
  }
  comparativo: {
    periodo_anterior: { vendas: number; receita: number }
    variacao_receita_pct: number
  }
}

const GRUPO_LABELS: Record<string, string> = {
  origem: 'Por Marketplace',
  company: 'Por Vendedor/Empresa',
  all: 'Tudo junto (marketplace + vendedor)',
}

const ORIGEM_LABELS: Record<string, { emoji: string; label: string }> = {
  mercado_livre: { emoji: '🟡', label: 'Mercado Livre' },
  shopee: { emoji: '🟠', label: 'Shopee' },
  manual: { emoji: '🟢', label: 'Manual / Direto' },
  site_b2c: { emoji: '🔵', label: 'Site B2C' },
  whatsapp: { emoji: '💬', label: 'WhatsApp' },
  b2b: { emoji: '🤝', label: 'B2B (entre empresas)' },
}

export default function DreFiltradoPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [groupBy, setGroupBy] = useState<'origem' | 'company' | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/dre-filtrado?days=${days}&group_by=${groupBy}`, { credentials: 'include' })
      const j = await r.json()
      if (j.ok) setData(j)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [days, groupBy])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            DRE Filtrado
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Entenda quanto cada operacao rende: por marketplace, por vendedor, ou tudo junto
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button onClick={load} disabled={loading}
            style={{ padding: '8px 16px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
            {loading ? 'Carregando' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Seletor de agrupamento */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'var(--psh-bg-secondary)', padding: 12, borderRadius: 8 }}>
        {(['origem', 'company', 'all'] as const).map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
            style={{
              padding: '10px 20px',
              background: groupBy === g ? 'var(--psh-accent, #3b82f6)' : 'transparent',
              color: groupBy === g ? '#fff' : 'var(--psh-text-primary)',
              border: '1px solid var(--psh-border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: groupBy === g ? 600 : 400,
              fontSize: 14,
            }}>
            {GRUPO_LABELS[g]}
          </button>
        ))}
      </div>

      {/* Total destacado */}
      {data && (
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
          borderRadius: 12, padding: 24, marginBottom: 24, color: '#fff',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
        }}>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 4 }}>
            LUCRO CONSOLIDADO ({data.periodo_dias} dias){data.comparativo.variacao_receita_pct !== 0 && (
              <span style={{ marginLeft: 8, padding: '2px 8px', background: data.comparativo.variacao_receita_pct > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)', borderRadius: 4, fontSize: 11 }}>
                {data.comparativo.variacao_receita_pct > 0 ? '+' : ''}{data.comparativo.variacao_receita_pct.toFixed(1)}% vs periodo anterior
              </span>
            )}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{fmtBRL(data.totais.lucro)}</div>
          <div style={{ fontSize: 14, marginTop: 8, opacity: 0.95 }}>
            Receita {fmtBRL(data.totais.receita)} | CMV {fmtBRL(data.totais.cmv)} ({data.totais.cmv_pct.toFixed(1)}%) | Margem {data.totais.margem_pct.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Tabela detalhada */}
      {data && data.linhas.length > 0 && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
            Detalhamento ({GRUPO_LABELS[data.group_by]})
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Operacao</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Receita</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>CMV</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>%CMV</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Comissao</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Frete</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>FLEX</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Lucro</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Margem</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((l) => {
                  const origem = ORIGEM_LABELS[l.label]
                  const emoji = origem ? origem.emoji : (l.tipo === 'company' ? '🏢' : '•')
                  const labelDisplay = origem ? origem.label : l.label
                  return (
                    <tr key={l.chave} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                      <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>
                        <span style={{ marginRight: 6 }}>{emoji}</span>
                        {labelDisplay}
                        {l.account_type && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--psh-text-secondary)' }}>({l.account_type})</span>}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{K(l.vendas)}</td>
                      <td style={{ padding: 10, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(l.receita)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(l.cmv)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{l.cmv_pct.toFixed(1)}%</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(l.comissao)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(l.frete)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(l.custo_flex)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: l.lucro > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{fmtBRL(l.lucro)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: l.margem_pct > 30 ? '#10b981' : l.margem_pct > 15 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                        {l.margem_pct.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.linhas.length === 0 && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
          Nenhuma venda encontrada neste periodo
        </div>
      )}

      {/* Insight box */}
      {data && data.linhas.length > 0 && (
        <div style={{ marginTop: 24, padding: 16, background: 'var(--psh-bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--psh-text-secondary)' }}>
          <strong>Como ler:</strong>
          <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
            <li><strong>Por Marketplace</strong>: mostra a rentabilidade de cada canal (ML, Shopee, manual, B2B). Use pra saber onde voce ganha mais</li>
            <li><strong>Por Vendedor</strong>: mostra a rentabilidade de cada empresa parceira. Use pra comparar performances</li>
            <li><strong>Tudo junto</strong>: visao completa de todas as operacoes. Use pra ver consolidado</li>
            <li><strong>Lucro</strong> = Receita - CMV - Comissao - Frete - Custo FLEX. O CMV ja desconta o que voce pagou pelo produto</li>
          </ul>
        </div>
      )}
    </div>
  )
}
