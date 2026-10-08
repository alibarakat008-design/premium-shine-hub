'use client'

/**
 * MIX POR CANAL - Gráficos de Pizza
 *
 * Mostra:
 * - 5 gráficos de pizza individuais (ML, Shopee, B2B, Site, WhatsApp)
 * - Cada um mostra a distribuição do que aconteceu nesse canal
 * - 1 gráfico consolidado com share de receita de cada canal
 * - 1 gráfico de margem por canal
 * - 1 gráfico de lucro por canal
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PieChart, CANAL_COLORS } from '../components/PieChart'

interface Canal {
  canal: string
  pedidos: number
  receita: number
  unidades: number
  cmv: number
  comissao: number
  lucro: number
  margem_pct: number
  ticket_medio: number
  share_pct: number
}

interface Data {
  canais: Canal[]
  resumo: { total_receita: number; total_lucro: number; total_pedidos: number; margem_media: number; canais_ativos: number }
  top: { receita: any; margem: any; lucro: any; pedidos: any }
}

const CANAL_INFO: Record<string, { nome: string; emoji: string }> = {
  mercado_livre: { nome: 'Mercado Livre', emoji: '🏪' },
  shopee: { nome: 'Shopee', emoji: '🛒' },
  site_b2c: { nome: 'Site B2C', emoji: '🌐' },
  whatsapp: { nome: 'WhatsApp', emoji: '💬' },
  b2b: { nome: 'Atacado B2B', emoji: '📋' },
  vendedora: { nome: 'Vendedoras', emoji: '👩‍💼' },
  outros: { nome: 'Outros', emoji: '📦' },
}

export default function MixCanaisPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(30)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/mix-canais?dias=${dias}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dias])

  if (status === 'loading' || loading || !data) {
    return <div style={{ padding: 40, color: 'var(--psh-text-secondary, #6b7280)' }}>Carregando mix de canais...</div>
  }

  // Pizza consolidado: receita por canal
  const pizzaReceita = data.canais
    .filter(c => c.receita > 0)
    .map(c => ({ label: CANAL_INFO[c.canal]?.nome || c.canal, value: c.receita, color: CANAL_COLORS[c.canal] || 'var(--psh-text-secondary, #6b7280)' }))

  // Pizza consolidado: lucro por canal
  const pizzaLucro = data.canais
    .filter(c => c.lucro > 0)
    .map(c => ({ label: CANAL_INFO[c.canal]?.nome || c.canal, value: c.lucro, color: CANAL_COLORS[c.canal] || 'var(--psh-text-secondary, #6b7280)' }))

  // Pizza consolidado: pedidos por canal
  const pizzaPedidos = data.canais
    .filter(c => c.pedidos > 0)
    .map(c => ({ label: CANAL_INFO[c.canal]?.nome || c.canal, value: c.pedidos, color: CANAL_COLORS[c.canal] || 'var(--psh-text-secondary, #6b7280)' }))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>🥧 Mix por Canal</h1>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em', marginTop: 2 }}>Visão consolidada de receita, lucro e pedidos por marketplace</div>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85em', background: 'var(--psh-bg-primary, #fff)' }}>
          <option value={7}>Últimos 7 dias</option>
          <option value={15}>Últimos 15 dias</option>
          <option value={30}>Último mês</option>
          <option value={90}>Últimos 3 meses</option>
        </select>
      </div>

      {/* Cards Top */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>💰 Maior Receita</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1em', fontWeight: 700, marginTop: 4 }}>
            {data.top.receita ? `${CANAL_INFO[data.top.receita.canal]?.emoji} ${CANAL_INFO[data.top.receita.canal]?.nome}` : '-'}
          </div>
          <div style={{ color: '#10b981', fontSize: '0.8em', fontWeight: 600 }}>R$ {data.top.receita?.receita?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '0'}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>📈 Maior Margem</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1em', fontWeight: 700, marginTop: 4 }}>
            {data.top.margem ? `${CANAL_INFO[data.top.margem.canal]?.emoji} ${CANAL_INFO[data.top.margem.canal]?.nome}` : '-'}
          </div>
          <div style={{ color: '#7c3aed', fontSize: '0.8em', fontWeight: 600 }}>{data.top.margem?.margem_pct?.toFixed(1) || '0'}% margem</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>💵 Maior Lucro</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1em', fontWeight: 700, marginTop: 4 }}>
            {data.top.lucro ? `${CANAL_INFO[data.top.lucro.canal]?.emoji} ${CANAL_INFO[data.top.lucro.canal]?.nome}` : '-'}
          </div>
          <div style={{ color: '#10b981', fontSize: '0.8em', fontWeight: 600 }}>R$ {data.top.lucro?.lucro?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '0'}</div>
        </div>
        <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em' }}>🛒 Mais Pedidos</div>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1em', fontWeight: 700, marginTop: 4 }}>
            {data.top.pedidos ? `${CANAL_INFO[data.top.pedidos.canal]?.emoji} ${CANAL_INFO[data.top.pedidos.canal]?.nome}` : '-'}
          </div>
          <div style={{ color: '#3b82f6', fontSize: '0.8em', fontWeight: 600 }}>{data.top.pedidos?.pedidos || 0} pedidos</div>
        </div>
      </div>

      {/* 3 Pizzas Consolidadas */}
      <h2 style={{ fontSize: '1.1em', color: 'var(--psh-text-primary, #1f2937)', margin: '20px 0 12px 0' }}>📊 Visão Geral</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <CardPie
          title="💰 Receita por Canal"
          data={pizzaReceita}
          centerValue={formatBRL(data.resumo.total_receita)}
          centerLabel="Total"
        />
        <CardPie
          title="💵 Lucro por Canal"
          data={pizzaLucro}
          centerValue={formatBRL(data.resumo.total_lucro)}
          centerLabel="Lucro Total"
        />
        <CardPie
          title="🛒 Pedidos por Canal"
          data={pizzaPedidos}
          centerValue={data.resumo.total_pedidos.toString()}
          centerLabel="Total Pedidos"
        />
      </div>

      {/* 5 Gráficos Individuais por Canal */}
      <h2 style={{ fontSize: '1.1em', color: 'var(--psh-text-primary, #1f2937)', margin: '20px 0 12px 0' }}>📈 Detalhe por Canal</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {['mercado_livre', 'shopee', 'site_b2c', 'b2b', 'whatsapp'].map((canalKey) => {
          const c = data.canais.find(x => x.canal === canalKey) || {
            canal: canalKey,
            pedidos: 0, receita: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0,
          } as Canal
          return <CanalPieCard key={canalKey} canalKey={canalKey} c={c} />
        })}
      </div>
    </div>
  )
}

