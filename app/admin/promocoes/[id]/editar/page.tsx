'use client'

/**
 * PÁGINA: Editar Cenário de Promoção
 * Rota: /admin/promocoes/[id]/editar
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const AUTH = 'Basic ' + btoa('premium:shine2026')

export default function EditarCenarioPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/promo-scenarios/${id}`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.scenario) {
          const s = d.scenario
          setForm({
            product_name: s.product_name || '',
            mlb: s.mlb || '',
            max_seller_discount_pct: s.max_seller_discount_pct || '',
            min_sale_price: s.min_sale_price || '',
            min_net_receivable: s.min_net_receivable || '',
            activation_mode: s.activation_mode || 'conservative',
            active: !!s.active,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    // Validação
    if (!form.product_name.trim()) return setError('Nome do produto é obrigatório.')
    if (!form.mlb.trim()) return setError('MLB é obrigatório.')
    if (!form.max_seller_discount_pct && !form.min_sale_price && !form.min_net_receivable) {
      return setError('Pelo menos um critério financeiro é obrigatório.')
    }

    setSaving(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/promo-scenarios/${id}`, {
        method: 'PUT',
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
        router.push(`/admin/promocoes/${id}`)
      } else {
        setError(d.error || 'Erro ao salvar.')
      }
    } catch { setError('Erro de conexão.') }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#d0c0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⏳</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ padding: '8px 16px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#a78bfa', cursor: 'pointer' }}>← Voltar</button>
          <h1 style={{ color: '#d0c0ff', margin: 0, fontSize: '1.5em' }}>✏️ Editar Cenário</h1>
        </div>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24 }}>
          <Input label="Nome do Produto *" value={form.product_name} onChange={v => set('product_name', v)} placeholder="Ex: Batom Líquido Rosa 3ml" />
          <Input label="MLB *" value={form.mlb} onChange={v => set('mlb', v)} placeholder="MLB123456789" mono />
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>CRITÉRIOS FINANCEIROS</div>
            <div style={{ color: '#4a4a7a', fontSize: 11, marginBottom: 10 }}>Preencha pelo menos um.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Input label="Teto seller (%)" value={form.max_seller_discount_pct} onChange={v => set('max_seller_discount_pct', v)} placeholder="Ex: 15" type="number" />
              <Input label="Preço mín. (R$)" value={form.min_sale_price} onChange={v => set('min_sale_price', v)} placeholder="Ex: 20.00" type="number" />
              <Input label="Receb. mín. (R$)" value={form.min_net_receivable} onChange={v => set('min_net_receivable', v)} placeholder="Ex: 10.00" type="number" />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>MODO</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {['conservative', 'aggressive'].map(m => (
                <button key={m} onClick={() => set('activation_mode', m)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    background: form.activation_mode === m ? (m === 'conservative' ? '#60a5fa22' : '#f59e0b22') : '#0a0a1a',
                    border: '1px solid ' + (form.activation_mode === m ? (m === 'conservative' ? '#60a5fa' : '#f59e0b') : '#2a2a4a'),
                    color: form.activation_mode === m ? (m === 'conservative' ? '#60a5fa' : '#f59e0b') : '#7070a0',
                  }}>
                  {m === 'conservative' ? '🛡️ Conservador' : '⚡ Agressivo'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              <span style={{ color: form.active ? '#22c55e' : '#7070a0', fontWeight: 600 }}>{form.active ? '🔥 Ativo' : '📴 Inativo'}</span>
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
              {saving ? '⏳ Salvando...' : '✅ Salvar'}
            </button>
            <button onClick={() => router.back()} style={{ padding: '11px 20px', background: 'transparent', border: '1px solid #2a2a4a', borderRadius: 8, color: '#7070a0', cursor: 'pointer' }}>
              Cancelar
            </button>
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
