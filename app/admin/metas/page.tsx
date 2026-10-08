'use client'

/**
 * METAS MENSAIS
 * - Definir meta de receita, pedidos e margem
 * - Acompanhar progresso em tempo real
 * - Barra de progresso com % atingida
 * - Sugestão de ritmo diário
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Goal = {
  meta_receita: number
  meta_pedidos: number
  meta_margem_pct: number
  observacoes?: string
}
type Realizado = {
  pedidos: number
  receita: number
  cmv: number
  comissao: number
  custos_fixos: number
  lucro_bruto: number
  lucro_liquido: number
  margem_pct: number
}
type Periodo = { ano: number; mes: number; dias_no_mes: number; dia_atual: number }

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function MetasPage() {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [realizado, setRealizado] = useState<Realizado | null>(null)
  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState({ meta_receita: 0, meta_pedidos: 0, meta_margem_pct: 0 })

  const fetchData = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/monthly-goals', {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setGoal(j.goal)
      setRealizado(j.realizado)
      setPeriodo(j.periodo)
      if (j.goal) {
        setDraft({
          meta_receita: Number(j.goal.meta_receita || 0),
          meta_pedidos: Number(j.goal.meta_pedidos || 0),
          meta_margem_pct: Number(j.goal.meta_margem_pct || 0),
        })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  const salvar = async () => {
    if (!periodo) return
    try {
      const r = await apiFetch('/api/admin/monthly-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ ...draft, ano: periodo.ano, mes: periodo.mes }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setEditando(false)
      fetchData()
    } catch (err: any) {
      setError(err.message)
    }
  }
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
  }
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🎯 Metas Mensais</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>
            {periodo && `${MESES[periodo.mes - 1]} de ${periodo.ano} • Dia ${periodo.dia_atual}/${periodo.dias_no_mes}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/insights" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>💡 Insights</Link>
          <button
            onClick={() => setEditando(!editando)}
            style={{ padding: '8px 14px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {editando ? 'Cancelar' : goal ? '✏️ Editar meta' : '+ Definir meta'}
          </button>
        </div>
      </div>
      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}
      {editando && (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>Definir meta de {periodo && `${MESES[periodo.mes - 1]} ${periodo.ano}`}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>Meta de Receita (R$)</label>
              <input
                type="number"
                value={draft.meta_receita || ''}
                onChange={(e) => setDraft({ ...draft, meta_receita: Number(e.target.value) })}
                placeholder="Ex: 500000"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>Meta de Pedidos</label>
              <input
                type="number"
                value={draft.meta_pedidos || ''}
                onChange={(e) => setDraft({ ...draft, meta_pedidos: Number(e.target.value) })}
                placeholder="Ex: 5000"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>Margem Desejada (%)</label>
              <input
                type="number"
                step="0.1"
                value={draft.meta_margem_pct || ''}
                onChange={(e) => setDraft({ ...draft, meta_margem_pct: Number(e.target.value) })}
                placeholder="Ex: 20"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <button
            onClick={salvar}
            style={{ marginTop: 12, padding: '10px 20px', background: '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            💾 Salvar meta
          </button>
        </div>
      )}
      {!goal ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 8px 0' }}>Você ainda não definiu uma meta</h2>
          <p style={{ fontSize: 14, color: 'var(--psh-text-secondary, #6b7280)', margin: '0 0 20px 0' }}>
            Defina uma meta de receita, pedidos ou margem pra acompanhar o progresso.
          </p>
          <button
            onClick={() => setEditando(true)}
            style={{ padding: '12px 24px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            + Definir meta do mês
          </button>
        </div>
      ) : realizado && periodo ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <ProgressoMeta
              titulo="💰 Receita"
              realizado={realizado.receita}
              meta={Number(goal.meta_receita || 0)}
              diasNoMes={periodo.dias_no_mes}
              diaAtual={periodo.dia_atual}
              cor="#10b981"
            />
            <ProgressoMeta
              titulo="📦 Pedidos"
              realizado={realizado.pedidos}
              meta={Number(goal.meta_pedidos || 0)}
              diasNoMes={periodo.dias_no_mes}
              diaAtual={periodo.dia_atual}
              cor="#3b82f6"
              isCount
            />
            <ProgressoMeta
              titulo="📈 Margem Líquida"
              realizado={realizado.margem_pct}
              meta={Number(goal.meta_margem_pct || 0)}
              diasNoMes={periodo.dias_no_mes}
              diaAtual={periodo.dia_atual}
              cor="#8b5cf6"
              isPercent
            />
          </div>
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📊 Resumo do Mês</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <Stat label="Receita Bruta" value={fmtBRL(realizado.receita)} color="#10b981" />
              <Stat label="CMV" value={fmtBRL(realizado.cmv)} color="#dc2626" />
              <Stat label="Comissões ML (14%)" value={fmtBRL(realizado.comissao)} color="#f59e0b" />
              <Stat label="Custos Fixos" value={fmtBRL(realizado.custos_fixos)} color="#6b7280" />
              <Stat label="Lucro Bruto" value={fmtBRL(realizado.lucro_bruto)} color="#10b981" />
              <Stat label="Lucro Líquido" value={fmtBRL(realizado.lucro_liquido)} color="#3b82f6" big />
              <Stat label="Margem %" value={`${realizado.margem_pct.toFixed(1)}%`} color={realizado.margem_pct >= 20 ? '#10b981' : '#f59e0b'} />
              <Stat label="Pedidos" value={realizado.pedidos.toString()} color="#111827" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
function ProgressoMeta({
  titulo,
  realizado,
  meta,
  diasNoMes,
  diaAtual,
  cor,
  isCount,
  isPercent,
}: {
  titulo: string
  realizado: number
  meta: number
  diasNoMes: number
  diaAtual: number
  cor: string
  isCount?: boolean
  isPercent?: boolean
}) {
  const pct = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0
  const esperado = meta * (diaAtual / diasNoMes)
  const diffRealizado = realizado - esperado
  const ritmoBom = diffRealizado >= 0
  const valorStr = isCount ? realizado.toString() : isPercent ? `${realizado.toFixed(1)}%` : fmtBRL(realizado)
  const metaStr = isCount ? meta.toString() : isPercent ? `${meta}%` : fmtBRL(meta)
  const restante = meta - realizado
  const restanteStr = isCount ? restante.toString() : isPercent ? `${restante.toFixed(1)}%` : fmtBRL(Math.max(0, restante))
  // Sugestão: quanto precisa vender por dia pra bater a meta
  const diasRestantes = diasNoMes - diaAtual
  const precisoPorDia = diasRestantes > 0 ? restante / diasRestantes : restante
  const sugestaoStr = isCount ? `${Math.ceil(Math.max(0, precisoPorDia))} por dia` : isPercent ? '—' : fmtBRL(Math.max(0, precisoPorDia)) + '/dia'
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--psh-text-primary, #374151)' }}>{titulo}</div>
        <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>
          {diaAtual}/{diasNoMes} dias ({Math.round((diaAtual / diasNoMes) * 100)}%)
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{valorStr}</div>
        <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>/ {metaStr}</div>
      </div>
      <div style={{ width: '100%', height: 8, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: cor,
            borderRadius: 4,
            transition: 'width 0.5s',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: ritmoBom ? '#10b981' : '#ef4444', fontWeight: 600 }}>
          {pct.toFixed(1)}% {ritmoBom ? '✓ no ritmo' : '⚠️ abaixo'}
        </span>
        <span style={{ color: 'var(--psh-text-secondary, #6b7280)' }}>
          {restante > 0 ? `Faltam ${restanteStr}` : '🎉 Meta batida!'}
        </span>
      </div>
      {restante > 0 && diasRestantes > 0 && (
        <div style={{ marginTop: 8, padding: 8, background: '#f0f9ff', borderRadius: 4, fontSize: 11, color: '#075985' }}>
          💡 Precisa de <strong>{sugestaoStr}</strong> pra bater a meta
        </div>
      )}
    </div>
  )
}
function Stat({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: big ? 18 : 14, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