function CardPie({ title, data, centerValue, centerLabel }: { title: string; data: any[]; centerValue: string; centerLabel: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
      <h3 style={{ margin: '0 0 16px 0', color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.95em' }}>{title}</h3>
      <PieChart
        data={data}
        size={180}
        thickness={55}
        centerValue={centerValue}
        centerLabel={centerLabel}
        showLegend={true}
      />
    </div>
  )
}

function CanalPieCard({ canalKey, c }: { canalKey: string; c: Canal }) {
  const info = CANAL_INFO[canalKey] || { nome: canalKey, emoji: '📦' }
  const cor = CANAL_COLORS[canalKey] || 'var(--psh-text-secondary, #6b7280)'
  const semDados = c.pedidos === 0 && c.receita === 0

  // Pizza individual: receita vs custos vs lucro
  const dataPie = semDados
    ? []
    : [
        { label: 'CMV', value: c.cmv, color: '#f97316' },
        { label: 'Comissão', value: c.comissao, color: '#a78bfa' },
        { label: 'Lucro', value: Math.max(c.lucro, 0), color: '#10b981' },
      ].filter(d => d.value > 0)

  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: `1px solid ${cor}30`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em' }}>
          {info.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.9em', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.nome}</div>
          <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.7em' }}>{c.pedidos} pedidos • {c.unidades} un</div>
        </div>
      </div>

      {semDados ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.85em' }}>
          📊 Sem dados no período
        </div>
      ) : (
        <>
          <PieChart
            data={dataPie}
            size={130}
            thickness={50}
            centerValue={`${c.margem_pct.toFixed(0)}%`}
            centerLabel="margem"
            showLegend={true}
          />
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 4 }}>
              <span style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>Receita</span>
              <span style={{ color: 'var(--psh-text-primary, #1f2937)', fontWeight: 600 }}>{formatBRL(c.receita)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 4 }}>
              <span style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>CMV</span>
              <span style={{ color: '#f97316' }}>{formatBRL(c.cmv)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 4 }}>
              <span style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>Comissão</span>
              <span style={{ color: '#a78bfa' }}>{formatBRL(c.comissao)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
              <span style={{ color: 'var(--psh-text-primary, #1f2937)', fontWeight: 600 }}>Lucro</span>
              <span style={{ color: c.lucro > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{formatBRL(c.lucro)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7em', marginTop: 4, color: 'var(--psh-text-secondary, #6b7280)' }}>
              <span>Ticket médio</span>
              <span>{formatBRL(c.ticket_medio)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatBRL(v: number): string {
  if (!v || isNaN(v)) return 'R$ 0'
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
