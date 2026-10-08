'use client'

/**
 * GEOGRAFIA — Premium Shine Hub
 * Visualização de vendas por estado e cidade
 * - 5 abas: Visão Geral | Marcas | Marcas Deep | Gênero | Mapa
 * - Insights automáticos no topo
 * - Top cidades por % feminino
 * - Heatmap cruzado Marca × UF
 * - Mapa SVG do Brasil
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Uf = {
  uf: string
  pedidos: number
  receita: number
  unidades: number
  cidades: number
  pct_nacional: number
  pct_feminino: number
  pct_masculino: number
  pct_unissex: number
  top_marcas: { marca: string; pedidos: number; receita: number; pct: number }[]
}

type Cidade = {
  uf: string
  cidade: string
  pedidos: number
  receita: number
  unidades: number
  pct_feminino: number
}

type Marca = {
  id: string
  marca: string
  pedidos: number
  receita: number
  unidades: number
  pct_feminino: number
  pct_masculino: number
  pct_unissex: number
  concentracao_uf: number
  uf_principal: string | null
  top_cidades: { cidade: string; uf: string; pedidos: number; receita: number }[]
  top_produtos: { sku: string; nome: string; unidades: number; receita: number }[]
  top_ufs: { uf: string; pedidos: number; receita: number; pct: number }[]
}

type Cross = { marca: string; uf: string; pedidos: number; receita: number }
type Insight = { emoji: string; tipo: 'positivo' | 'atencao' | 'info'; titulo: string; detalhe: string }

type Data = {
  filtros: { meses: number; marca_id: string | null; genero: string | null }
  resumo: { total_pedidos: number; total_receita: number; total_ufs: number; total_cidades: number; total_marcas: number; total_orders_no_periodo: number; orders_sem_endereco: number }
  top_ufs: Uf[]
  top_cidades: Cidade[]
  top_cidades_feminino: Cidade[]
  top_marcas: Marca[]
  cross_marca_uf: Cross[]
  insights: Insight[]
}

const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

const UF_GRID: { uf: string; row: number; col: number }[] = [
  { uf: 'RR', row: 0, col: 4 },
  { uf: 'AP', row: 0, col: 5 },
  { uf: 'AM', row: 1, col: 3 },
  { uf: 'PA', row: 1, col: 5 },
  { uf: 'MA', row: 1, col: 6 },
  { uf: 'CE', row: 2, col: 7 },
  { uf: 'RN', row: 2, col: 8 },
  { uf: 'PB', row: 2, col: 7.5 },
  { uf: 'PE', row: 2, col: 7 },
  { uf: 'PI', row: 2, col: 6.5 },
  { uf: 'AC', row: 1, col: 1 },
  { uf: 'RO', row: 1, col: 2.5 },
  { uf: 'MT', row: 2, col: 3 },
  { uf: 'TO', row: 2, col: 5 },
  { uf: 'GO', row: 3, col: 4.5 },
  { uf: 'DF', row: 3, col: 5.5 },
  { uf: 'BA', row: 3, col: 6.5 },
  { uf: 'AL', row: 3, col: 7.5 },
  { uf: 'SE', row: 3, col: 7 },
  { uf: 'MS', row: 3, col: 3 },
  { uf: 'MG', row: 3, col: 5.5 },
  { uf: 'ES', row: 3, col: 6.5 },
  { uf: 'RJ', row: 4, col: 6.5 },
  { uf: 'SP', row: 4, col: 5.5 },
  { uf: 'PR', row: 4, col: 4.5 },
  { uf: 'SC', row: 4, col: 5 },
  { uf: 'RS', row: 5, col: 4 },
]

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const INSIGHT_BG: Record<string, string> = {
  positivo: '#ecfdf5',
  atencao: '#fffbeb',
  info: '#eff6ff',
}
const INSIGHT_BORDER: Record<string, string> = {
  positivo: '#10b981',
  atencao: '#f59e0b',
  info: '#3b82f6',
}

export default function GeograficoPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'geral' | 'marcas' | 'marcas-deep' | 'genero' | 'mapa'>('geral')
  const [meses, setMeses] = useState(6)
  const [genero, setGenero] = useState('todos')
  const [marcaSelecionada, setMarcaSelecionada] = useState('todas')
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)
  const [backfillStatus, setBackfillStatus] = useState<{ restantes: number; processadas: number } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ meses: String(meses) })
      if (genero !== 'todos') params.set('genero', genero)
      const r = await apiFetch(`/api/admin/relatorios/geografico-v2?${params}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [meses, genero])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  const rodarBackfill = async () => {
    if (!confirm('Rodar backfill de endereços? Isso faz várias chamadas à API do ML. Pode levar vários minutos.')) return
    setBackfillStatus({ restantes: -1, processadas: 0 })
    let offset = 0
    let processadas = 0
    while (true) {
      const r = await apiFetch('/api/admin/backfill-endereco?offset=${offset}&batch=30', { method: 'POST' })
      const j = await r.json()
      if (!j.ok) { alert('Erro: ' + j.error); break }
      processadas += j.processadas
      setBackfillStatus({ restantes: j.restantes, processadas })
      if (j.status === 'concluido' || j.restantes === 0) break
      offset = j.next_offset
    }
    setBackfillStatus(null)
    alert(`✓ Backfill concluído! ${processadas} orders processadas.`)
    fetchData()
  }

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando dados geográficos...</div>
  }

  const maxReceita = data?.top_ufs?.[0]?.receita || 1
  const marcas = Array.from(new Set(data?.top_marcas?.map((m) => m.marca) || []))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📍 Geografia de Vendas</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Cidades, estados, marcas, público feminino e masculino</p>
        </div>
        <Link href="/admin/dashboard" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Dashboard</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {data && data.resumo.orders_sem_endereco > 100 && (
        <div style={{ padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>⚠️ {data.resumo.orders_sem_endereco.toLocaleString('pt-BR')} orders sem endereço</div>
            <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>Rode o backfill pra extrair cidade/UF do Mercado Livre</div>
          </div>
          <button onClick={rodarBackfill} disabled={backfillStatus !== null} style={{ padding: '8px 14px', background: backfillStatus ? 'var(--psh-text-secondary, #9ca3af)' : '#f59e0b', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: backfillStatus ? 'not-allowed' : 'pointer' }}>
            {backfillStatus ? `⏳ Processando... ${backfillStatus.processadas} (restam ${backfillStatus.restantes >= 0 ? backfillStatus.restantes : '?'})` : '🔄 Rodar Backfill'}
          </button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={selectStyle}>
          <option value={1}>Último mês</option>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Último ano</option>
        </select>
        <select value={genero} onChange={(e) => setGenero(e.target.value)} style={selectStyle}>
          <option value="todos">Todos os gêneros</option>
          <option value="feminino">Só feminino</option>
          <option value="masculino">Só masculino</option>
          <option value="unissex">Só unissex</option>
        </select>
      </div>

      {/* KPIs */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi label="Pedidos" value={data.resumo.total_pedidos.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="Receita" value={fmtBRL(data.resumo.total_receita)} color="#10b981" />
          <Kpi label="Estados" value={data.resumo.total_ufs} color="#8b5cf6" />
          <Kpi label="Cidades" value={data.resumo.total_cidades.toLocaleString('pt-BR')} color="#f59e0b" />
          <Kpi label="Marcas" value={data.resumo.total_marcas} color="#ec4899" />
        </div>
      )}

      {/* Insights Automáticos */}
      {data && data.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>💡 Insights Automáticos</span>
            <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', background: 'var(--psh-bg-secondary, #f3f4f6)', padding: '2px 6px', borderRadius: 3 }}>achados do período</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {data.insights.map((ins, i) => (
              <div key={i} style={{ background: INSIGHT_BG[ins.tipo] || 'var(--psh-bg-secondary, #fafbfc)', border: `1px solid ${INSIGHT_BORDER[ins.tipo] || 'var(--psh-border, #e5e7eb)'}40`, borderLeft: `4px solid ${INSIGHT_BORDER[ins.tipo] || 'var(--psh-text-secondary, #6b7280)'}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{ins.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{ins.titulo}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', lineHeight: 1.4 }}>{ins.detalhe}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        {([
          { key: 'geral', label: '📊 Visão Geral' },
          { key: 'marcas', label: '🏷️ Marcas' },
          { key: 'marcas-deep', label: '🔬 Marcas Deep' },
          { key: 'genero', label: '👩 Gênero' },
          { key: 'mapa', label: '🗺️ Mapa' },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 14px', background: tab === t.key ? '#3b82f6' : 'transparent', color: tab === t.key ? 'white' : 'var(--psh-text-primary, #374151)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {!data || data.top_ufs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          {data && data.resumo.orders_sem_endereco > 0
            ? 'Sem dados geográficos. Rode o backfill acima para extrair endereços do Mercado Livre.'
            : 'Nenhum dado disponível para o período selecionado.'}
        </div>
      ) : tab === 'geral' ? (
        <TabGeral data={data} maxReceita={maxReceita} />
      ) : tab === 'marcas' ? (
        <TabMarcas data={data} marcaSelecionada={marcaSelecionada} setMarcaSelecionada={setMarcaSelecionada} />
      ) : tab === 'marcas-deep' ? (
        <TabMarcasDeep data={data} />
      ) : tab === 'genero' ? (
        <TabGenero data={data} ufSelecionada={ufSelecionada} setUfSelecionada={setUfSelecionada} />
      ) : (
        <MapaPanel ufs={data.top_ufs} />
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }

function TabGeral({ data, maxReceita }: { data: Data; maxReceita: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <TopUfsPanel ufs={data.top_ufs} maxReceita={maxReceita} />
      <TopCidadesPanel cidades={data.top_cidades} />
    </div>
  )
}

function TopUfsPanel({ ufs, maxReceita }: { ufs: Uf[]; maxReceita: number }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🗺️ Top Estados por Receita</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
        {ufs.map((u, i) => {
          const pct = (u.receita / maxReceita) * 100
          return (
            <div key={u.uf} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 6 }}>
              <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 11 }}>#{i + 1}</div>
              <div style={{ width: 36, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 12 }}>{u.uf}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 500 }}>{UF_NOMES[u.uf] || u.uf}</span>
                  <span style={{ color: '#10b981', fontSize: 12, fontWeight: 700 }}>{fmtBRL(u.receita)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--psh-border, #e5e7eb)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)' }} />
                </div>
                <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{u.pedidos} pedidos</span>
                  <span>•</span>
                  <span>{u.cidades} cidades</span>
                  <span>•</span>
                  <span style={{ color: '#3b82f6' }}>{u.pct_nacional}% BR</span>
                  {u.pct_feminino > 0 && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#ec4899' }}>♀ {u.pct_feminino.toFixed(0)}%</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopCidadesPanel({ cidades }: { cidades: Cidade[] }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🏙️ Top Cidades por Receita</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 600, overflowY: 'auto' }}>
        {cidades.slice(0, 30).map((c, i) => (
          <div key={`${c.uf}-${c.cidade}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
            <div style={{ width: 20, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 10 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.cidade} <span style={{ color: '#3b82f6', fontSize: 10 }}>/{c.uf}</span>
              </div>
              <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>{c.pedidos} pedidos • {c.unidades} un</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>{fmtBRL(c.receita)}</div>
              {c.pct_feminino > 0 && c.pct_feminino !== 50 && (
                <div style={{ color: '#ec4899', fontSize: 9 }}>♀ {c.pct_feminino.toFixed(0)}%</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabMarcas({ data, marcaSelecionada, setMarcaSelecionada }: { data: Data; marcaSelecionada: string; setMarcaSelecionada: (s: string) => void }) {
  const top10Ufs = data.top_ufs.slice(0, 10).map((u) => u.uf)
  const top10Marcas = data.top_marcas.slice(0, 10).map((m) => m.marca)
  const matrix: Record<string, Record<string, number>> = {}
  let maxMatrixReceita = 0
  for (const c of data.cross_marca_uf) {
    if (!matrix[c.marca]) matrix[c.marca] = {}
    matrix[c.marca][c.uf] = c.receita
    if (c.receita > maxMatrixReceita) maxMatrixReceita = c.receita
  }
  const marcaFoco = marcaSelecionada !== 'todas' ? data.top_marcas.find((m) => m.marca === marcaSelecionada) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🏷️ Top Marcas (vendas totais)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 600, overflowY: 'auto' }}>
          {data.top_marcas.slice(0, 20).map((m, i) => {
            const ativo = marcaSelecionada === m.marca
            return (
              <div key={m.marca} onClick={() => setMarcaSelecionada(ativo ? 'todas' : m.marca)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: ativo ? '#eff6ff' : 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4, cursor: 'pointer', border: ativo ? '1px solid #3b82f6' : '1px solid transparent' }}>
                <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 10 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.marca}</div>
                  <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>{m.pedidos} vendas • {m.unidades} un</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>{fmtBRL(m.receita)}</div>
                  {m.pct_feminino > 50 && <div style={{ color: '#ec4899', fontSize: 9 }}>♀ {m.pct_feminino.toFixed(0)}%</div>}
                </div>
              </div>
            )
          })}
          {data.top_marcas.length >= 2 && (
            <div style={{ marginTop: 8, padding: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, fontSize: 10, color: '#1e40af', textAlign: 'center' }}>
              💡 Quer comparar 2 marcas? Vá em <Link href="/admin/comparativo-marcas" style={{ color: '#1e40af', fontWeight: 700, textDecoration: 'underline' }}>Comparativo Marcas</Link>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {marcaFoco ? (
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 4 }}>📍 Onde {marcaFoco.marca} vende mais</div>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 12 }}>{marcaFoco.pedidos} vendas • {fmtBRL(marcaFoco.receita)} • {marcaFoco.pct_feminino.toFixed(0)}% feminino</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {marcaFoco.top_ufs.map((u) => (
                <div key={u.uf} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
                  <div style={{ width: 32, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 12 }}>{u.uf}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 8, background: 'var(--psh-border, #e5e7eb)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${u.pct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
                    </div>
                  </div>
                  <div style={{ minWidth: 60, textAlign: 'right', fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 600 }}>{u.pct}%</div>
                </div>
              ))}
            </div>
            {marcaFoco.concentracao_uf >= 50 && (
              <div style={{ marginTop: 12, padding: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, color: '#92400e' }}>
                ⚠️ <strong>Concentração alta:</strong> {marcaFoco.concentracao_uf.toFixed(0)}% das vendas em {marcaFoco.uf_principal}
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, fontSize: 12, color: '#1e40af' }}>
            👈 Clique numa marca à esquerda pra ver onde ela vende mais
          </div>
        )}

        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>🔥 Top 10 Marcas × Top 10 Estados</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 100, textAlign: 'left' }}>Marca</th>
                  {top10Ufs.map((uf) => (
                    <th key={uf} style={{ ...th, minWidth: 50 }}>{uf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top10Marcas.map((marca) => (
                  <tr key={marca}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>{marca}</td>
                    {top10Ufs.map((uf) => {
                      const r = matrix[marca]?.[uf] || 0
                      const intensity = r / maxMatrixReceita
                      return (
                        <td key={uf} style={{ ...td, textAlign: 'center', background: r > 0 ? `rgba(59, 130, 246, ${0.15 + intensity * 0.85})` : 'var(--psh-bg-secondary, #f9fafb)', color: intensity > 0.5 ? 'white' : 'var(--psh-text-primary, #111827)', fontWeight: r > 0 ? 600 : 400, padding: '4px 6px' }}>
                          {r > 0 ? fmtBRL(r) : '·'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabMarcasDeep({ data }: { data: Data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.top_marcas.slice(0, 8).map((m, idx) => (
        <div key={m.marca} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 6, background: idx < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{idx + 1}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{m.marca}</div>
                <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{m.pedidos} vendas • {fmtBRL(m.receita)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {m.pct_feminino > 0 && <Badge cor="#ec4899" label={`♀ ${m.pct_feminino.toFixed(0)}%`} />}
              {m.pct_masculino > 0 && <Badge cor="#3b82f6" label={`♂ ${m.pct_masculino.toFixed(0)}%`} />}
              {m.pct_unissex > 0 && <Badge cor="#a78bfa" label={`◇ ${m.pct_unissex.toFixed(0)}%`} />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {/* Top Cidades */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 6, textTransform: 'uppercase' }}>🏙️ Top Cidades</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.top_cidades.map((c, i) => (
                  <div key={`${c.uf}-${c.cidade}`} style={{ display: 'flex', justifyContent: 'space-between', padding: 4, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, fontSize: 11 }}>
                    <span style={{ color: 'var(--psh-text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {c.cidade}/{c.uf}</span>
                    <span style={{ color: '#10b981', fontWeight: 600, fontSize: 10 }}>{fmtBRL(c.receita)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Produtos */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 6, textTransform: 'uppercase' }}>🛍️ Top Produtos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.top_produtos.map((p, i) => (
                  <div key={p.sku} style={{ display: 'flex', justifyContent: 'space-between', padding: 4, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3, fontSize: 11 }}>
                    <span style={{ color: 'var(--psh-text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{i + 1}. {p.nome}</span>
                    <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 10 }}>×{p.unidades}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top UFs */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 6, textTransform: 'uppercase' }}>🗺️ Top Estados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.top_ufs.map((u) => (
                  <div key={u.uf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 3 }}>
                    <div style={{ width: 28, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 10 }}>{u.uf}</div>
                    <div style={{ flex: 1, height: 6, background: 'var(--psh-border, #e5e7eb)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${u.pct}%`, height: '100%', background: '#8b5cf6' }} />
                    </div>
                    <div style={{ minWidth: 35, textAlign: 'right', fontSize: 10, color: 'var(--psh-text-primary, #111827)', fontWeight: 600 }}>{u.pct}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Badge({ cor, label }: { cor: string; label: string }) {
  return (
    <span style={{ padding: '3px 8px', background: cor + '20', color: cor, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{label}</span>
  )
}

function TabGenero({ data, ufSelecionada, setUfSelecionada }: { data: Data; ufSelecionada: string | null; setUfSelecionada: (s: string | null) => void }) {
  const topUfsFeminino = data.top_ufs.filter((u) => u.pedidos >= 5).sort((a, b) => b.pct_feminino - a.pct_feminino).slice(0, 15)
  const cidadesFiltradas = ufSelecionada ? data.top_cidades.filter((c) => c.uf === ufSelecionada) : data.top_cidades_feminino

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 4 }}>♀ Onde o público FEMININO é maior</div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 12 }}>Ranking de UFs com mais % feminino</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
            {topUfsFeminino.map((u, i) => {
              const ativo = ufSelecionada === u.uf
              return (
                <div key={u.uf} onClick={() => setUfSelecionada(ativo ? null : u.uf)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: ativo ? '#fdf2f8' : 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 6, cursor: 'pointer', border: ativo ? '1px solid #ec4899' : '1px solid transparent' }}>
                  <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: '#ec4899', fontSize: 11 }}>#{i + 1}</div>
                  <div style={{ width: 32, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 12 }}>{u.uf}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 500 }}>{UF_NOMES[u.uf] || u.uf}</div>
                    <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>{u.pedidos} pedidos</div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Bar pct={u.pct_feminino} color="#ec4899" label="♀" />
                    <Bar pct={u.pct_masculino} color="#3b82f6" label="♂" />
                    <Bar pct={u.pct_unissex} color="#a78bfa" label="◇" />
                  </div>
                  <div style={{ minWidth: 50, textAlign: 'right', color: '#ec4899', fontWeight: 700, fontSize: 13 }}>{u.pct_feminino.toFixed(0)}%</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 4 }}>♂ Onde o público MASCULINO é maior</div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 12 }}>Ranking de UFs com mais % masculino</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
            {data.top_ufs.filter((u) => u.pedidos >= 5).sort((a, b) => b.pct_masculino - a.pct_masculino).slice(0, 10).map((u, i) => (
              <div key={u.uf} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
                <div style={{ width: 22, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 11 }}>#{i + 1}</div>
                <div style={{ width: 32, textAlign: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 12 }}>{u.uf}</div>
                <div style={{ flex: 1, color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 500 }}>{UF_NOMES[u.uf] || u.uf}</div>
                <div style={{ minWidth: 50, textAlign: 'right', color: '#3b82f6', fontWeight: 700, fontSize: 13 }}>{u.pct_masculino.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>{ufSelecionada ? `🏙️ Top cidades em ${UF_NOMES[ufSelecionada] || ufSelecionada}` : '🏙️ Top Cidades por % Feminino (mín 10 pedidos)'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cidadesFiltradas.slice(0, 30).map((c, i) => (
            <div key={`${c.uf}-${c.cidade}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
              <div style={{ width: 20, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)', fontSize: 10 }}>{i + 1}</div>
              <div style={{ flex: 1, color: 'var(--psh-text-primary, #111827)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cidade} <span style={{ color: '#3b82f6', fontSize: 10 }}>/{c.uf}</span></div>
              <div style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>{fmtBRL(c.receita)}</div>
              <div style={{ minWidth: 50, textAlign: 'right', color: '#ec4899', fontWeight: 700, fontSize: 11 }}>♀ {c.pct_feminino.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
      <div style={{ fontSize: 8, color }}>{label}</div>
      <div style={{ width: 6, height: 30, background: 'var(--psh-border, #e5e7eb)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 8, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{pct.toFixed(0)}%</div>
    </div>
  )
}

function MapaPanel({ ufs }: { ufs: Uf[] }) {
  const maxReceita = Math.max(...ufs.map((u) => u.receita), 1)
  const ufMap = new Map(ufs.map((u) => [u.uf, u]))
  const totals = ufs.reduce((s, u) => s + u.receita, 0)

  const colorFor = (receita: number) => {
    if (receita === 0) return 'var(--psh-bg-secondary, #f3f4f6)'
    const intensity = Math.min(1, Math.log10(receita + 1) / Math.log10(maxReceita + 1))
    if (intensity < 0.25) return '#fef3c7'
    if (intensity < 0.5) return '#fde68a'
    if (intensity < 0.7) return '#a7f3d0'
    if (intensity < 0.85) return '#6ee7b7'
    return '#10b981'
  }

  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 4 }}>🗺️ Mapa do Brasil — Receita por Estado</div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 16 }}>Tamanho e cor proporcionais à receita</div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gridAutoRows: '60px', gap: 4, maxWidth: 700, margin: '0 auto' }}>
        {UF_GRID.map(({ uf, row, col }) => {
          const data = ufMap.get(uf)
          const receita = data?.receita || 0
          return (
            <div key={uf} style={{ gridColumn: `${col + 1} / span 1`, gridRow: `${row + 1} / span 1`, background: colorFor(receita), border: data ? '1px solid #d1d5db' : '1px dashed #e5e7eb', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: receita > maxReceita * 0.5 ? 'white' : 'var(--psh-text-primary, #111827)', cursor: data ? 'pointer' : 'default', position: 'relative', transition: 'transform 0.1s' }} title={data ? `${UF_NOMES[uf]}: ${fmtBRL(receita)} • ${data.pedidos} pedidos • ${data.pct_feminino.toFixed(0)}% feminino` : `${uf}: sem dados`} onMouseEnter={(e) => { if (data) e.currentTarget.style.transform = 'scale(1.05)' }} onMouseLeave={(e) => { if (data) e.currentTarget.style.transform = 'scale(1)' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{uf}</div>
              {data && <div style={{ fontSize: 8, opacity: 0.85 }}>{fmtBRL(receita)}</div>}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
        <span>Fraco</span>
        <div style={{ display: 'flex', gap: 0, borderRadius: 4, overflow: 'hidden' }}>
          {['var(--psh-bg-secondary, #f3f4f6)', '#fef3c7', '#fde68a', '#a7f3d0', '#6ee7b7', '#10b981'].map((c) => (
            <div key={c} style={{ width: 30, height: 12, background: c, border: '1px solid #d1d5db' }} />
          ))}
        </div>
        <span>Forte</span>
        <span style={{ marginLeft: 16 }}>Total: {fmtBRL(totals)}</span>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {ufs.slice(0, 5).map((u, i) => (
          <div key={u.uf} style={{ background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: i === 0 ? '#f59e0b' : '#3b82f6' }}>#{i + 1}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{u.uf}</div>
            <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{UF_NOMES[u.uf]}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginTop: 4 }}>{fmtBRL(u.receita)}</div>
            <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{u.pedidos} pedidos</div>
            {u.pct_feminino > 0 && <div style={{ fontSize: 9, color: '#ec4899' }}>♀ {u.pct_feminino.toFixed(0)}%</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 4px', textAlign: 'center', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '4px 4px', fontSize: 10 }
