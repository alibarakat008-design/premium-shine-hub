'use client'

/**
 * ADMIN CANAIS — Visão segmentada
 * - Topo: KPIs MercadoPlace (B2B) vs Varejo (LIURAESSENCE)
 * - Tabela de canais com detalhes
 * - Visual claro: quem é dono de quê
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Canal = {
  nome: string
  emoji: string
  cor: string
  descricao: string
  dono: 'LIURAESSENCE' | 'B2B'
  origem: string
  pedidos: number
  receita: number
  unidades: number
  clientes_unicos: number
  contas_b2b: number
  ticket_medio: number
  evolucao_mensal: { mes: string; receita: number }[]
}

type Data = {
  meses: number
  total_pedidos: number
  total_receita: number
  resumo_por_dono: {
    b2b_marketplace: { receita: number; pct: number; canais: number }
    liura_essence_varejo: { receita: number; pct: number; canais: number }
  }
  ml_split: {
    full: { pedidos: number; receita: number; unidades: number; taxa_comissao: string; descricao: string }
    agencia: { pedidos: number; receita: number; unidades: number; taxa_comissao: string; descricao: string }
    classico: { pedidos: number; receita: number; unidades: number; taxa_comissao: string; descricao: string }
  }
  canais: Canal[]
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function CanaisPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [meses, setMeses] = useState(6)
  const [filtroDono, setFiltroDono] = useState<'todos' | 'B2B' | 'LIURAESSENCE'>('todos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch('/api/admin/canais?meses=${meses}')
    const j = await r.json()
    if (j.ok) setData(j)
    setLoading(false)
  }, [meses])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
  if (!data) return null

  const canaisFiltrados = data.canais.filter((c) => filtroDono === 'todos' || c.dono === filtroDono)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🔀 Segmentação de Canais</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12, margin: '2px 0 0 0' }}>Marketplace (B2B) vs Varejo (LIURAESSENCE) — separado por dono</p>
        </div>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} style={selectStyle}>
          <option value={1}>1 mês</option>
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </div>

      {/* Separação visual entre B2B e Varejo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <DonoPanel
          emoji="🏪"
          titulo="Marketplace (B2Bs)"
          desc="Contas de marketplace vinculadas aos clientes B2B"
          data={data.resumo_por_dono.b2b_marketplace}
          totalReceita={data.total_receita}
          cor="#3b82f6"
          onClick={() => setFiltroDono(filtroDono === 'B2B' ? 'todos' : 'B2B')}
          ativo={filtroDono === 'B2B'}
        />
        <DonoPanel
          emoji="🏬"
          titulo="Varejo (LIURAESSENCE)"
          desc="Site próprio, WhatsApp, Vendedoras, Atacado"
          data={data.resumo_por_dono.liura_essence_varejo}
          totalReceita={data.total_receita}
          cor="#10b981"
          onClick={() => setFiltroDono(filtroDono === 'LIURAESSENCE' ? 'todos' : 'LIURAESSENCE')}
          ativo={filtroDono === 'LIURAESSENCE'}
        />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {([
          { key: 'todos', label: `Todos (${data.canais.length})` },
          { key: 'B2B', label: `🏪 Marketplace B2B (${data.canais.filter((c) => c.dono === 'B2B').length})` },
          { key: 'LIURAESSENCE', label: `🏬 Varejo LIURA (${data.canais.filter((c) => c.dono === 'LIURAESSENCE').length})` },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setFiltroDono(t.key)} style={{ padding: '6px 12px', background: filtroDono === t.key ? '#3b82f6' : 'transparent', color: filtroDono === t.key ? 'white' : 'var(--psh-text-primary, #374151)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {/* Split do Mercado Livre — comissão diferenciada */}
      {data.ml_split && (data.ml_split.full.receita > 0 || data.ml_split.agencia.receita > 0 || data.ml_split.classico.receita > 0) && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 4 }}>🛒 Mercado Livre — split por modelo de venda</div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 12 }}>Custo de envio é o mesmo. O que muda é só a comissão.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <MLSplitCard label="Full" cor="#3b82f6" emoji="📦" dados={data.ml_split.full} />
            <MLSplitCard label="Agência" cor="#10b981" emoji="🏪" dados={data.ml_split.agencia} />
            <MLSplitCard label="Clássico" cor="#9ca3af" emoji="🚚" dados={data.ml_split.classico} />
          </div>
        </div>
      )}

      {/* Grid de canais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {canaisFiltrados.map((c) => (
          <div key={c.origem} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, borderTop: `4px solid ${c.cor}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 28 }}>{c.emoji}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{c.nome}</div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{c.origem}</div>
                </div>
              </div>
              <span style={{ padding: '2px 8px', background: c.dono === 'B2B' ? '#dbeafe' : '#dcfce7', color: c.dono === 'B2B' ? '#1e40af' : '#065f46', borderRadius: 3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{c.dono}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 12 }}>{c.descricao}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
              <Mini label="Receita" value={fmtBRL(c.receita)} color={c.cor} />
              <Mini label="Pedidos" value={c.pedidos.toLocaleString('pt-BR')} color="#3b82f6" />
              <Mini label="Ticket" value={fmtBRL(c.ticket_medio)} color="#8b5cf6" />
              <Mini label="Clientes" value={c.clientes_unicos.toLocaleString('pt-BR')} color="#10b981" />
            </div>
            {c.contas_b2b > 0 && (
              <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4, marginBottom: 8 }}>
                🔗 <strong>{c.contas_b2b}</strong> {c.contas_b2b === 1 ? 'conta B2B vinculada' : 'contas B2B vinculadas'}
              </div>
            )}
            <Sparkline data={c.evolucao_mensal} cor={c.cor} />
          </div>
        ))}
      </div>

      {data.canais.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          Nenhum canal com vendas no período
        </div>
      )}
    </div>
  )
}

function DonoPanel({ emoji, titulo, desc, data, totalReceita, cor, onClick, ativo }: { emoji: string; titulo: string; desc: string; data: { receita: number; pct: number; canais: number }; totalReceita: number; cor: string; onClick: () => void; ativo: boolean }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, cursor: 'pointer', borderWidth: ativo ? 2 : 1, borderColor: ativo ? cor : 'var(--psh-border, #e5e7eb)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 36 }}>{emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{titulo}</div>
          <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>{desc}</div>
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: cor, marginBottom: 4 }}>{fmtBRL(data.receita)}</div>
      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
        {data.pct}% do total • {data.canais} {data.canais === 1 ? 'canal' : 'canais'}
      </div>
      <div style={{ height: 8, background: 'var(--psh-border, #e5e7eb)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ width: `${data.pct}%`, height: '100%', background: cor }} />
      </div>
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Sparkline({ data, cor }: { data: { mes: string; receita: number }[]; cor: string }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map((d) => d.receita), 1)
  const W = 280, H = 40, P = 4
  const stepX = data.length > 1 ? (W - 2 * P) / (data.length - 1) : 0

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 40 }}>
      <path
        d={data.map((d, i) => {
          const x = P + i * stepX
          const y = H - P - (d.receita / max) * (H - 2 * P)
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
        }).join(' ')}
        stroke={cor}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }

function MLSplitCard({ label, cor, emoji, dados }: { label: string; cor: string; emoji: string; dados: { pedidos: number; receita: number; unidades: number; taxa_comissao: string; descricao: string } }) {
  return (
    <div style={{ background: 'var(--psh-bg-secondary, #fafbfc)', border: `1px solid ${cor}40`, borderRadius: 8, padding: 12, borderTop: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: cor }}>{label}</div>
        </div>
        <span style={{ padding: '2px 6px', background: cor + '20', color: cor, borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{dados.taxa_comissao}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 8 }}>{dados.descricao}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{(dados.receita || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2 }}>{dados.pedidos} pedidos • {dados.unidades} un.</div>
      {dados.pedidos === 0 && (
        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)', fontStyle: 'italic', marginTop: 6 }}>Nenhuma venda neste modelo</div>
      )}
    </div>
  )
}
