'use client'

/**
 * DASHBOARD BIG NUMBERS
 * Mostra KPIs REAIS (CMV, comissão, frete, lucro)
 * - Tudo via /api/admin/dashboard-leve (cálculos reais)
 *
 * Redesenhado em 2026-09-01 (inspirado em referência visual externa):
 * - Barra de composição da receita
 * - Cards de Deduções (Custos, Tarifas, Impostos, Frete, Canceladas, Ads)
 * - Bloco Próximas ações / Radar de estoque (crítico + parados)
 * O card de "Reputação" ficou de fora por enquanto — o sistema ainda não
 * puxa reputação/reclamações reais do Mercado Livre, só um número calculado
 * (não é dado real), então preferimos não mostrar até integrar de verdade.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Resumo {
  receita_30d: number
  vendas_30d: number
  ticket_medio: number
  cmv_30d: number
  cmv_pct: number
  cmv_real: number
  cmv_estimado: number
  receita_com_custo_real: number
  receita_sem_custo: number
  cmv_pct_conhecido: number
  comissao_30d: number
  comissao_pct_conhecido: number
  receita_sem_comissao: number
  frete_30d: number
  custo_flex_30d: number
  total_deducoes: number
  lucro_30d: number
  margem_pct: number
  cancelamentos_30d: number
  impostos_30d: number
  custos_fixos_30d: number
  custos_variaveis_30d: number
  ads_30d: number
  lucro_real_30d: number
  margem_real_pct: number
}

interface TopProduto {
  id: string; sku: string; nome: string; foto_principal_url: string | null
  qtd: number; receita: number; custo: number; lucro: number; margem_pct: number
}

interface EstoqueCriticoItem { product_id: string; sku: string; nome: string; foto: string | null; quantidade_atual: number }
interface ProdutoParado { product_id: string; sku: string; nome: string; foto: string | null; dias_parado: number; vendas_total: number }
interface AcaoItem { tipo: string; titulo: string; subtitulo: string; severidade: 'critica' | 'alerta'; link: string }

interface Periodo { dias: number; from: string; to: string }

interface Data {
  periodo: Periodo
  anuncios_ativos: number
  skus_ativos: number
  resumo: Resumo
  meses_6: { key: string; mes: string; ano: number; receita: number; vendas: number }[]
  top_produtos: TopProduto[]
  estoque_critico: { count: number; items: EstoqueCriticoItem[] }
  produtos_parados: { count: number; items: ProdutoParado[] }
  proximas_acoes: AcaoItem[]
}

function fmt(v: any): string {
  const n = Number(v || 0)
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtBRL(v: any): string {
  const n = Number(v || 0)
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [periodoSel, setPeriodoSel] = useState<'1' | '7' | '15' | '30' | 'custom'>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Auth via /api/auth/me (substitui useSession removido)
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok || !j.user) {
          router.push('/login-parceiro')
          return
        }
        setAuthChecked(true)
      })
      .catch(() => router.push('/login-parceiro'))
  }, [router])

  // carregar recebe os parâmetros diretamente — sem closure stale
  const carregar = useCallback(async (dias: string, from: string, to: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (dias === 'custom') {
        if (from) params.set('from', from)
        if (to) params.set('to', to)
      } else {
        params.set('dias', dias)
      }
      const qs = params.toString()
      const r = await apiFetch(`/api/admin/dashboard-leve${qs ? `?${qs}` : ''}`, { credentials: 'include' })
      const j = await r.json()
      if (j?.success) {
        setData(j.data)
        setLastUpdate(new Date())
      } else {
        setError(j?.error || 'Erro ao carregar')
      }
    } catch (err: any) {
      setError(err?.message || 'Erro')
    }
    setLoading(false)
  }, [])  // sem dependências — recebe tudo por parâmetro

  useEffect(() => {
    if (!authChecked) return
    if (periodoSel === 'custom' && (!customFrom || !customTo)) return
    carregar(periodoSel, customFrom, customTo)
  }, [authChecked, periodoSel, customFrom, customTo, carregar])

  // Auto-refresh a cada 60s
  useEffect(() => {
    if (!authChecked) return
    // Passa os valores atuais para o interval (lê ref diretamente)
    const t = setInterval(() => carregar(periodoSel, customFrom, customTo), 60000)
    return () => clearInterval(t)
  }, [authChecked, carregar, periodoSel, customFrom, customTo])

  // Só mostra a tela de carregando no primeiro load — no auto-refresh de 60s
  // (mais embaixo) os dados antigos continuam na tela até os novos chegarem.
  if (!authChecked || (loading && !data)) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', color: 'var(--psh-text-secondary, #6b7280)' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>📊 Dashboard</h1>
        <div style={{ marginTop: 16, padding: 16, background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em' }}>
          ⏳ Carregando dados...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)' }}>📊 Dashboard</h1>
        <div style={{ marginTop: 16, padding: 16, background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 10, color: '#991b1b', fontSize: '0.85em' }}>
          ❌ Erro: {error}
        </div>
        <button onClick={() => carregar(periodoSel, customFrom, customTo)} style={{ marginTop: 12, padding: '10px 20px', background: '#7c3aed', color: 'var(--psh-bg-primary, #fff)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          🔄 Recarregar
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)' }}>📊 Dashboard</h1>
        <div style={{ marginTop: 16, padding: 16, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, color: '#92400e', fontSize: '0.85em' }}>
          ⚠️ Sem dados
        </div>
      </div>
    )
  }

  const r = data.resumo
  const maxReceita = Math.max(...data.meses_6.map(m => m.receita), 1)
  const maxVendas = Math.max(...data.meses_6.map(m => m.vendas), 1)

  // Segmentos da barra de composição (% da receita) — só entra o que tem valor
  const segmentos = [
    { label: 'CMV', valor: r.cmv_30d, cor: '#dc2626' },
    { label: 'Comissões', valor: r.comissao_30d, cor: '#f59e0b' },
    { label: 'Impostos', valor: r.impostos_30d, cor: '#a855f7' },
    { label: 'Frete', valor: r.frete_30d, cor: '#8b5cf6' },
    { label: 'Ads', valor: r.ads_30d, cor: '#06b6d4' },
    { label: 'Custo FLEX', valor: r.custo_flex_30d, cor: '#0ea5e9' },
    { label: 'Custos fixos/var.', valor: r.custos_fixos_30d + r.custos_variaveis_30d, cor: '#f97316' },
  ].filter(s => s.valor > 0)
  const lucroPositivo = r.lucro_real_30d > 0

  const periodoLabel = (() => {
    const d = data.periodo?.dias
    if (d === 1) return 'Hoje'
    if (d === 7) return 'Últimos 7 dias'
    if (d === 15) return 'Últimos 15 dias'
    if (d === 30) return 'Últimos 30 dias'
    if (data.periodo?.from && data.periodo?.to) {
      const f = new Date(data.periodo.from).toLocaleDateString('pt-BR')
      const t = new Date(data.periodo.to).toLocaleDateString('pt-BR')
      return `${f} a ${t}`
    }
    return 'Últimos 30 dias'
  })()

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', color: 'var(--psh-text-primary, #1f2937)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>📊 Dashboard</h1>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em', marginTop: 2 }}>
            Resumo de {periodoLabel.toLowerCase()} + histórico de 6 meses
            {lastUpdate && <span style={{ marginLeft: 8, opacity: 0.7 }}>· atualizado {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 12px', background: 'var(--psh-bg-secondary, #f3f4f6)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 999, fontSize: '0.8em', color: 'var(--psh-text-primary, #374151)' }}>
            📦 <strong>{data.anuncios_ativos}</strong> anúncios ativos
          </span>
          <span style={{ padding: '6px 12px', background: 'var(--psh-bg-secondary, #f3f4f6)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 999, fontSize: '0.8em', color: 'var(--psh-text-primary, #374151)' }}>
            🏷️ <strong>{data.skus_ativos}</strong> SKUs ativos
          </span>
          <button
            onClick={() => carregar(periodoSel, customFrom, customTo)}
            style={{ padding: '8px 14px', background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', color: 'var(--psh-text-primary, #374151)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500 }}
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Filtro de período */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {([['1', 'Hoje'], ['7', '7d'], ['15', '15d'], ['30', '30d']] as [typeof periodoSel, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setPeriodoSel(val)}
            style={{
              padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: '0.8em', fontWeight: 600,
              border: periodoSel === val ? '1px solid #7c3aed' : '1px solid var(--psh-border, #e5e7eb)',
              background: periodoSel === val ? '#7c3aed' : 'var(--psh-bg-primary, #fff)',
              color: periodoSel === val ? '#fff' : 'var(--psh-text-primary, #374151)',
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPeriodoSel('custom')}
          style={{
            padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: '0.8em', fontWeight: 600,
            border: periodoSel === 'custom' ? '1px solid #7c3aed' : '1px solid var(--psh-border, #e5e7eb)',
            background: periodoSel === 'custom' ? '#7c3aed' : 'var(--psh-bg-primary, #fff)',
            color: periodoSel === 'custom' ? '#fff' : 'var(--psh-text-primary, #374151)',
          }}
        >
          📅 Personalizado
        </button>
        {periodoSel === 'custom' && (
          <>
            <input
              type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--psh-border, #e5e7eb)', background: 'var(--psh-bg-primary, #fff)', color: 'var(--psh-text-primary, #374151)', fontSize: '0.8em' }}
            />
            <span style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.8em' }}>até</span>
            <input
              type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--psh-border, #e5e7eb)', background: 'var(--psh-bg-primary, #fff)', color: 'var(--psh-text-primary, #374151)', fontSize: '0.8em' }}
            />
          </>
        )}
      </div>

      {/* KPIs principais (4 cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card label="💰 Receita" value={fmt(r.receita_30d)} sub={`${r.vendas_30d} vendas — ${periodoLabel}`} cor="#10b981" />
        <Card label="🎯 Ticket Médio" value={fmt(r.ticket_medio)} sub={periodoLabel} cor="#7c3aed" />
        <Card label="💵 Lucro Real" value={fmt(r.lucro_real_30d)} sub={`${r.margem_real_pct.toFixed(1)}% margem (após impostos e custos operacionais)`} cor={r.margem_real_pct >= 30 ? '#10b981' : r.margem_real_pct >= 15 ? '#f59e0b' : '#ef4444'} />
        <Card label="❌ Cancelamentos" value={String(r.cancelamentos_30d)} sub={periodoLabel} cor="#ef4444" />
      </div>

      {/* Barra de composição da receita */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>📈 Composição da Receita ({periodoLabel})</h2>
        <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--psh-border, #e5e7eb)' }}>
          {segmentos.map(s => (
            <div
              key={s.label}
              title={`${s.label}: ${fmtBRL(s.valor)}`}
              style={{ width: `${r.receita_30d > 0 ? Math.min((s.valor / r.receita_30d) * 100, 100) : 0}%`, background: s.cor, minWidth: s.valor > 0 ? 2 : 0 }}
            />
          ))}
          <div
            title={`Lucro real: ${fmtBRL(r.lucro_real_30d)}`}
            style={{ flex: 1, background: lucroPositivo ? '#10b981' : '#1f2937' }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10, fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
          {segmentos.map(s => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.cor, display: 'inline-block' }} />
              {s.label} {fmt(s.valor)}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: lucroPositivo ? '#10b981' : '#ef4444' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: lucroPositivo ? '#10b981' : '#1f2937', display: 'inline-block' }} />
            Lucro real {fmt(r.lucro_real_30d)}
          </span>
        </div>
      </div>

      {/* Deduções */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>💸 Deduções ({periodoLabel})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <CustoBar label="Custos (CMV)" valor={r.cmv_30d} pct={r.receita_30d > 0 ? (r.cmv_30d / r.receita_30d) * 100 : 0} cor="#dc2626" />
          <CustoBar label="Tarifas ML" valor={r.comissao_30d} pct={r.receita_30d > 0 ? (r.comissao_30d / r.receita_30d) * 100 : 0} cor="#f59e0b" />
          <CustoBar label="Impostos" valor={r.impostos_30d} pct={r.receita_30d > 0 ? (r.impostos_30d / r.receita_30d) * 100 : 0} cor="#a855f7" />
          <CustoBar label="Frete" valor={r.frete_30d} pct={r.receita_30d > 0 ? (r.frete_30d / r.receita_30d) * 100 : 0} cor="#8b5cf6" />
          <CustoBar label="Canceladas" valor={r.cancelamentos_30d} pct={0} cor="#ef4444" unidades />
          <CustoBar label="Ads" valor={r.ads_30d} pct={r.receita_30d > 0 ? (r.ads_30d / r.receita_30d) * 100 : 0} cor="#06b6d4" />
        </div>
        {r.ads_30d === 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--psh-text-secondary, #9ca3af)' }}>
            💡 Ads em R$ 0 pode ser porque o sync do Mercado Ads (/admin ⇢ ferramenta de Ads) não rodou no período selecionado.
          </div>
        )}
        {r.receita_sem_custo > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, padding: '8px 10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, color: '#92400e' }}>
            ⚠️ CMV e comissão parcialmente estimados: sync ML não linkou items/custos em {r.receita_sem_custo > 0 ? ((r.receita_sem_custo / r.receita_30d) * 100).toFixed(0) : 0}% da receita. CMV estimado: R$ {fmt(r.cmv_estimado)} de R$ {fmt(r.cmv_30d)}.
            {' '}Comissão estimada: {r.receita_sem_custo > 0 ? r.comissao_pct_conhecido : 0}% sobre R$ {fmt(r.receita_sem_custo || 0)}.
          </div>
        )}
      </div>

      {/* Histórico 6 meses */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>📅 Faturamento e Vendas — Últimos 12 meses</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--psh-border, #e5e7eb)' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Mês</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Faturamento</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600, width: '40%' }}>Visual</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Pedidos</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600, width: '40%' }}>Visual</th>
            </tr>
          </thead>
          <tbody>
            {data.meses_6.map(m => (
              <tr key={m.key} style={{ borderBottom: '1px solid var(--psh-border, #f3f4f6)' }}>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <strong style={{ color: 'var(--psh-text-primary, #1f2937)' }}>{m.mes}/{String(m.ano).slice(2)}</strong>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em', textAlign: 'right' }}>
                  <span style={{ color: m.receita > 0 ? '#10b981' : 'var(--psh-text-secondary, #9ca3af)', fontWeight: 600 }}>{fmt(m.receita)}</span>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <div style={{ height: 8, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.receita / maxReceita) * 100}%`, height: '100%', background: m.receita > 0 ? '#10b981' : 'var(--psh-border, #e5e7eb)' }} />
                  </div>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em', textAlign: 'right' }}>
                  <span style={{ color: m.vendas > 0 ? '#3b82f6' : 'var(--psh-text-secondary, #9ca3af)', fontWeight: 600 }}>{m.vendas}</span>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <div style={{ height: 8, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.vendas / maxVendas) * 100}%`, height: '100%', background: m.vendas > 0 ? '#3b82f6' : 'var(--psh-border, #e5e7eb)' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Próximas ações + Radar de estoque (crítico + parados) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>✅ Próximas Ações</h2>
          {data.proximas_acoes.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.85em' }}>Tudo certo por aqui 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.proximas_acoes.map((a, i) => (
                <a key={i} href={a.link} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ fontSize: '1em' }}>{a.severidade === 'critica' ? '🔴' : '🟡'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85em', fontWeight: 500, color: 'var(--psh-text-primary, #1f2937)' }}>{a.titulo}</div>
                    <div style={{ fontSize: '0.7em', color: 'var(--psh-text-secondary, #9ca3af)' }}>{a.subtitulo}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>📦 Estoque Crítico ({data.estoque_critico.count})</h2>
          {data.estoque_critico.items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.85em' }}>Nenhum produto crítico 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.estoque_critico.items.map(p => (
                <a key={p.product_id} href={`/admin/produtos/${p.product_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6, textDecoration: 'none', color: 'inherit' }}>
                  {p.foto ? <img src={p.foto} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} alt="" /> : <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8em', fontWeight: 500, color: 'var(--psh-text-primary, #1f2937)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                    <div style={{ fontSize: '0.7em', color: 'var(--psh-text-secondary, #9ca3af)' }}>{p.sku}</div>
                  </div>
                  <div style={{ fontSize: '0.8em', fontWeight: 700, color: p.quantidade_atual === 0 ? '#ef4444' : '#f59e0b' }}>{p.quantidade_atual} un.</div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>😴 Inatividade ({data.produtos_parados.count})</h2>
          {data.produtos_parados.items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.85em' }}>Nenhum produto parado 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.produtos_parados.items.map(p => (
                <a key={p.product_id} href={`/admin/produtos/${p.product_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6, textDecoration: 'none', color: 'inherit' }}>
                  {p.foto ? <img src={p.foto} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} alt="" /> : <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8em', fontWeight: 500, color: 'var(--psh-text-primary, #1f2937)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                    <div style={{ fontSize: '0.7em', color: 'var(--psh-text-secondary, #9ca3af)' }}>{p.sku}</div>
                  </div>
                  <div style={{ fontSize: '0.75em', fontWeight: 600, color: '#f59e0b' }}>{p.dias_parado}d parado</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top 5 produtos (com margem REAL) */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>🏆 Top 5 Produtos ({periodoLabel})</h2>
        {data.top_produtos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Sem vendas no período</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.top_produtos.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 4, background: i < 3 ? ['#f59e0b', 'var(--psh-text-secondary, #9ca3af)', '#cd7f32'][i] : 'var(--psh-border, #e5e7eb)', color: i < 3 ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary, #6b7280)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8em' }}>
                  {i + 1}
                </div>
                {p.foto_principal_url ? <img src={p.foto_principal_url} style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }} alt="" /> : <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.85em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.7em' }}>{p.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#7c3aed', fontWeight: 600, fontSize: '0.9em' }}>{p.qtd} un.</div>
                  <div style={{ color: '#10b981', fontSize: '0.75em' }}>{fmt(p.receita)}</div>
                  <div style={{ color: p.margem_pct >= 30 ? '#10b981' : p.margem_pct >= 15 ? '#f59e0b' : '#ef4444', fontSize: '0.7em', fontWeight: 600 }}>
                    {p.margem_pct.toFixed(0)}% margem
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, sub, cor }: { label: string; value: string; sub: string; cor: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 10, padding: 14 }}>
      <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color: cor, fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
      <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.7em', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function CustoBar({ label, valor, pct, cor, unidades }: { label: string; valor: number; pct: number; cor: string; unidades?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: cor }}>{unidades ? `${valor} pedido(s)` : fmtBRL(valor)}</div>
      {!unidades && <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{pct.toFixed(1)}% da receita</div>}
      {!unidades && (
        <div style={{ height: 4, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 2, marginTop: 4 }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: cor, borderRadius: 2 }} />
        </div>
      )}
    </div>
  )
}
