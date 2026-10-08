'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')

interface Venda {
  id: string
  order_number: string
  company_id: string
  company_nome: string
  account_type: string
  origem: string
  total: string
  custo_total: string
  comissao: string
  frete: string
  custo_flex: string
  tipo_envio: string
  status: string
  created_at: string
  etiqueta_impressa_em: string
  impressa_por: string
  impressa_por_nome: string
  data_contabil: string
}

interface ResumoOrigem {
  origem: string
  vendas: number
  receita: string
  cmv: string
  comissao: string
  frete: string
  custo_flex: string
}

interface ResumoCompany {
  company_id: string
  nome: string
  account_type: string
  vendas: number
  receita: string
  cmv: string
}

const TABS = [
  { key: '', label: 'Todos', emoji: '🔄' },
  { key: 'mercado_livre', label: 'Mercado Livre', emoji: '🟡' },
  { key: 'shopee', label: 'Shopee', emoji: '🟠' },
  { key: 'b2b', label: 'Vendas B2B', emoji: '🤝' },
  { key: 'manual', label: 'Manual / Direto', emoji: '🟢' },
]

const ORIGEM_LABEL: Record<string, string> = {
  mercado_livre: 'Mercado Livre',
  shopee: 'Shopee',
  b2b: 'B2B',
  manual: 'Manual',
  site_b2c: 'Site B2C',
  whatsapp: 'WhatsApp',
}

const ORIGEM_EMOJI: Record<string, string> = {
  mercado_livre: '🟡',
  shopee: '🟠',
  b2b: '🤝',
  manual: '🟢',
  site_b2c: '🔵',
  whatsapp: '💬',
}

