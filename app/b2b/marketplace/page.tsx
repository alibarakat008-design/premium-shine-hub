'use client'

/**
 * B2B MARKETPLACE — Vincular contas
 * - Lista de contas vinculadas
 * - Adicionar nova (Mercado Livre, Shopee, etc)
 * - Remover
 */

import { useEffect, useState, useCallback } from 'react'

type Conta = {
  id: string
  plataforma: string
  nickname: string
  account_id: string | null
  email: string | null
  status: string
  ultima_sync: string | null
  total_pedidos: number
  total_receita: number
  created_at: string
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const STATUS_COLORS: any = { conectado: '#10b981', expirado: '#f59e0b', erro: '#ef4444', pausado: '#6b7280' }

export default function B2bMarketplacePage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ plataforma: 'mercado_livre', nickname: '', account_id: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/b2b/marketplace-accounts')
    const j = await r.json()
    if (j.ok) setContas(j.contas || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    setError(null)
    if (!form.nickname) { setError('Dá um nome pra identificar (ex: Minha Loja ML)'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/b2b/marketplace-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setOpen(false)
      setForm({ plataforma: 'mercado_livre', nickname: '', account_id: '', email: '' })
      fetchData()
    } catch (err: any) { setError(err.message) } finally { setSaving(false) }
  }

  const handleRemove = async (id: string, nickname: string) => {
    if (!confirm(`Remover conta "${nickname}"?`)) return
    await fetch(`/api/b2b/marketplace-accounts?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>🔗 Contas de Marketplace</h1>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0 0' }}>Vincule suas contas pra ver vendas, produtos e faturamento</p>
        </div>
        <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>➕ Vincular conta</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : contas.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <div style={{ fontSize: 48 }}>🔗</div>
          <h3 style={{ fontSize: 16, color: '#111827', margin: '8px 0' }}>Nenhuma conta vinculada</h3>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Vincule sua primeira conta de marketplace pra começar a ver suas vendas aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contas.map((c) => (
            <div key={c.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: c.plataforma === 'mercado_livre' ? '#ffe600' : c.plataforma === 'shopee' ? '#ee4d2d' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {c.plataforma === 'mercado_livre' ? '🛒' : c.plataforma === 'shopee' ? '🧡' : '🏪'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{c.nickname}</div>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{c.plataforma} {c.email ? `• ${c.email}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{fmtBRL(c.total_receita)}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{c.total_pedidos} pedidos</div>
              </div>
              <span style={{ padding: '2px 8px', background: STATUS_COLORS[c.status] + '20', color: STATUS_COLORS[c.status], borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span>
              <button onClick={() => handleRemove(c.id, c.nickname)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 480, maxWidth: '95vw', background: 'white', borderRadius: 12, zIndex: 101, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>🔗 Vincular Conta de Marketplace</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Plataforma">
                <select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })} style={inputStyle}>
                  <option value="mercado_livre">🛒 Mercado Livre</option>
                  <option value="shopee">🧡 Shopee</option>
                  <option value="site_b2c">🌐 Site próprio</option>
                  <option value="amazon">📦 Amazon</option>
                </select>
              </Field>
              <Field label="Nome / Apelido (pra você identificar)">
                <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="Ex: Minha Loja ML" style={inputStyle} />
              </Field>
              <Field label="ID da conta (opcional)">
                <input value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} placeholder="ML123456" style={inputStyle} />
              </Field>
              <Field label="Email da conta (opcional)">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vendedor@email.com" style={inputStyle} />
              </Field>
              {error && <div style={{ padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>⚠️ {error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => setOpen(false)} style={{ flex: 1, padding: 10, background: 'white', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleAdd} disabled={saving} style={{ flex: 1, padding: 10, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Salvando...' : '💾 Vincular'}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827', boxSizing: 'border-box' }
