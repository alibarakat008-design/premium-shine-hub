'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Venda = {
  id: string
  order_number: string
  pack_id?: string | null
  created_at: string | null
  status: string
  plataforma: string
  conta: string
  produto: string
  sku: string
  quantidade: number
  venda: number
  comissao: number
  taxa_comissao_pct: number
  frete: number
  custo_flex?: number
  excluir_do_calculo?: boolean
  etiqueta_impressa_em?: string | null
  embalado_em?: string | null
  etapa_fulfillment?: 'pendente' | 'impresso' | 'embalado' | 'enviado' | 'entregue' | 'cancelado'
  // Decomposição detalhada da comissão ML (igual painel do ML)
  tarifa_pct_valor?: number
  tarifa_fixa_valor?: number
  tarifa_bruta_ml?: number
  bonus_cupom?: number
  bonus_envio?: number
  bonus_envio_estimado?: number
  total_estornos?: number
  total_paid_amount?: number | null
  bonus?: number
  ml_paga?: number // = venda - tarifa_bruta + estornos
  recebimento: number
  custo: number
  margem_reais: number
  margem_pct: number
  isFull: boolean
  isFlex?: boolean
  tipo_envio?: string | null
}

type Resumo = {
  venda: number
  comissao: number
  tarifa_pct?: number
  tarifa_fixa?: number
  bonus_envio?: number
  bonus_cupom?: number
  frete?: number
  recebimento: number
  custo: number
  custo_flex?: number
  margem_reais: number
  margem_pct: number
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtPct = (v: number) => `${v.toFixed(1)}%`

const fmtTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const tempoRelativo = (iso: string | null) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

const STATUS_COLOR: Record<string, string> = {
  confirmado: '#3b82f6',
  separado: '#8b5cf6',
  enviado: '#f59e0b',
  entregue: '#10b981',
  cancelado: '#ef4444',
  pendente: 'var(--psh-text-tertiary)',
}

const PLATAFORMA_COLOR: Record<string, string> = {
  mercado_livre: '#FFE600',
  shopee: '#EE4D2D',
  site: '#ec4899',
}

export default function VendasAoVivoPage() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [apiMeta, setApiMeta] = useState<{ total_validas: number; total_excluidas: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [fullOnly, setFullOnly] = useState(false)
  const [flexOnly, setFlexOnly] = useState(false)
  const [mlOnly, setMlOnly] = useState(false)
  // null = TODOS marketplaces (ML + Shopee + site + B2B etc), 'ml' = só Mercado Livre
  const [plataformaOnly, setPlataformaOnly] = useState<'todos' | 'ml' | 'shopee'>('todos')
  const prevIdsRef = useRef<Set<string>>(new Set())
  const isFirstLoadRef = useRef(true)
const [refreshing, setRefreshing] = useState(false)
  const [segundosAtras, setSegundosAtras] = useState(0)
  const [ultimaContagem, setUltimaContagem] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // Período: 'hoje' (24h) | '7d' (168h) | '30d' (720h)
  const [periodo, setPeriodo] = useState<'hoje' | '7d' | '30d' | 'todos'>('hoje')
  const [currentCompanyId, setCurrentCompanyId] = useState<string | undefined>(undefined)

  // Marca etapa de fulfillment (etiqueta impressa / embalado) e recarrega lista
  const marcarEtapa = async (orderId: string, etapa: 'imprimir' | 'embalar' | 'desfazer') => {
    try {
      const res = await apiFetch('/api/admin/orders/set-fulfillment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, etapa }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSyncMsg(data.message || '✅ Atualizado')
      setTimeout(() => setSyncMsg(null), 4000)
      await fetchVendas()
    } catch (e: any) {
      setSyncMsg(`❌ ${e.message}`)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  // Marca a venda como "pega por" um parceiro (proxy de "comprou de mim")
  const [parceiros, setParceiros] = useState<{ id: string, nome_fantasia: string }[]>([])
  useEffect(() => {
    fetch('/api/admin/company-active', { credentials: 'include' })
      .then(r => r.json())
      .then(async (j) => {
        if (!j.company_id) return
        const r = await fetch(`/api/admin/fornecedor/vendas-a-parceiros?days=1&seller_company_id=${j.company_id}`, { credentials: 'include' })
        const d = await r.json()
        if (d?.parceiros_cadastrados) setParceiros(d.parceiros_cadastrados.map((p: any) => ({ id: p.id, nome_fantasia: p.nome_fantasia })))
      })
      .catch(() => {})
  }, [])

  const marcarQuemPegou = async (orderId: string, orderNumber: string) => {
    if (parceiros.length === 0) {
      alert('Nenhum parceiro cadastrado. Cadastre primeiro.')
      return
    }
    const lista = parceiros.map((p, i) => `${i + 1}. ${p.nome_fantasia}`).join('\n')
    const escolha = prompt(
      `QUEM PEGOU a etiqueta #${orderNumber}?\n\n${lista}\n\nDigite o número (ou cancele):`
    )
    if (!escolha) return
    const idx = parseInt(escolha) - 1
    if (isNaN(idx) || idx < 0 || idx >= parceiros.length) {
      alert('Número inválido')
      return
    }
    const partner = parceiros[idx]
    try {
      setSyncMsg('Marcando parceiro...')
      const res = await apiFetch('/api/admin/orders/marcar-parceiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, partner_company_id: partner.id }),
      })
      const data = await res.json()
      if (data.ok) {
        setSyncMsg(`✅ Marcado: ${partner.nome_fantasia} pegou #${orderNumber}`)
        setTimeout(() => setSyncMsg(null), 3000)
        await fetchVendas()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    }
  }

  // Baixa a etiqueta PDF do Mercado Envios e abre em nova aba.
  // Marca automaticamente como impressa após o download.
  const imprimirEtiqueta = async (orderId: string, orderNumber: string) => {
    try {
      setSyncMsg('🖨️ Gerando etiqueta...')
      const res = await apiFetch('/api/admin/orders/imprimir-etiqueta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/pdf')) {
        // Recebeu PDF direto do ML
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
        setSyncMsg(`✅ Etiqueta PDF #${orderNumber} aberta`)
        setTimeout(() => setSyncMsg(null), 4000)
        await fetchVendas()
      } else {
        // Recebeu JSON — pode ser download_url OU html_url (fallback)
        const data = await res.json()
        if (data.download_url) {
          window.open(data.download_url, '_blank')
          setSyncMsg(`✅ Etiqueta #${orderNumber} aberta`)
        } else if (data.html_url || data.open_url) {
          window.open(data.html_url || data.open_url, '_blank')
          setSyncMsg(`✅ Etiqueta #${orderNumber} gerada (formato ML)`)
        } else if (data.ok) {
          window.open(`/api/admin/etiquetas/html?ids=${orderId}`, '_blank')
          setSyncMsg(`✅ Etiqueta #${orderNumber} aberta`)
        } else {
          throw new Error(data.error || 'Resposta inesperada')
        }
        setTimeout(() => setSyncMsg(null), 4000)
        await fetchVendas()
      }
    } catch (e: any) {
      setSyncMsg(`❌ ${e.message}`)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  const fetchVendas = async () => {
    try {
      setRefreshing(true)
      const hoursMap = { hoje: 24, '7d': 168, '30d': 720, todos: 8760 } as const
      const hours = hoursMap[periodo as keyof typeof hoursMap] || 168
      // Limites maiores — o resumo é agregado separado, então o limit só afeta a lista visível
      const limitMap = { hoje: 500, '7d': 2000, '30d': 5000, todos: 10000 } as const
      const limit = limitMap[periodo as keyof typeof limitMap] || 2000
      // Quando periodo='hoje', usa janela BRT (00:00 BRT - agora) que bate com o painel ML
      const dayParam = periodo === 'hoje' ? '&day=today' : ''
      // Força filtro pela company do user logado (não deixa o cookie "vazar" outra empresa)
      const companyParam = currentCompanyId ? `&company_id=${currentCompanyId}` : ''
      const res = await apiFetch(`/api/admin/vendas-recentes?limit=${limit}&hours=${hours}&origem=${plataformaOnly}${dayParam}${companyParam}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erro desconhecido')

      // Detecta novas vendas (vindos depois do first load)
      const newIds = new Set<string>(data.vendas.map((v: Venda) => v.id))
      if (!isFirstLoadRef.current) {
        const newOnes: Venda[] = data.vendas.filter(
          (v: Venda) => !prevIdsRef.current.has(v.id)
        )
        if (newOnes.length > 0) {
          // toca som de notificação
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const o = ctx.createOscillator()
            const g = ctx.createGain()
            o.connect(g)
            g.connect(ctx.destination)
            o.frequency.value = 880
            g.gain.setValueAtTime(0.1, ctx.currentTime)
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
            o.start()
            o.stop(ctx.currentTime + 0.4)
          } catch {}
        }
      }
      prevIdsRef.current = newIds
      isFirstLoadRef.current = false

      setUltimaContagem(data.vendas?.length || 0)
      setVendas(data.vendas)
      setResumo(data.resumo)
      setApiMeta({ total_validas: data.total_validas || 0, total_excluidas: data.total_excluidas || 0 })
      setLastUpdate(new Date())
      setSegundosAtras(0)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const syncML = async () => {
    if (syncing) return
    setSyncing(true)
    setSyncMsg('🔄 Sincronizando com Mercado Livre (janela 24h)...')
    try {
      const t0 = Date.now()
      // Pega a company_id do /api/auth/me (validado pelo token de login)
      // Se o state já tiver currentCompanyId (carregado no mount), usa ele pra evitar race
      let companyId = currentCompanyId
      if (!companyId) {
        try {
          const meRes = await apiFetch('/api/auth/me', { cache: 'no-store' })
          const me = await meRes.json()
          companyId = me?.company?.id
          if (companyId) setCurrentCompanyId(companyId)
        } catch {}
      }
      if (!companyId) {
        setSyncMsg('❌ Não foi possível identificar sua empresa. Faça login novamente.')
        return
      }
      const res = await apiFetch('/api/admin/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 24, company_id: companyId }),
      })
      const data = await res.json()
      const duracao = ((Date.now() - t0) / 1000).toFixed(1)
      if (data.ok) {
        const msgs = []
        if (data.created > 0) msgs.push(`✅ ${data.created} NOVAS vendas criadas`)
        if (data.new > 0 && data.created === 0) msgs.push(`⚠️ ${data.new} novas detectadas mas 0 criadas (rate limit?)`)
        if (data.new === 0) msgs.push(`✅ Tudo atualizado! Nenhuma venda nova`)
        msgs.push(`(${duracao}s, buscadas: ${data.fetched})`)
        setSyncMsg(msgs.join(' '))
        // Recarrega lista de vendas depois do sync
        await fetchVendas()
        setLastUpdate(new Date())
        setTimeout(() => setSyncMsg(null), 8000)
      } else {
        setSyncMsg(`❌ Erro: ${data.error?.slice(0, 100) || 'desconhecido'}`)
        setTimeout(() => setSyncMsg(null), 8000)
      }
    } catch (err: any) {
      setSyncMsg(`❌ Falha: ${err.message?.slice(0, 100)}`)
      setTimeout(() => setSyncMsg(null), 8000)
    } finally {
      setSyncing(false)
    }
  }

  // Cronômetro "Atualizado há Xs"
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdate) {
        setSegundosAtras(Math.floor((Date.now() - lastUpdate.getTime()) / 1000))
      }
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdate])

  useEffect(() => {
    // Pega a company do user logado pra forçar o filtro mesmo se o cookie tiver trocado
    apiFetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(me => {
        if (me?.company?.id) setCurrentCompanyId(me.company.id)
      })
      .catch(() => {})
    fetchVendas()
    if (!autoRefresh) return
    // Auto-refresh de vendas a cada 15s
    const intervalVendas = setInterval(fetchVendas, 15000)
    // Auto-sync ML a cada 60s (enquanto a aba tá aberta)
    const intervalSync = setInterval(() => {
      if (!syncing) syncML()
    }, 60000)
    // Sync imediato ao entrar na página (após 3s pra deixar carregar)
    const timeoutSync = setTimeout(() => { if (!syncing) syncML() }, 3000)
    return () => {
      clearInterval(intervalVendas)
      clearInterval(intervalSync)
      clearTimeout(timeoutSync)
    }
  }, [autoRefresh, plataformaOnly, periodo])

  const filtered = vendas.filter((v) => {
    if (statusFilter !== 'todos' && v.status !== statusFilter) return false
    if (fullOnly && !v.isFull) return false
    if (flexOnly && !v.isFlex) return false
    if (mlOnly && (v.isFull || v.isFlex)) return false // ML = NÃO full e NÃO flex (agência, cross, clássico)
    if (plataformaOnly === 'ml' && v.plataforma !== 'mercado_livre') return false
    if (plataformaOnly === 'shopee' && v.plataforma !== 'shopee') return false
    if (filter) {
      const f = filter.toLowerCase()
      return (
        v.produto.toLowerCase().includes(f) ||
        v.sku.toLowerCase().includes(f) ||
        v.order_number.includes(f) ||
        v.conta.toLowerCase().includes(f)
      )
    }
    return true
  })

  const statusList = ['todos', 'confirmado', 'separado', 'enviado', 'entregue', 'cancelado']

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--psh-text-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
            🔴 Vendas ao Vivo
            {apiMeta && (
              <span style={{
                fontSize: 14, fontWeight: 600, color: 'var(--psh-text-secondary)',
                background: 'var(--psh-bg-secondary)', padding: '4px 12px', borderRadius: 8,
                border: '1px solid var(--psh-border)',
              }}>
                {apiMeta.total_validas ?? vendas.length} {periodo === 'hoje' ? 'vendas hoje' : periodo === '7d' ? 'vendas (7d)' : periodo === '30d' ? 'vendas (30d)' : 'vendas (todos)'}
              </span>
            )}
          </h1>
<div style={{ color: 'var(--psh-text-tertiary)', fontSize: 13, margin: '6px 0 0 0', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>
              📡 Auto-refresh 15s
            </span>
            {syncMsg && (
              <span
                style={{
                  padding: '3px 10px',
                  background: syncMsg.startsWith('❌') ? 'var(--psh-error-bg)' : 'var(--psh-success-bg)',
                  border: syncMsg.startsWith('❌') ? '1px solid #fecaca' : '1px solid #bbf7d0',
                  borderRadius: 4,
                  color: syncMsg.startsWith('❌') ? 'var(--psh-error-text)' : 'var(--psh-success-text)',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {syncMsg}
              </span>
            )}
            <span style={{ color: lastUpdate ? '#059669' : 'var(--psh-text-muted)' }}>
              ⏱️ {lastUpdate ? `Última carga: ${lastUpdate.toLocaleTimeString('pt-BR')} (há ${segundosAtras}s)` : 'Carregando...'}
            </span>
            <span style={{ color: 'var(--psh-text-secondary)' }}>
              📦 {ultimaContagem} {ultimaContagem === 1 ? 'venda' : 'vendas'} carregadas
            </span>
            {vendas.length > 0 && vendas[0].created_at && (
              <span style={{ color: 'var(--psh-text-tertiary)' }}>
                🕐 Última venda do banco: {new Date(vendas[0].created_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: 'var(--psh-error-bg)',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: 'var(--psh-error-text)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>❌ Erro ao carregar: {error}</span>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '4px 10px',
                  background: '#dc2626',
                  color: 'var(--psh-bg-secondary)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                🔄 Recarregar página
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Auto-refresh a cada 15s (pode desligar)' : 'Auto-refresh desligado (clique pra ligar)'}
            style={{
              padding: '8px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: 'var(--psh-bg-secondary)',
              color: 'var(--psh-text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {autoRefresh ? '⏸️ Pausar auto-refresh' : '▶️ Ativar auto-refresh'}
          </button>
<button
            onClick={syncML}
            disabled={syncing}
            title="Puxa as últimas 25 orders do Mercado Livre agora"
            style={{
              padding: '8px 14px',
              border: '1px solid #FFE600',
              borderRadius: 6,
              background: syncing ? '#fff8d6' : '#FFE600',
              cursor: syncing ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: syncing ? 0.7 : 1,
              color: 'var(--psh-text-primary)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: syncing ? 'spin 1s linear infinite' : 'none',
                fontSize: 14,
              }}
            >
              {syncing ? '⏳' : '📡'}
            </span>
            {syncing ? 'Sincronizando ML...' : 'Sync ML'}
          </button>
          <button
            onClick={() => {
              if (confirm('Recarregar a página inteira? Vai perder filtros não salvos.')) {
                window.location.reload()
              }
            }}
            title="Recarrega a página inteira (contorna qualquer cache do navegador/SW)"
            style={{
              padding: '8px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: 'var(--psh-bg-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            🔄 Recarregar
          </button>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              paddingLeft: 4,
              fontSize: 11,
              color: 'var(--psh-text-tertiary)',
              lineHeight: 1.3,
              minWidth: 90,
            }}
            title={lastUpdate ? `Última atualização: ${lastUpdate.toLocaleTimeString('pt-BR')}` : 'Nunca atualizado'}
          >
            {lastUpdate && (
              <>
                <span>
                  {segundosAtras < 5 ? 'agora mesmo' : `há ${segundosAtras}s`}
                </span>
                <span style={{ color: 'var(--psh-text-muted)' }}>
                  {ultimaContagem} {ultimaContagem === 1 ? 'venda' : 'vendas'}
                </span>
              </>
            )}
          </div>
          <Link
            href="/admin/gestao-ativa"
            style={{
              padding: '8px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: 'var(--psh-bg-secondary)',
              color: 'var(--psh-text-secondary)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            ← Painel
          </Link>
        </div>
      </div>

      {/* KPIs */}
      {resumo && (
        <>
          {/* Tabela resumo: vendas / canceladas / unidades / comissão */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
              marginBottom: 12,
              padding: 12,
              background: 'var(--psh-bg-secondary)',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 8,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>✅ Vendas (válidas)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{apiMeta?.total_validas ?? vendas.length}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>❌ Canceladas</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{apiMeta?.total_excluidas ?? 0}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>📦 Unidades</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{vendas.reduce((s, v) => s + (v.quantidade || 1), 0)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>🪙 Tarifa ML 12%</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{fmtBRL((resumo.tarifa_pct || 0) + (resumo.tarifa_fixa || 0))}</div>
              <div style={{ fontSize: 10, color: 'var(--psh-text-muted)' }}>pura (12% + fixa)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>💸 Comissão total</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{fmtBRL(resumo.comissao || 0)}</div>
              <div style={{ fontSize: 10, color: 'var(--psh-text-muted)' }}>
                {resumo.venda > 0 ? ((resumo.comissao / resumo.venda) * 100).toFixed(1) : 0}% (c/ cupom)
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <KpiCard
              label="💰 Vendas (válidas)"
              value={fmtBRL(resumo.venda)}
              sub={`${apiMeta?.total_validas ?? vendas.length} pedidos${apiMeta && apiMeta.total_excluidas > 0 ? ` · ${apiMeta.total_excluidas} cancelados fora` : ''}`}
              color="#3b82f6"
            />
            <KpiCard
              label="📦 Custo"
              value={fmtBRL(resumo.custo)}
              sub={`CMV (excluindo cancelados)${resumo.custo_flex > 0 ? ` + FLEX R$ ${resumo.custo_flex.toFixed(0)}` : ''}`}
              color="#6b7280"
            />
            <KpiCard
              label="💵 Margem"
              value={fmtBRL(resumo.margem_reais)}
              sub={fmtPct(resumo.margem_pct)}
              color={resumo.margem_reais > 0 ? '#10b981' : '#ef4444'}
              big
            />
          </div>
        </>
      )}

      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="🔎 Buscar produto, SKU, pedido..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            minWidth: 280,
            outline: 'none',
          }}
        />
        <button
          onClick={() => setFullOnly(!fullOnly)}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: fullOnly ? '#3b82f6' : 'var(--psh-bg-secondary)',
            color: fullOnly ? 'var(--psh-bg-secondary)' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {fullOnly ? '🔵' : '⚪'} Só FULL
        </button>
        <button
          onClick={() => setFlexOnly(!flexOnly)}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: flexOnly ? '#a78bfa' : 'var(--psh-bg-secondary)',
            color: flexOnly ? 'var(--psh-bg-secondary)' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {flexOnly ? '🟣' : '⚪'} Só FLEX
        </button>
        <button
          onClick={() => setMlOnly(!mlOnly)}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: mlOnly ? '#f59e0b' : 'var(--psh-bg-secondary)',
            color: mlOnly ? 'var(--psh-bg-secondary)' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {mlOnly ? '🟡' : '⚪'} Só ML (Agência)
        </button>
        <button
          onClick={() => setPlataformaOnly('todos')}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: plataformaOnly === 'todos' ? '#7c3aed' : 'var(--psh-bg-secondary)',
            color: plataformaOnly === 'todos' ? 'var(--psh-bg-secondary)' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {plataformaOnly === 'todos' ? '🟣' : '⚪'} TODOS (toda operação — site, whats, vendedoras)
        </button>
        <button
          onClick={() => setPlataformaOnly('ml')}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: plataformaOnly === 'ml' ? '#facc15' : 'var(--psh-bg-secondary)',
            color: plataformaOnly === 'ml' ? '#000' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {plataformaOnly === 'ml' ? '🟡' : '⚪'} ML (todos — FULL+FLEX+Agência)
        </button>
        <button
          onClick={() => setPlataformaOnly('shopee')}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: plataformaOnly === 'shopee' ? '#fb923c' : 'var(--psh-bg-secondary)',
            color: plataformaOnly === 'shopee' ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {plataformaOnly === 'shopee' ? '🟠' : '⚪'} SHOPEE
        </button>
        {/* Selector de Período */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', borderLeft: '1px solid #d1d5db', paddingLeft: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--psh-text-tertiary)', alignSelf: 'center', marginRight: 4 }}>
            📅 Período:
          </span>
          {([
            ['hoje', '🗓️ Hoje'],
            ['7d', '7 dias'],
            ['30d', '30 dias'],
            ['todos', '📚 Todos'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriodo(key)}
              style={{
                padding: '6px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: periodo === key ? '#10b981' : 'var(--psh-bg-secondary)',
                color: periodo === key ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {statusList.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: statusFilter === s ? 'var(--psh-text-primary)' : 'var(--psh-bg-secondary)',
                color: statusFilter === s ? 'var(--psh-bg-secondary)' : 'var(--psh-text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {error && (
        <div
          style={{
            padding: 12,
            background: 'var(--psh-error-bg)',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: 'var(--psh-error-text)',
            marginBottom: 16,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading && vendas.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--psh-text-muted)',
            background: 'var(--psh-bg-secondary)',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        >
          Carregando vendas...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--psh-text-muted)',
            background: 'var(--psh-bg-secondary)',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        >
          Nenhuma venda encontrada
        </div>
      ) : (
        <div
          style={{
            background: 'var(--psh-bg-secondary)',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-tertiary)', borderBottom: '1px solid #e5e7eb' }}>
                  <Th>Quando</Th>
                  <Th>Plataforma</Th>
                  <Th>Pedido</Th>
                  <Th>Produto</Th>
                  <Th align="center">Qtd</Th>
<Th align="right">Venda</Th>
                  <Th align="right">Comissão</Th>
                  <Th align="right">Frete</Th>
                  <Th align="right"><span title="Bônus por envio — ML repassa parte do custo de envio (cobre parte do custo_flex R$ 13,90)">Bônus envio</span></Th>
                  <Th align="right"><span title="Descontos e bônus — ML devolve parte da comissão como benefício (cupom implícito)">Bônus ML</span></Th>
                  <Th align="right">Recebimento</Th>
                  <Th align="right">Custo</Th>
                  <Th align="right">Margem</Th>
                  <Th align="center">Status</Th>
                </tr>
              </thead>
<tbody>
                {(() => {
                  // Agrupa vendas por pack_id (quando existe)
                  const groups: { key: string; items: Venda[]; isPack: boolean }[] = []
                  const usedIds = new Set<string>()
                  for (const v of filtered) {
                    if (usedIds.has(v.id)) continue
                    if (v.pack_id) {
                      const siblings = filtered.filter(x => x.pack_id === v.pack_id)
                      siblings.forEach(s => usedIds.add(s.id))
                      groups.push({ key: v.pack_id, items: siblings, isPack: true })
                    } else {
                      usedIds.add(v.id)
                      groups.push({ key: v.id, items: [v], isPack: false })
                    }
                  }
                  return groups.map((g) => {
                    const first = g.items[0]
                    const isPack = g.isPack && g.items.length > 1
                    // Soma valores quando é pack
                    const sumVenda = isPack ? g.items.reduce((s, i) => s + i.venda, 0) : first.venda
                    const sumFrete = isPack ? Math.max(...g.items.map(i => i.frete || 0)) : (first.frete || 0)
                    const sumBonusEnvio = isPack ? g.items.reduce((s, i) => s + (i.bonus_envio || 0), 0) : (first.bonus_envio || 0)
                    const sumBonusCupom = isPack ? g.items.reduce((s, i) => s + (i.bonus_cupom || 0), 0) : (first.bonus_cupom || 0)
                    // Comissão: usar comissao_seller (sale_fee real) — JÁ é líquida
                    // e contém 12% + fixa - cupom. É o que ML desconta de verdade.
                    const sumComissao = isPack
                      ? g.items.reduce((s, i) => s + (i.comissao || 0), 0)
                      : (first.comissao || 0)
                    // Recebimento (igual painel ML):
                    //   FLEX/self_service: venda − sale_fee + bonus_envio
                    //   FULL/cross/agency: venda − sale_fee − frete
                    //   (cupom_implicito já tá dentro de sale_fee como desconto)
                    const tipoEnvioDisplay = isPack ? first.tipo_envio : (first as any).tipo_envio
                    const isFulfillmentPack = tipoEnvioDisplay === 'fulfillment' || tipoEnvioDisplay === 'cross_docking' || tipoEnvioDisplay === 'xd_dropoff' || tipoEnvioDisplay === 'agency' || (first as any).isFull
                    const sumReceb = isFulfillmentPack
                      ? sumVenda - sumComissao - sumFrete
                      : sumVenda - sumComissao + sumBonusEnvio
                    const sumCusto = isPack ? g.items.reduce((s, i) => s + i.custo, 0) : first.custo
                    const margemReais = sumReceb - sumCusto
                    const margemPct = sumVenda > 0 ? (margemReais / sumVenda) * 100 : 0
                    const margemColor = margemPct >= 30 ? '#10b981' : margemPct >= 15 ? '#f59e0b' : '#ef4444'
                    // Comissões agregadas (força 12% — regra fixa ML)
                    const taxaComissao = 12
                    const display = isPack ? {
                      ...first,
                      venda: sumVenda,
                      comissao: sumComissao,
                      taxa_comissao_pct: taxaComissao,
                      frete: sumFrete,
                      bonus_envio: sumBonusEnvio,
                      bonus_cupom: sumBonusCupom,
                      bonus: sumBonusEnvio + sumBonusCupom,
                      recebimento: sumReceb,
                      custo: sumCusto,
                      margem_reais: margemReais,
                      margem_pct: margemPct,
                    } : first
                    const produtoText = isPack
                      ? `${g.items.length} produtos`
                      : first.produto
                    return (
<PackRow
                        key={g.key}
                        group={g}
                        display={display}
                        produtoText={produtoText}
                        margemColor={margemColor}
                        marcarEtapa={marcarEtapa}
                        imprimirEtiqueta={imprimirEtiqueta}
                        marcarQuemPegou={marcarQuemPegou}
                      />
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FulfillmentDot({ etapa }: { etapa: string }) {
  // Bolinha colorida grande — visual rápido do estado de fulfillment
  const config: Record<string, { cor: string; border: string; label: string; emoji: string }> = {
    pendente:  { cor: 'var(--psh-border, #e5e7eb)', border: 'var(--psh-text-secondary, #9ca3af)', label: 'Pendente (etiqueta não impressa)', emoji: '⚪' },
    impresso:  { cor: '#fbbf24', border: '#b45309', label: 'Etiqueta impressa', emoji: '🟡' },
    embalado:  { cor: '#34d399', border: '#047857', label: 'Embalado', emoji: '🟢' },
    enviado:   { cor: '#3b82f6', border: '#1e40af', label: 'Postado (enviado)', emoji: '🔵' },
    entregue:  { cor: '#a78bfa', border: '#5b21b6', label: 'Entregue', emoji: '🟣' },
    cancelado: { cor: '#ef4444', border: '#991b1b', label: 'Cancelado', emoji: '🔴' },
  }
  const c = config[etapa] || config.pendente
  return (
    <div
      title={c.label}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        background: c.cor,
        border: `2px solid ${c.border}`,
        boxShadow: `0 0 8px ${c.cor}80`,
        flexShrink: 0,
        cursor: 'help',
      }}
    />
  )
}

function KpiCard({
  label,
  value,
  sub,
  color,
  big,
}: {
  label: string
  value: string
  sub: string
  color: string
  big?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 16,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: big ? 26 : 22,
          fontWeight: 700,
          color: 'var(--psh-text-primary)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: align || 'left',
        fontWeight: 600,
        fontSize: 11,
        color: 'var(--psh-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </th>
  )
}

function PackRow({
  group,
  display,
  produtoText,
  margemColor,
  marcarEtapa,
  imprimirEtiqueta,
  marcarQuemPegou,
}: {
  group: { key: string; items: Venda[]; isPack: boolean }
  display: Venda
  produtoText: string
  margemColor: string
  marcarEtapa: (orderId: string, etapa: 'imprimir' | 'embalar' | 'desfazer') => Promise<void>
  imprimirEtiqueta: (orderId: string, orderNumber: string) => Promise<void>
  marcarQuemPegou: (orderId: string, orderNumber: string) => Promise<void>
}) {
  const v = display
  const isPack = group.isPack && group.items.length > 1
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        style={{
          borderBottom: isPack && expanded ? 'none' : '1px solid #f3f4f6',
          background: isPack ? 'var(--psh-warn-bg)' : 'var(--psh-bg-secondary)',
          cursor: isPack ? 'pointer' : 'default',
          transition: 'background 0.15s',
        }}
        onClick={() => isPack && setExpanded(!expanded)}
        onMouseEnter={(e) => (e.currentTarget.style.background = isPack ? 'var(--psh-warn-border)' : 'var(--psh-bg-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = isPack ? 'var(--psh-warn-bg)' : 'var(--psh-bg-secondary)')}
      >
        <Td>
          <div style={{ fontWeight: 500 }}>{fmtTime(v.created_at)}</div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-muted)' }}>
            {tempoRelativo(v.created_at)}
          </div>
        </Td>
        <Td>
          {v.isFlex ? (
            <span
              title={`Flex (Mercado Envios Flex) — ML não desconta frete. Você paga R$${v.custo_flex?.toFixed(2) || '13,90'} à transportadora à parte.`}
              style={{
                display: 'inline-block', padding: '3px 12px', borderRadius: 999, fontSize: 10,
                fontWeight: 700, background: '#10b981', color: 'var(--psh-bg-secondary)', letterSpacing: 0.5,
                boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)',
              }}
            >
              FLEX
            </span>
          ) : v.isFull ? (
            <span
              title="FULL — estoque no Mercado Livre, frete descontado pela plataforma"
              style={{
                display: 'inline-block', padding: '3px 12px', borderRadius: 999, fontSize: 10,
                fontWeight: 700, background: '#3b82f6', color: 'var(--psh-bg-secondary)', letterSpacing: 0.5,
                boxShadow: '0 1px 3px rgba(59, 130, 246, 0.3)',
              }}
            >
              FULL
            </span>
          ) : (
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
              fontWeight: 600, background: PLATAFORMA_COLOR[v.plataforma] || 'var(--psh-border-primary)',
              color: v.plataforma === 'mercado_livre' ? '#111' : 'var(--psh-bg-secondary)',
            }}>
              {v.plataforma === 'mercado_livre' ? 'ML' : v.plataforma}
            </span>
          )}
        </Td>
        <Td>
          <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }} title={v.pack_id ? `pack_id (ML): #${v.pack_id}` : `order_number: #${v.order_number}`}>
            #{v.pack_id || v.order_number}
            {isPack && <span style={{ marginLeft: 4, fontSize: 10, color: '#f59e0b' }}>▼ {expanded ? 'fechar' : 'expandir'}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-muted)' }}>{v.conta}</div>
        </Td>
        <Td>
          <div style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isPack ? 600 : 400 }}>
            {produtoText}
          </div>
          {!isPack && v.sku && v.sku !== '—' && (
            <div style={{ fontSize: 11, color: 'var(--psh-text-muted)' }}>SKU: {v.sku}</div>
          )}
        </Td>
        <Td align="center">
          <span style={{ fontWeight: 600 }}>{isPack ? group.items.reduce((s, i) => s + i.quantidade, 0) : v.quantidade}</span>
        </Td>
        <Td align="right">
          <span style={{ fontWeight: 600, color: 'var(--psh-text-primary)' }}>{fmtBRL(v.venda)}</span>
        </Td>
        <Td align="right">
          {(() => {
            const tarifaPct = (v as any).tarifa_pct_valor != null ? Number((v as any).tarifa_pct_valor) : (v.venda * 0.12)
            const tarifaFixa = (v as any).tarifa_fixa_valor != null ? Number((v as any).tarifa_fixa_valor) : 0
            const tarifaTotal = tarifaPct + tarifaFixa
            return (
              <>
                <div style={{ color: '#dc2626', cursor: 'help' }} title={
                  `Tarifa ML sobre venda: ${fmtBRL(v.venda)}\n` +
                  `├── Tarifa 12%: ${fmtBRL(tarifaPct)}\n` +
                  (tarifaFixa > 0 ? `└── Custo fixo: ${fmtBRL(tarifaFixa)} (categoria)\n` : '') +
                  `TOTAL tarifa ML: ${fmtBRL(tarifaTotal)}\n` +
                  `Líquido (com cupom): ${fmtBRL(v.comissao)}`
                }>
                  −{fmtBRL(tarifaTotal)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--psh-text-muted)' }}>
                  {tarifaFixa > 0 ? `12% + R$ ${tarifaFixa.toFixed(2)} fixa` : '12.0%'}
                </div>
              </>
            )
          })()}
        </Td>
        <Td align="right">
          {(() => {
            const tipo = v.tipo_envio
            // FULL, cross_docking, xd_dropoff, agency = ML desconta frete
            const mlDescontaFrete = tipo === 'fulfillment' || (v as any).isFull || tipo === 'cross_docking' || tipo === 'xd_dropoff' || tipo === 'agency'
            if (mlDescontaFrete) {
              return (
                <span title={`${tipo === 'fulfillment' || (v as any).isFull ? 'FULL' : 'Agência/Cross-docking'}: ML desconta o frete do receb (-${fmtBRL(v.frete)})`}
                  style={{ color: '#dc2626', cursor: 'help', fontWeight: 600 }}>
                  {v.frete > 0 ? `−${fmtBRL(v.frete)}` : '—'}
                </span>
              )
            }
            // FLEX / Clássico: frete passa pelo seller
            return (
              <span title={`FLEX / Clássico: frete NÃO desconta do receb\nBuyer paga → seller repassa ao carrier (custo_flex R$ 13,90 fica no CMV)\nValor: ${fmtBRL(v.frete)} (informativo)`}
                style={{ color: 'var(--psh-text-muted)', cursor: 'help' }}>
                {v.frete > 0 ? `R$ ${fmtBRL(v.frete).replace('R$ ', '')}` : '—'}
              </span>
            )
          })()}
        </Td>
        <Td align="right">
          <span title={`Bônus por envio — ML repassa o valor (só se aplica em FLEX/clássicos; em FULL/cross/agency = 0)`}
            style={{ color: (v.bonus_envio || 0) > 0 ? '#10b981' : 'var(--psh-text-muted)', cursor: 'help' }}>
            {(v.bonus_envio || 0) > 0 ? `+${fmtBRL(v.bonus_envio)}` : '—'}
          </span>
        </Td>
        <Td align="right">
          <span title="Descontos e bônus — ML devolve parte da comissão como benefício (cupom implícito)"
            style={{ color: (v.bonus_cupom || 0) > 0 ? '#10b981' : 'var(--psh-text-muted)', cursor: 'help' }}>
            {(v.bonus_cupom || 0) > 0 ? `+${fmtBRL(v.bonus_cupom)}` : '—'}
          </span>
        </Td>
        <Td align="right">
          <span title={
            (v.tipo_envio === 'fulfillment' || (v as any).isFull)
              ? 'FULL: venda − 12% − frete + cupom'
              : (v.tipo_envio === 'cross_docking' || v.tipo_envio === 'xd_dropoff' || v.tipo_envio === 'agency')
                ? 'Agência/Cross-docking: venda − 12% − frete + cupom'
                : 'FLEX: venda − 12% + bônus_envio + cupom (frete NÃO desconta)'
          }
            style={{ fontWeight: 700, color: '#059669' }}>
            {(() => {
              const tipo = v.tipo_envio
              const mlDescontaFrete = tipo === 'fulfillment' || (v as any).isFull || tipo === 'cross_docking' || tipo === 'xd_dropoff' || tipo === 'agency'
              const tarifaPct = (v as any).tarifa_pct_valor != null ? Number((v as any).tarifa_pct_valor) : (v.venda * 0.12)
              const tarifaFixa = (v as any).tarifa_fixa_valor != null ? Number((v as any).tarifa_fixa_valor) : 0
              const tarifaTotal = tarifaPct + tarifaFixa
              // Receb correto (vendedor realmente recebe) = venda - (sale_fee real) - frete + bonus_envio
              // sale_fee = tarifaTotal - bonus_cupom_implicito (cupom reduz o que sai)
              // Mas como "comissao" no DB já é o sale_fee LIQUIDO, usamos direto:
              // receb = venda - comissao - frete + bonus_envio
              if (mlDescontaFrete) {
                return fmtBRL(v.venda - (v.comissao || 0) - (v.frete || 0))
              } else {
                return fmtBRL(v.venda - (v.comissao || 0) + (v.bonus_envio || 0))
              }
            })()}
          </span>
        </Td>
        <Td align="right">
          <span style={{ color: 'var(--psh-text-muted)' }}>{v.custo > 0 ? `−${fmtBRL(v.custo)}` : '—'}</span>
        </Td>
        <Td align="right">
          <span style={{ fontWeight: 700, color: margemColor }}>{fmtBRL(v.margem_reais)}</span>
          <div style={{ fontSize: 11, color: margemColor }}>{v.margem_pct.toFixed(1)}%</div>
        </Td>
        <Td align="center">
          {/* BOLINHA COLORIDA — visual rápido do estado de fulfillment */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <FulfillmentDot etapa={v.etapa_fulfillment || 'pendente'} />
            <span style={{ fontSize: 11, color: 'var(--psh-text-secondary)', textTransform: 'capitalize' }}>
              {v.etapa_fulfillment || 'pendente'}
            </span>
          </div>
          {/* Botões de ação manual (só aparece se ainda não foi postado/entregue/cancelado) */}
          {v.etapa_fulfillment === 'pendente' && (
            <button
              onClick={() => imprimirEtiqueta(v.id, v.pack_id || v.order_number)}
              style={{
                marginTop: 6,
                padding: '4px 10px',
                fontSize: 11, fontWeight: 600,
                border: '1px solid #fbbf24', borderRadius: 6,
                background: '#fef3c7', color: '#92400e',
                cursor: 'pointer',
              }}
              title="Baixar etiqueta do Mercado Envios em PDF e marcar como impressa"
            >
              🖨️ Imprimir etiqueta
            </button>
          )}
          {v.etapa_fulfillment === 'impresso' && (
            <>
              <button
                onClick={() => marcarEtapa(v.id, 'embalar')}
                style={{
                  marginTop: 6,
                  padding: '4px 10px',
                  fontSize: 11, fontWeight: 600,
                  border: '1px solid #34d399', borderRadius: 6,
                  background: '#d1fae5', color: '#065f46',
                  cursor: 'pointer',
                }}
                title="Marcar como embalado"
              >
                📦 Embalado
              </button>
              <button
                onClick={() => imprimirEtiqueta(v.id, v.pack_id || v.order_number)}
                style={{
                  marginTop: 4,
                  padding: '3px 8px',
                  fontSize: 10, fontWeight: 600,
                  border: '1px solid #fbbf24', borderRadius: 6,
                  background: 'transparent', color: '#92400e',
                  cursor: 'pointer',
                  width: '100%',
                }}
                title="Reimprimir etiqueta (caso tenha rasgado ou engasgou na impressora)"
              >
                🖨️ Reimprimir
              </button>
              <button
                onClick={() => marcarQuemPegou(v.id, v.pack_id || v.order_number)}
                style={{
                  marginTop: 4,
                  padding: '3px 8px',
                  fontSize: 10, fontWeight: 600,
                  border: '1px solid #8b5cf6', borderRadius: 6,
                  background: 'transparent', color: '#6d28d9',
                  cursor: 'pointer',
                  width: '100%',
                }}
                title="Marcar qual parceiro pegou essa etiqueta (proxy de 'comprou de mim')"
              >
                👥 Quem pegou?
              </button>
            </>
          )}
          {v.etapa_fulfillment === 'embalado' && (
            <button
              onClick={() => imprimirEtiqueta(v.id, v.pack_id || v.order_number)}
              style={{
                marginTop: 6,
                padding: '4px 10px',
                fontSize: 11, fontWeight: 600,
                border: '1px solid #fbbf24', borderRadius: 6,
                background: '#fef3c7', color: '#92400e',
                cursor: 'pointer',
                width: '100%',
              }}
              title="Reimprimir etiqueta (caso tenha rasgado ou precisou de outra cópia)"
            >
              🖨️ Reimprimir etiqueta
            </button>
          )}
          {v.excluir_do_calculo && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#991b1b', fontWeight: 600 }}>
              ⚠️ não conta no CMV
            </div>
          )}
          {!isPack && v.plataforma === 'mercado_livre' && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              <ReconcileBadge orderNumber={v.order_number} />
              <RefetchButton orderNumber={v.order_number} onDone={() => location.reload()} />
            </div>
          )}
        </Td>
      </tr>
      {isPack && expanded && group.items.map((item, idx) => (
        <tr key={item.id} style={{
          background: 'var(--psh-warn-bg)', borderBottom: idx === group.items.length - 1 ? '1px solid #f3f4f6' : '1px dashed #fde68a',
          fontSize: 12,
        }}>
          <Td>{''}</Td>
          <Td>{''}</Td>
          <Td>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--psh-text-tertiary)', paddingLeft: 12 }}>
              └ #{(item as any).pack_id || item.order_number}
            </div>
          </Td>
          <Td>
            <div style={{ paddingLeft: 12, fontSize: 11, maxWidth: 280 }}>
              <div style={{ color: 'var(--psh-text-primary)' }}>{item.produto}</div>
              {item.sku && item.sku !== '—' && <div style={{ color: 'var(--psh-text-muted)', fontSize: 10 }}>SKU: {item.sku}</div>}
            </div>
          </Td>
          <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 }}>{item.quantidade}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11 }}>{fmtBRL(item.venda)}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, color: '#dc2626' }}>−{fmtBRL(item.venda * 0.12)}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, color: '#dc2626' }}>{(item.frete || 0) > 0 ? `−${fmtBRL(item.frete)}` : '—'}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, color: '#10b981' }}>{(item.bonus_envio || 0) > 0 && item.tipo_envio !== 'fulfillment' ? `+${fmtBRL(item.bonus_envio)}` : '—'}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, color: '#10b981' }}>{(item.bonus_cupom || 0) > 0 ? `+${fmtBRL(item.bonus_cupom)}` : '—'}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11 }}>
            {(item.tipo_envio === 'fulfillment')
              ? fmtBRL(item.venda - (item.venda * 0.12) - (item.frete || 0) + (item.bonus_cupom || 0))
              : fmtBRL(item.venda - (item.venda * 0.12) + (item.bonus_envio || 0) + (item.bonus_cupom || 0))}
            {item.plataforma === 'mercado_livre' && (
              <ReconcileBadge orderNumber={item.order_number} small />
            )}
          </td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11 }}>{item.custo > 0 ? `−${fmtBRL(item.custo)}` : '—'}</td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11 }}>{fmtBRL(item.margem_reais)} <span style={{ color: margemColor }}>({item.margem_pct.toFixed(0)}%)</span></td>
          <td style={{ padding: '6px 12px' }}></td>
        </tr>
      ))}
    </>
  )
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
}) {
  return (
<td
      style={{
        padding: '10px 12px',
        textAlign: align || 'left',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  )
}

// 🔴 Badge discreto de reconciliação: consulta ML on-the-fly, mostra popup se diverge
function ReconcileBadge({ orderNumber, small }: { orderNumber: string; small?: boolean }) {
  const [data, setData] = useState<{ db_receb: number; ml_receb: number; diff: number; has_discrepancy: boolean; tipo_envio?: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orderNumber) return
    let cancel = false
    fetch(`/api/admin/reconcile/check?order=${orderNumber}`, {
      headers: { Authorization: `Basic ${btoa('premium:shine2026')}` },
    })
      .then(r => r.json())
      .then(j => {
        if (cancel || !j.ok) return
        setData({
          db_receb: j.db_receb,
          ml_receb: j.ml_receb,
          diff: j.diff,
          has_discrepancy: j.has_discrepancy,
          tipo_envio: j.tipo_envio,
        })
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [orderNumber])

  if (!data || !data.has_discrepancy) return null

  async function save() {
    setSaving(true)
    try {
      const num = parseFloat(editVal.replace(',', '.'))
      if (isNaN(num)) { alert('Valor inválido'); return }
      const r = await fetch('/api/admin/set-recebimento', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa('premium:shine2026')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderNumber, recebimento: num }),
      })
      const j = await r.json()
      if (j.ok) {
        setOpen(false)
        // recarrega a página silenciosamente (deixa o auto-refresh de 15s cuidar)
        setData({ ...data!, db_receb: num, diff: Number((num - data!.ml_receb).toFixed(2)), has_discrepancy: Math.abs(num - data!.ml_receb) > 1 })
      } else { alert(`Erro: ${j.error}`) }
    } finally { setSaving(false) }
  }

  const size = small ? 10 : 12
  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); setEditVal(String(data.db_receb)); setOpen(true) }}
        title={`Divergência ML: diferença R$ ${data.diff.toFixed(2)}\nClique p/ conferir/corrigir`}
        style={{
          display: 'inline-block', marginLeft: 4, padding: small ? '1px 5px' : '2px 7px',
          borderRadius: 999, fontSize: size, fontWeight: 700, cursor: 'pointer',
          background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5',
          lineHeight: 1.2,
        }}
      >
        🔴 {Math.abs(data.diff).toFixed(2)}
      </span>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'var(--psh-bg-secondary)', padding: 20, borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          zIndex: 1000, minWidth: 360, border: '2px solid #3b82f6',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--psh-text-primary)' }}>
            Reconciliação venda #{orderNumber}
          </div>
          <div style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', marginBottom: 4 }}>
            Tipo envio: <strong style={{ color: 'var(--psh-text-primary)' }}>{data.tipo_envio || '?'}</strong> · ML retornou divergência
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
            <span>Valor no sistema:</span>
            <strong>R$ {data.db_receb.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
            <span>Esperado (ML):</span>
            <strong style={{ color: '#059669' }}>R$ {data.ml_receb.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
            <span>Diferença:</span>
            <strong style={{ color: data.diff > 0 ? '#dc2626' : '#dc2626' }}>R$ {data.diff.toFixed(2)}</strong>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--psh-text-tertiary)', display: 'block', marginBottom: 4 }}>Valor correto (R$):</label>
            <input
              autoFocus
              type="number" step="0.01"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #3b82f6', borderRadius: 4, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={() => setOpen(false)} disabled={saving} style={{ padding: '6px 14px', background: 'var(--psh-hover-bg)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--psh-text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving} style={{ padding: '6px 14px', background: '#3b82f6', color: 'var(--psh-bg-secondary)', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }} />}
    </>
  )
}

