'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'

interface Props {
  listingId: string
  precoAtual: number
  precoPromocional: number | null
  promocaoFim: string | null
  onUpdated: () => void
}

export function PromocaoManager({ listingId, precoAtual, precoPromocional, promocaoFim, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<'percentage' | 'fixed'>('percentage')
  const [desconto, setDesconto] = useState(10)
  const [duracao, setDuracao] = useState(7)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const promAtiva = precoPromocional && new Date(promocaoFim || 0) > new Date()
  const precoFinal = tipo === 'percentage'
    ? Math.round(precoAtual * (1 - desconto / 100) * 100) / 100
    : Math.max(precoAtual - desconto, 0.01)
  const economia = precoAtual - precoFinal

  async function criar() {
    setLoading(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/ml/promocoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          tipo,
          desconto,
          duracao_dias: duracao,
        }),
      })
      const j = await res.json()
      if (j.success) {
        setMsg('✅ ' + j.message)
        setTimeout(() => { setOpen(false); setMsg(''); onUpdated() }, 1500)
      } else {
        setMsg('❌ ' + (j.error || 'Erro'))
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function remover() {
    if (!confirm('Remover promoção ativa?')) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/ml/promocoes?listing_id=${listingId}&promotion_id=current`, {
        method: 'DELETE',
      })
      const j = await res.json()
      if (j.success) {
        onUpdated()
      } else {
        setMsg('❌ ' + j.error)
      }
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px', background: promAtiva ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${promAtiva ? '#eab308' : '#22c55e'}`,
          color: promAtiva ? '#eab308' : '#22c55e', borderRadius: 6,
          cursor: 'pointer', fontWeight: 600, fontSize: '0.85em',
        }}
      >
        {promAtiva ? '🏷️ Editar Promoção' : '🏷️ Criar Promoção'}
      </button>
    )
  }

  return (
    <div style={{ background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ color: '#a78bfa' }}>🏷️ {promAtiva ? 'Editar' : 'Criar'} Promoção Mercado Livre</h4>
        <button onClick={() => { setOpen(false); setMsg('') }} style={{ background: 'transparent', border: 'none', color: '#b0b0cc', cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Tipo de desconto</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={{ width: '100%', padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 4 }}>
            <option value="percentage">📊 Porcentagem (%)</option>
            <option value="fixed">💵 Valor Fixo (R$)</option>
          </select>
        </div>
        <div>
          <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>
            {tipo === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
          </label>
          <input type="number" value={desconto} onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)} step={tipo === 'percentage' ? 1 : 0.5} style={{ width: '100%', padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 4 }} />
        </div>
        <div>
          <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Duração (dias)</label>
          <input type="number" value={duracao} onChange={(e) => setDuracao(parseInt(e.target.value) || 7)} style={{ width: '100%', padding: '6px 8px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 4 }} />
        </div>
        <div>
          <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Preço Atual</label>
          <div style={{ padding: '6px 8px', background: '#0a0a1a', color: '#a78bfa', borderRadius: 4 }}>R$ {precoAtual.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 6, padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.7em' }}>💵 Novo Preço</div>
            <div style={{ color: '#22c55e', fontSize: '1.2em', fontWeight: 700 }}>R$ {precoFinal.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.7em' }}>💰 Economia</div>
            <div style={{ color: '#22c55e', fontSize: '1.1em', fontWeight: 600 }}>R$ {economia.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ color: '#7070a0', fontSize: '0.7em' }}>📅 Término</div>
            <div style={{ color: '#d0c0ff', fontSize: '0.9em' }}>
              {new Date(Date.now() + duracao * 86400000).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>
      </div>

      {msg && <div style={{ color: msg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '0.85em', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={criar}
          disabled={loading || desconto <= 0}
          style={{
            padding: '8px 16px', background: '#22c55e', border: 'none', color: '#000',
            borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
            fontWeight: 600, fontSize: '0.85em', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '⏳ Criando...' : '🚀 Criar Promoção no ML'}
        </button>
        {promAtiva && (
          <button
            onClick={remover}
            disabled={loading}
            style={{
              padding: '8px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444',
              color: '#ef4444', borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
              fontWeight: 600, fontSize: '0.85em',
            }}
          >
            🗑️ Remover
          </button>
        )}
      </div>
    </div>
  )
}
