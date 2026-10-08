'use client'

/**
 * PÁGINA: Criar Novo Cenário de Promoção
 * Rota: /admin/promocoes/novo
 */
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const AUTH = 'Basic ' + btoa('premium:shine2026')

export default function NovoCenarioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    product_name: '',
    mlb: '',
    max_seller_discount_pct: '',
    min_sale_price: '',
    min_net_receivable: '',
    activation_mode: 'conservative',
    active: false,
  })

  // Preencher MLB e nome da URL query params (quando vem da lista de MLBs)
  useEffect(() => {
    const mlbParam = searchParams.get('mlb') || ''
    const nomeParam = searchParams.get('nome') || ''
    if (mlbParam) setForm(f => ({ ...f, mlb: mlbParam }))
    if (nomeParam) setForm(f => ({ ...f, product_name: decodeURIComponent(nomeParam) }))
  }, [searchParams])

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.product_name.trim()) return setError('Nome do produto é obrigatório.')
    if (!form.mlb.trim()) return setError('MLB é obrigatório.')
    if (!form.max_seller_discount_pct && !form.min_sale_price && !form.min_net_receivable) {
      return setError('Pelo menos um critério financeiro é obrigatório.')
    }

    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/admin/promo-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({
          product_name: form.product_name.trim(),
          mlb: form.mlb.trim(),
          max_seller_discount_pct: form.max_seller_discount_pct || null,
          min_sale_price: form.min_sale_price || null,
          min_net_receivable: form.min_net_receivable || null,
          activation_mode: form.activation_mode,
          active: form.active,
        }),
      })
      const d = await r.json()
      if (d.ok) {
        router.push(`/admin/promocoes/${d.scenario.id}`)
      } else {
        if (d.existing_id) {
          setError(`Já existe um cenário para este MLB. `)
        } else {
          setError(d.error || 'Erro ao criar cenário.')
        }
      }
    } catch { setError('Erro de conexão.') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push('/admin/promocoes')} style={{ padding: '8px 16px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#a78bfa', cursor: 'pointer' }}>← Cenários</button>
          <h1 style={{ color: '#d0c0ff', margin: 0, fontSize: '1.5em' }}>➕ Novo Cenário</h1>
        </div>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24 }}>
          <Input label="Nome do Produto *" value={form.product_name} onChange={v => set('product_name', v)} placeholder="Ex: Batom Líquido Rosa 3ml" />
          <Input label="MLB *" value={form.mlb} onChange={v => set('mlb', v)} placeholder="MLB123456789" mono />

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>CRITÉRIOS FINANCEIROS</div>
            <div style={{ color: '#4a4a7a', fontSize: 11, marginBottom: 10 }}>Informe pelo menos um critério. Campo vazio = não avaliar.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Input label="Teto seller (%)" value={form.max_seller_discount_pct} onChange={v => set('max_seller_discount_pct', v)} placeholder="Ex: 15" type="number" />
              <Input label="Preço mín. (R$)" value={form.min_sale_price} onChange={v => set('min_sale_price', v)} placeholder="Ex: 20.00" type="number" />
              <Input label="Receb. mín. (R$)" value={form.min_net_receivable} onChange={v => set('min_net_receivable', v)} placeholder="Ex: 10.00" type="number" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>MODO DE ATIVAÇÃO</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => set('activation_mode', 'conservative')}
                style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  background: form.activation_mode === 'conservative' ? '#60a5fa22' : '#0a0a1a',
                  border: '1px solid ' + (form.activation_mode === 'conservative' ? '#60a5fa' : '#2a2a4a'),
                  color: form.activation_mode === 'conservative' ? '#60a5fa' : '#7070a0' }}>
                🛡️ Conservador
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.8 }}>Menor desconto do seller na faixa</div>
              </button>
              <button onClick={() => set('activation_mode', 'aggressive')}
                style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  background: form.activation_mode === 'aggressive' ? '#f59e0b22' : '#0a0a1a',
                  border: '1px solid ' + (form.activation_mode === 'aggressive' ? '#f59e0b' : '#2a2a4a'),
                  color: form.activation_mode === 'aggressive' ? '#f59e0b' : '#7070a0' }}>
                ⚡ Agressivo
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.8 }}>Maior desconto dentro do teto</div>
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              <span style={{ color: form.active ? '#22c55e' : '#7070a0', fontWeight: 600 }}>{form.active ? '🔥 Ativo (busca promoções ao criar)' : '📴 Inativo (criar e configurar primeiro)'}</span>
            </label>
          </div>

          {error && (
            <div style={{ background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: '11px', background: '#22c55e', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '⏳ Criando...' : '✅ Criar Cenário'}
            </button>
            <button onClick={() => router.push('/admin/promocoes')} style={{ padding: '11px 20px', background: 'transparent', border: '1px solid #2a2a4a', borderRadius: 8, color: '#7070a0', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>

        {/* Info */}
        <div style={{ marginTop: 16, background: '#0a1a3a', border: '1px solid #1a3a6a', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85em', marginBottom: 6 }}>📖 Como funciona</div>
          <div style={{ color: '#7070a0', fontSize: '0.8em', lineHeight: 1.6 }}>
            Cada cenário define <strong style={{ color: '#d0c0ff' }}>regras AND</strong>: todas precisam ser respeitadas.<br/>
            <strong style={{ color: '#d0c0ff' }}>Conservador</strong> = usa o menor desconto do seller na faixa (preserva margem).<br/>
            <strong style={{ color: '#d0c0ff' }}>Agressivo</strong> = usa o maior desconto possível sem violar regras.<br/>
            Cupom e Pix cumulativos são <strong style={{ color: '#fbbf24' }}>detectados e mostrados</strong>, mas <strong style={{ color: '#ef4444' }}>não estimados</strong>.
          </div>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', mono = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: mono ? 'monospace' : undefined }} />
    </div>
  )
}
