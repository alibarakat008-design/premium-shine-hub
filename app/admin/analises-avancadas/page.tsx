'use client'

/**
 * HUB DE ANÁLISES AVANÇADAS
 * 7 abas: Calculadora Preço | Carrinho Abandonado | NPS | Fraude | Lucro Real | Conciliação | Automação
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INSIGHT_BG: any = { positivo: '#ecfdf5', atencao: '#fffbeb', info: '#eff6ff' }
const INSIGHT_BORDER: any = { positivo: '#10b981', atencao: '#f59e0b', info: '#3b82f6' }

const TABS = [
  { key: 'calculadora', label: '💰 Calc Preço', emoji: '💰' },
  { key: 'carrinho', label: '🛒 Carrinho', emoji: '🛒' },
  { key: 'nps', label: '⭐ NPS', emoji: '⭐' },
  { key: 'fraude', label: '🛡️ Fraude', emoji: '🛡️' },
  { key: 'lucro', label: '💵 Lucro Real', emoji: '💵' },
  { key: 'conciliacao', label: '🏦 Conciliação', emoji: '🏦' },
  { key: 'automacao', label: '🤖 Automação', emoji: '🤖' },
] as const

export default function HubPage() {
  const [tab, setTab] = useState<typeof TABS[number]['key']>('calculadora')

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🚀 Análises Avançadas</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12, margin: '2px 0 0 0' }}>Calculadora, NPS, fraude, lucro, conciliação + automação</p>
        </div>
        <Link href="/admin/dashboard" style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 12 }}>← Dashboard</Link>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 14px', background: tab === t.key ? '#3b82f6' : 'transparent', color: tab === t.key ? 'white' : 'var(--psh-text-primary, #374151)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'calculadora' && <CalculadoraTab />}
      {tab === 'carrinho' && <CarrinhoTab />}
      {tab === 'nps' && <NPSTab />}
      {tab === 'fraude' && <FraudeTab />}
      {tab === 'lucro' && <LucroTab />}
      {tab === 'conciliacao' && <ConciliacaoTab />}
      {tab === 'automacao' && <AutomacaoTab />}
    </div>
  )
}

// ============ CALCULADORA ============
function CalculadoraTab() {
  const [produtos, setProdutos] = useState<any[]>([])
  const [sku, setSku] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/admin/relatorios/calculadora-preco')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setProdutos(j.produtos) })
  }, [])

  useEffect(() => {
    if (!sku) { setData(null); return }
    setLoading(true)
    apiFetch('/api/admin/relatorios/calculadora-preco?sku=${sku}')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); setLoading(false) })
  }, [sku])

  return (
    <div>
      <select value={sku} onChange={(e) => setSku(e.target.value)} style={{ ...selectStyle, width: '100%', marginBottom: 12 }}>
        <option value="">Escolha um produto...</option>
        {produtos.map((p) => <option key={p.sku} value={p.sku}>{p.nome} — R$ {p.preco_atual.toFixed(2)}</option>)}
      </select>

      {loading ? <LoadingBox /> : data ? (
        <div>
          {data.insights?.map((ins: any, i: number) => (
            <InsightBox key={i} ins={ins} />
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <KpiBox label="Preço atual" value={fmtBRL2(data.produto.preco_atual)} color="#3b82f6" />
            <KpiBox label="Custo" value={fmtBRL2(data.produto.custo)} color="#9ca3af" />
            <KpiBox label="Margem atual" value={`${data.produto.margem_atual.toFixed(0)}%`} color="#10b981" />
            <KpiBox label="Elasticidade" value={Math.abs(data.elasticidade_implicita).toFixed(2)} color="#8b5cf6" />
          </div>
          {data.melhor_preco && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>🎯 PREÇO ÓTIMO: {fmtBRL2(data.melhor_preco.novo_preco)} ({data.melhor_preco.variacao_pct > 0 ? '+' : ''}{data.melhor_preco.variacao_pct}%)</div>
              <div style={{ fontSize: 11, color: '#047857' }}>Lucro projetado: {fmtBRL(data.melhor_preco.lucro_estimado)} • Margem: {data.melhor_preco.margem_pct.toFixed(0)}%</div>
            </div>
          )}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>📊 Simulação de Preço</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                  <th style={th}>Variação</th>
                  <th style={{ ...th, textAlign: 'right' }}>Novo preço</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                  <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lucro</th>
                  <th style={{ ...th, textAlign: 'center' }}>Margem</th>
                  <th style={{ ...th, textAlign: 'right' }}>Δ Lucro</th>
                </tr>
              </thead>
              <tbody>
                {data.simulacao?.map((s: any) => (
                  <tr key={s.variacao_pct} style={{ background: s.variacao_pct === data.melhor_preco?.variacao_pct ? '#ecfdf5' : 'white' }}>
                    <td style={{ ...td, fontWeight: 700, color: s.variacao_pct > 0 ? '#10b981' : s.variacao_pct < 0 ? '#ef4444' : 'var(--psh-text-secondary, #6b7280)' }}>
                      {s.variacao_pct > 0 ? '+' : ''}{s.variacao_pct}%
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRL2(s.novo_preco)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.unidades_estimadas}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(s.receita_estimada)}</td>
                    <td style={{ ...td, textAlign: 'right', color: s.lucro_estimado > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtBRL(s.lucro_estimado)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{s.margem_pct.toFixed(0)}%</td>
                    <td style={{ ...td, textAlign: 'right', color: s.diff_lucro > 0 ? '#10b981' : '#ef4444' }}>{s.diff_lucro > 0 ? '+' : ''}{fmtBRL(s.diff_lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ============ CARRINHO ABANDONADO ============
function CarrinhoTab() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { apiFetch('/api/admin/relatorios/carrinho-abandonado').then((r) => r.json()).then((j) => { if (j.ok) setData(j) }) }, [])

  if (!data) return <LoadingBox />

  return (
    <div>
      {data.insights?.map((ins: any, i: number) => <InsightBox key={i} ins={ins} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiBox label="Carrinhos" value={data.total_carrinhos} color="#3b82f6" />
        <KpiBox label="Valor total" value={fmtBRL(data.valor_total)} color="#10b981" />
        <KpiBox label="Recuperável" value={fmtBRL(data.valor_recuperavel)} color="#f59e0b" />
        <KpiBox label="Com telefone" value={data.com_telefone} color="#8b5cf6" />
      </div>
      {data.carrinhos.length === 0 ? (
        <EmptyBox msg="Nenhum carrinho abandonado no momento" />
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={{ ...th, textAlign: 'right' }}>Un</th><th style={{ ...th, textAlign: 'center' }}>Há</th><th style={th}>Ação</th></tr></thead>
              <tbody>
                {data.carrinhos.slice(0, 30).map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}><div style={{ fontWeight: 500 }}>{c.cliente_nome}</div><div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>{c.produtos.length} produtos</div></td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmtBRL2(c.total)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c.unidades}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10 }}>{c.horas_desde < 24 ? `${c.horas_desde}h` : `${Math.floor(c.horas_desde / 24)}d`}</td>
                    <td style={td}>{c.cliente_telefone && <a href={`https://wa.me/55${c.cliente_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi ${c.cliente_nome.split(' ')[0]}! Vi que você tava olhando uns produtos e não finalizou. Aproveita 10% OFF com VOLTA10!`)}`} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', background: '#25D366', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>💬 Enviar</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ NPS ============
function NPSTab() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { apiFetch('/api/admin/relatorios/nps-preditivo').then((r) => r.json()).then((j) => { if (j.ok) setData(j) }) }, [])

  if (!data) return <LoadingBox />

  return (
    <div>
      {data.insights?.map((ins: any, i: number) => <InsightBox key={i} ins={ins} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiBox label="NPS Score" value={data.nps} color={data.nps >= 50 ? '#10b981' : data.nps >= 0 ? '#f59e0b' : '#ef4444'} />
        <KpiBox label="Promotores" value={`${data.promotores} (${data.pct_promotores}%)`} color="#10b981" />
        <KpiBox label="Neutros" value={`${data.neutros} (${data.pct_neutros}%)`} color="#f59e0b" />
        <KpiBox label="Detratores" value={`${data.detratores} (${data.pct_detratores}%)`} color="#ef4444" />
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                <th style={th}>Cliente</th>
                <th style={{ ...th, textAlign: 'center' }}>Score</th>
                <th style={th}>Categoria</th>
                <th style={{ ...th, textAlign: 'right' }}>LTV</th>
                <th style={{ ...th, textAlign: 'right' }}>Pedidos</th>
                <th style={th}>Sinais</th>
              </tr>
            </thead>
            <tbody>
              {data.clientes.slice(0, 50).map((c: any) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}><div style={{ fontWeight: 500 }}>{c.nome}</div></td>
                  <td style={{ ...td, textAlign: 'center', fontSize: 16, fontWeight: 700, color: c.categoria === 'promotor' ? '#10b981' : c.categoria === 'neutro' ? '#f59e0b' : '#ef4444' }}>{c.score}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', background: c.categoria === 'promotor' ? '#10b981' : c.categoria === 'neutro' ? '#f59e0b' : '#ef4444', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{c.categoria === 'promotor' ? '🏆 Promotor' : c.categoria === 'neutro' ? '😐 Neutro' : '😞 Detrator'}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{fmtBRL(c.ltv)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.total_pedidos}</td>
                  <td style={{ ...td, fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>
                    {c.detalhes.slice(0, 2).map((d: any, i: number) => <div key={i}>{d.sinal === '+' ? '✓' : '✗'} {d.descricao}</div>)}
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

// ============ FRAUDE ============
function FraudeTab() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { apiFetch('/api/admin/relatorios/fraude?days=30').then((r) => r.json()).then((j) => { if (j.ok) setData(j) }) }, [])

  if (!data) return <LoadingBox />

  return (
    <div>
      {data.insights?.map((ins: any, i: number) => <InsightBox key={i} ins={ins} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiBox label="Total" value={data.total_alertas} color="#3b82f6" />
        <KpiBox label="🚨 Crítico" value={data.por_nivel.critico} color="#dc2626" />
        <KpiBox label="⚠️ Alto" value={data.por_nivel.alto} color="#f59e0b" />
        <KpiBox label="🟡 Médio" value={data.por_nivel.medio} color="#eab308" />
        <KpiBox label="Valor em risco" value={fmtBRL(data.valor_em_risco)} color="#ef4444" />
      </div>
      {data.alertas.length === 0 ? <EmptyBox msg="Nenhum alerta de fraude no período" /> : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}><th style={th}>Score</th><th style={th}>Nível</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={th}>Sinais</th><th style={th}>Sugestão</th></tr></thead>
              <tbody>
                {data.alertas.slice(0, 30).map((a: any) => (
                  <tr key={a.order_id} style={{ background: a.nivel === 'critico' ? '#fef2f2' : a.nivel === 'alto' ? '#fffbeb' : 'white', borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}><div style={{ fontSize: 18, fontWeight: 700, color: a.nivel === 'critico' ? '#dc2626' : a.nivel === 'alto' ? '#f59e0b' : 'var(--psh-text-secondary, #9ca3af)' }}>{a.score}</div></td>
                    <td style={td}><span style={{ padding: '2px 8px', background: a.nivel === 'critico' ? '#dc2626' : a.nivel === 'alto' ? '#f59e0b' : a.nivel === 'medio' ? '#eab308' : 'var(--psh-text-secondary, #9ca3af)', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{a.nivel}</span></td>
                    <td style={td}><div style={{ fontWeight: 500 }}>{a.cliente_nome}</div><div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>{a.cliente_email}</div></td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtBRL2(a.total)}</td>
                    <td style={{ ...td, fontSize: 9, color: 'var(--psh-text-primary, #374151)' }}>{a.sinais.slice(0, 2).map((s: any, i: number) => <div key={i}>• {s.descricao}</div>)}</td>
                    <td style={{ ...td, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{a.sugestao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ LUCRO REAL ============
function LucroTab() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { apiFetch('/api/admin/relatorios/lucro-real?meses=6').then((r) => r.json()).then((j) => { if (j.ok) setData(j) }) }, [])

  if (!data) return <LoadingBox />

  return (
    <div>
      {data.insights?.map((ins: any, i: number) => <InsightBox key={i} ins={ins} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiBox label="Receita" value={fmtBRL(data.resumo.receita_total)} color="#3b82f6" />
        <KpiBox label="Custo total" value={fmtBRL(data.resumo.custo_total)} color="#9ca3af" />
        <KpiBox label="Lucro líquido" value={fmtBRL(data.resumo.lucro_total)} color="#10b981" />
        <KpiBox label="Margem média" value={`${data.resumo.margem_media_pct}%`} color="#8b5cf6" />
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>💰 Breakdown de Custos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <CustoBox label="Custo produto" valor={data.resumo.custo_produto} total={data.resumo.custo_total} cor="#9ca3af" />
          <CustoBox label="Comissões" valor={data.resumo.comissao} total={data.resumo.custo_total} cor="#3b82f6" />
          <CustoBox label="Frete" valor={data.resumo.frete} total={data.resumo.custo_total} cor="#f59e0b" />
          <CustoBox label="Embalagem" valor={data.resumo.embalagem} total={data.resumo.custo_total} cor="#8b5cf6" />
        </div>
      </div>
      {data.top_produtos_prejuizo.length > 0 && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>📉 Top 5 Produtos com PREJUÍZO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.top_produtos_prejuizo.slice(0, 5).map((p: any) => (
              <div key={p.sku} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, background: '#fef2f2', borderRadius: 4 }}>
                <span style={{ color: 'var(--psh-text-primary, #111827)' }}>{p.nome}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmtBRL(p.lucro)} ({p.margem_pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.clientes_nao_lucrativos.length > 0 && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>🚨 Clientes que dão prejuízo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.clientes_nao_lucrativos.slice(0, 5).map((c: any) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, background: '#fffbeb', borderRadius: 4 }}>
                <span style={{ color: 'var(--psh-text-primary, #111827)' }}>{c.nome} <span style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 10 }}>({c.pedidos} pedidos)</span></span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmtBRL(c.lucro)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CustoBox({ label, valor, total, cor }: { label: string; valor: number; total: number; cor: string }) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return (
    <div style={{ background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: cor, marginTop: 2 }}>{fmtBRL(valor)}</div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{pct.toFixed(1)}% dos custos</div>
      <div style={{ height: 4, background: 'var(--psh-border, #e5e7eb)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor }} />
      </div>
    </div>
  )
}

// ============ CONCILIAÇÃO ============
function ConciliacaoTab() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { apiFetch('/api/admin/relatorios/conciliacao?dias=30').then((r) => r.json()).then((j) => { if (j.ok) setData(j) }) }, [])

  if (!data) return <LoadingBox />

  return (
    <div>
      {data.insights?.map((ins: any, i: number) => <InsightBox key={i} ins={ins} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiBox label="✓ Recebido" value={fmtBRL(data.resumo.recebido.valor)} color="#10b981" sub={`${data.resumo.recebido.count} orders`} />
        <KpiBox label="⏳ Pendente" value={fmtBRL(data.resumo.pendente.valor)} color="#3b82f6" sub={`${data.resumo.pendente.count} orders`} />
        <KpiBox label="⚠️ Divergente" value={fmtBRL(data.resumo.divergente.valor)} color="#f59e0b" sub={`${data.resumo.divergente.count} orders`} />
        <KpiBox label="🚨 Atrasado" value={fmtBRL(data.resumo.atrasado.valor)} color="#ef4444" sub={`${data.resumo.atrasado.count} orders`} />
        <KpiBox label="Taxa OK" value={`${data.resumo.taxa_recebimento}%`} color="#8b5cf6" />
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                <th style={th}>Pedido</th>
                <th style={th}>Cliente</th>
                <th style={{ ...th, textAlign: 'right' }}>Esperado</th>
                <th style={{ ...th, textAlign: 'right' }}>Recebido</th>
                <th style={{ ...th, textAlign: 'right' }}>Dif</th>
                <th style={th}>Status</th>
                <th style={th}>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {data.items.filter((i: any) => i.status_recebimento !== 'recebido').slice(0, 30).map((i: any) => (
                <tr key={i.order_id} style={{ borderBottom: '1px solid #f3f4f6', background: i.status_recebimento === 'atrasado' ? '#fef2f2' : i.status_recebimento === 'divergente' ? '#fffbeb' : 'white' }}>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{i.order_number}</td>
                  <td style={td}>{i.cliente}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtBRL2(i.valor_esperado_recebimento)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{i.valor_recebido ? fmtBRL2(i.valor_recebido) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: i.diferenca && i.diferenca < 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{i.diferenca ? fmtBRL(i.diferenca) : '—'}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, color: 'var(--psh-bg-primary, white)', background: i.status_recebimento === 'recebido' ? '#10b981' : i.status_recebimento === 'pendente' ? '#3b82f6' : i.status_recebimento === 'divergente' ? '#f59e0b' : '#ef4444' }}>{i.status_recebimento.toUpperCase()}</span>
                  </td>
                  <td style={{ ...td, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{i.alerta || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============ AUTOMAÇÃO ============
function AutomacaoTab() {
  const [regras, setRegras] = useState<any[]>([])
  const [novaRegra, setNovaRegra] = useState({ nome: '', gatilho: 'cliente_sumido', acao: 'whatsapp', template: 'Oi {nome}, sentimos sua falta! Use o cupom VOLTAI20 e ganhe 20% OFF!', cupom_pct: 20, segmento: 'risco' })
  const [salvando, setSalvando] = useState(false)

  const fetchRegras = useCallback(async () => {
    const r = await apiFetch('/api/admin/automacao-marketing')
    const j = await r.json()
    if (j.ok) setRegras(j.regras || [])
  }, [])

  useEffect(() => { fetchRegras() }, [fetchRegras])

  const criarRegra = async () => {
    if (!novaRegra.nome) { alert('Digite um nome'); return }
    setSalvando(true)
    try {
      const r = await apiFetch('/api/admin/automacao-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(novaRegra),
      })
      const j = await r.json()
      if (j.ok) { fetchRegras(); setNovaRegra({ ...novaRegra, nome: '' }); alert('Regra criada!') }
      else alert('Erro: ' + j.error)
    } finally { setSalvando(false) }
  }
  return (
    <div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>➕ Nova Regra de Automação</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <input value={novaRegra.nome} onChange={(e) => setNovaRegra({ ...novaRegra, nome: e.target.value })} placeholder="Nome da regra (ex: Reativar sumidos há 30d)" style={inputStyle} />
          <select value={novaRegra.gatilho} onChange={(e) => setNovaRegra({ ...novaRegra, gatilho: e.target.value })} style={inputStyle}>
            <option value="cliente_sumido">🕐 Cliente sumido (X dias sem comprar)</option>
            <option value="carrinho_abandonado">🛒 Carrinho abandonado</option>
            <option value="aniversario">🎂 Aniversário</option>
            <option value="alta_compra">💎 Compra alta (R$X+)</option>
            <option value="recompra_prevista">🔮 Recompra prevista próxima</option>
            <option value="nps_detrator">😞 NPS detrator</option>
          </select>
          <select value={novaRegra.acao} onChange={(e) => setNovaRegra({ ...novaRegra, acao: e.target.value })} style={inputStyle}>
            <option value="whatsapp">💬 WhatsApp</option>
            <option value="email">📧 Email</option>
            <option value="cupom">🎁 Gerar cupom</option>
            <option value="tag">🏷️ Tag no customer</option>
          </select>
          <input type="number" value={novaRegra.cupom_pct} onChange={(e) => setNovaRegra({ ...novaRegra, cupom_pct: Number(e.target.value) })} placeholder="% cupom" style={inputStyle} />
        </div>
        <textarea value={novaRegra.template} onChange={(e) => setNovaRegra({ ...novaRegra, template: e.target.value })} placeholder="Template da mensagem (use {nome}, {cupom}, etc)" style={{ ...inputStyle, marginTop: 8, minHeight: 60 }} />
        <button onClick={criarRegra} disabled={salvando} style={{ marginTop: 8, padding: '8px 16px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: salvando ? 'not-allowed' : 'pointer' }}>{salvando ? 'Salvando...' : '💾 Criar Regra'}</button>
      </div>
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 12 }}>📋 Regras Ativas ({regras.length})</div>
        {regras.length === 0 ? <EmptyBox msg="Nenhuma regra criada ainda" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {regras.map((r: any) => (
              <div key={r.id} style={{ padding: 10, background: 'var(--psh-bg-secondary, #fafbfc)', border: '1px solid #e5e7eb', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--psh-text-primary, #111827)', flex: 1 }}>{r.nome}</div>
                <span style={{ padding: '2px 8px', background: '#dbeafe', color: '#1e40af', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{r.gatilho}</span>
                <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#065f46', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{r.acao}</span>
                <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>Cupom: {r.cupom_pct}%</span>
                <span style={{ fontSize: 10, color: r.ativo ? '#10b981' : 'var(--psh-text-secondary, #9ca3af)', fontWeight: 600 }}>{r.ativo ? '✓ Ativa' : '○ Pausada'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
// ============ UI Components ============
function InsightBox({ ins }: { ins: any }) {
  return (
    <div style={{ background: INSIGHT_BG[ins.tipo], borderLeft: `4px solid ${INSIGHT_BORDER[ins.tipo]}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{ins.emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{ins.titulo}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #4b5563)', marginTop: 4, lineHeight: 1.4 }}>{ins.detalhe}</div>
    </div>
  )
}
function KpiBox({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{sub}</div>}
    </div>
  )
}
function LoadingBox() { return <div style={{ padding: 30, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div> }
function EmptyBox({ msg }: { msg: string }) { return <div style={{ padding: 30, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>{msg}</div> }
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)' }
const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' }