// 🔄 Botão Refetch: recalcula tudo a partir da API do ML (fonte da verdade)
function RefetchButton({ orderNumber, onDone }: { orderNumber: string; onDone?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [open, setOpen] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const auth = btoa('premium:shine2026')
      const r = await fetch(`/api/admin/refetch-order?order=${encodeURIComponent(orderNumber)}`, {
        headers: { Authorization: `Basic ${auth}` },
      })
      const j = await r.json()
      setResult(j)
      setOpen(true)
      if (j.ok && j.saved) setTimeout(() => onDone?.(), 1500)
    } catch (err: any) {
      setResult({ ok: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); run() }}
        disabled={loading}
        title={`Refetch venda ${orderNumber} da API do ML`}
        style={{
          background: loading ? 'var(--psh-border-primary)' : '#8b5cf6',
          color: 'var(--psh-bg-secondary)',
          border: 'none',
          borderRadius: 3,
          padding: '1px 6px',
          fontSize: 10,
          cursor: loading ? 'wait' : 'pointer',
          marginLeft: 4,
        }}
      >
        {loading ? '...' : '🔄'}
      </button>
      {open && result && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--psh-bg-secondary)', padding: 24, borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.3)', minWidth: 460, maxWidth: 600 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--psh-text-primary)' }}>
              🔄 Refetch venda #{orderNumber}
            </div>
            {result.ok ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', marginBottom: 8 }}>
                  Tipo envio: <strong style={{ color: 'var(--psh-text-primary)' }}>{result.tipo_envio_ml || '?'}</strong>
                </div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th align="left" style={{ padding: 6 }}>Campo</th>
                      <th align="right" style={{ padding: 6 }}>Antes</th>
                      <th align="right" style={{ padding: 6 }}>Depois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.novo || {}).map(([k, v]: any) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{k}</td>
                        <td align="right" style={{ padding: 6, color: 'var(--psh-text-muted)' }}>{(result.anterior as any)?.[k] != null ? Number((result.anterior as any)[k]).toFixed(2) : '—'}</td>
                        <td align="right" style={{ padding: 6, fontWeight: 600, color: '#059669' }}>{Number(v).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, fontSize: 11, color: result.dry_run ? '#f59e0b' : '#10b981' }}>
                  {result.dry_run ? '🟡 Dry-run (não salvou)' : '✅ Salvo no banco'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#dc2626' }}>Erro: {result.error}</div>
            )}
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button onClick={() => setOpen(false)} style={{ padding: '6px 14px', background: 'var(--psh-hover-bg)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--psh-text-secondary)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