export default function VendasFiltradasPage() {
  const [tab, setTab] = useState<string>('')
  const [companyId, setCompanyId] = useState<string>('')
  const [dataContabil, setDataContabil] = useState<string>('hoje')
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<Array<{ id: string, nome_fantasia: string }>>([])

  useEffect(() => {
    fetch('/api/admin/companies-list', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.ok) setCompanies(j.companies || []) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab) params.set('origem', tab)
      if (companyId) params.set('company_id', companyId)
      if (dataContabil === 'hoje' || dataContabil === 'ontem') {
        params.set('data_contabil', dataContabil)
      } else {
        params.set('days', '7')
      }
      params.set('limit', '200')
      const r = await fetch(`/api/admin/vendas-recentes-filtrado?${params}`, { credentials: 'include' })
      const j = await r.json()
      if (j.ok) setDados(j)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tab, companyId, dataContabil])

  useEffect(() => { load() }, [load])

  const totais = dados?.totais || {}
  const receita = Number(totais.receita || 0)
  const cmv = Number(totais.cmv || 0)
  const comissao = Number(totais.comissao || 0)
  const frete = Number(totais.frete || 0)
  const custoFlex = Number(totais.custo_flex || 0)
  const lucro = receita - cmv - comissao - frete - custoFlex
  const margem = receita > 0 ? (lucro / receita * 100) : 0

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            Vendas Filtradas
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Filtra por marketplace, vendedor, ou data contabil (corte 14h)
          </p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ padding: '8px 16px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Carregando' : 'Atualizar'}
        </button>
      </div>

      {/* Tabs: origem */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--psh-bg-secondary)', padding: 6, borderRadius: 8, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              background: tab === t.key ? 'var(--psh-accent, #3b82f6)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--psh-text-primary)',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: tab === t.key ? 600 : 400,
              fontSize: 13,
              whiteSpace: 'nowrap',
            }}>
            <span style={{ marginRight: 6 }}>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Filtros secundarios */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>
            Data Contabil
          </label>
          <select value={dataContabil} onChange={(e) => setDataContabil(e.target.value)}
            style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>
            <option value="hoje">Hoje (corte 14h)</option>
            <option value="ontem">Ontem</option>
            <option value="7d">Ultimos 7 dias</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>
            Vendedor / Empresa
          </label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
            style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)', minWidth: 200 }}>
            <option value="">Todas</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        <KPI label="Vendas" value={K(totais.vendas || 0)} />
        <KPI label="Receita" value={fmtBRL(receita)} accent="blue" />
        <KPI label="CMV" value={fmtBRL(cmv)} sub={receita > 0 ? `${(cmv / receita * 100).toFixed(1)}%` : ''} />
        <KPI label="Comissao" value={fmtBRL(comissao)} sub={receita > 0 ? `${(comissao / receita * 100).toFixed(1)}%` : ''} />
        <KPI label="Frete + FLEX" value={fmtBRL(frete + custoFlex)} sub={receita > 0 ? `${((frete + custoFlex) / receita * 100).toFixed(1)}%` : ''} />
        <KPI label="Lucro" value={fmtBRL(lucro)} sub={margem > 0 ? `${margem.toFixed(1)}%` : ''} accent={lucro > 0 ? 'green' : 'red'} />
      </div>

      {/* Resumo por origem (cards) */}
      {dados?.resumo_por_origem?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--psh-text-primary)' }}>
            Resumo por Origem
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {dados.resumo_por_origem.map((r: ResumoOrigem) => {
              const rReceita = Number(r.receita)
              const rLucro = rReceita - Number(r.cmv) - Number(r.comissao) - Number(r.frete) - Number(r.custo_flex)
              return (
                <div key={r.origem} style={{ background: 'var(--psh-bg-secondary)', borderRadius: 8, padding: 12, borderLeft: `4px solid ${tab === r.origem ? '#3b82f6' : '#9ca3af'}` }}>
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)' }}>
                    {ORIGEM_EMOJI[r.origem] || '•'} {ORIGEM_LABEL[r.origem] || r.origem}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)', marginTop: 4 }}>{fmtBRL(rReceita)}</div>
                  <div style={{ fontSize: 11, color: rLucro > 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                    Lucro {fmtBRL(rLucro)} ({rReceita > 0 ? ((rLucro / rReceita) * 100).toFixed(1) : 0}%)
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 2 }}>{K(r.vendas)} vendas</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista de vendas */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
          Vendas ({K(dados?.vendas?.length || 0)})
        </h2>
        {dados?.vendas?.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Pedido</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Origem</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Vendedor</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>CMV</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Lucro</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Impresso por</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Data Contabil</th>
                </tr>
              </thead>
              <tbody>
                {dados.vendas.map((v: Venda) => {
                  const vReceita = Number(v.total)
                  const vLucro = vReceita - Number(v.custo_total) - Number(v.comissao) - Number(v.frete) - Number(v.custo_flex)
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                      <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>#{v.order_number}</td>
                      <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>
                        <span style={{ marginRight: 4 }}>{ORIGEM_EMOJI[v.origem] || '•'}</span>
                        {ORIGEM_LABEL[v.origem] || v.origem}
                      </td>
                      <td style={{ padding: 8, color: 'var(--psh-text-secondary)' }}>{v.company_nome}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(vReceita)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(Number(v.custo_total))}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: vLucro > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtBRL(vLucro)}</td>
                      <td style={{ padding: 8, color: 'var(--psh-text-secondary)', fontSize: 11 }}>{v.impressa_por_nome || '(nao marcada)'}</td>
                      <td style={{ padding: 8, color: 'var(--psh-text-secondary)', fontSize: 11 }}>
                        {v.data_contabil ? new Date(v.data_contabil + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhuma venda encontrada com esses filtros</p>
        )}
      </div>
    </div>
  )
}

function KPI({ label, value, sub, accent }: { label: string, value: string, sub?: string, accent?: 'blue' | 'green' | 'red' }) {
  const color = accent === 'green' ? '#10b981' : accent === 'red' ? '#ef4444' : accent === 'blue' ? '#3b82f6' : 'var(--psh-text-primary)'
  return (
    <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
