'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Vendedora {
  id: string
  nome: string
  email: string
  telefone: string | null
  cpf_cnpj: string | null
  ativo: boolean
  vendas_mes: { quantidade: number; valor: number; comissao: number }
  meta: { valor: number; quantidade: number; percentual_atingido: number }
  comissao_config: { tipo: string; pct: number; valor_fixo: number }
  vendedora_data?: any
  last_login: string | null
  created_at: string
}

export default function VendedorasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch('/api/vendedoras')
      .then(r => r.json())
      .then(j => { if (j.success) setVendedoras(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [])

  if (status === 'loading' || loading) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  // Stats
  const totalVendas = vendedoras.reduce((acc, v) => acc + v.vendas_mes.valor, 0)
  const totalComissao = vendedoras.reduce((acc, v) => acc + v.vendas_mes.comissao, 0)
  const totalPedidos = vendedoras.reduce((acc, v) => acc + v.vendas_mes.quantidade, 0)
  const ativas = vendedoras.filter(v => v.ativo).length

  // Ranking (já vem ordenado? não, vou ordenar)
  const ranking = [...vendedoras].sort((a, b) => b.vendas_mes.valor - a.vendas_mes.valor)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>👩‍💼 Vendedoras</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Gestão de vendedoras, metas, comissões e ranking</div>
          </div>
          <button onClick={() => setOpen(true)} style={{ padding: '12px 24px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            + Nova Vendedora
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="👩‍💼 Ativas" value={ativas} color="#a78bfa" />
          <Card label="📦 Pedidos no Mês" value={totalPedidos} color="#60a5fa" />
          <Card label="💰 Vendas no Mês" value={`R$ ${totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="#22c55e" />
          <Card label="💸 Comissões" value={`R$ ${totalComissao.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="#eab308" />
        </div>

        {/* Ranking */}
        {ranking.length > 0 && (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <h3 style={{ color: '#a78bfa', margin: '0 0 12px 0' }}>🏆 Ranking do Mês</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ranking.slice(0, 5).map((v, i) => {
                const pctMeta = Math.min(v.meta.percentual_atingido, 200)
                return (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#0a0a1a', borderRadius: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: i === 0 ? '#eab308' : i === 1 ? '#b0b0cc' : i === 2 ? '#cd7f32' : '#2a2a4a', color: i < 3 ? '#000' : '#7070a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{v.nome}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>{v.vendas_mes.quantidade} pedidos</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 200 }}>
                      <div style={{ color: '#22c55e', fontWeight: 700 }}>R$ {v.vendas_mes.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Meta: {v.meta.percentual_atingido.toFixed(0)}%</div>
                      <div style={{ height: 4, background: '#1a1a3a', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pctMeta, 100)}%`, height: '100%', background: pctMeta >= 100 ? '#22c55e' : pctMeta >= 70 ? '#eab308' : '#a78bfa' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Lista */}
        {vendedoras.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 60, textAlign: 'center', color: '#7070a0' }}>
            Nenhuma vendedora cadastrada. Clique em "+ Nova Vendedora".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {vendedoras.map(v => {
              const pct = v.meta.percentual_atingido
              const corPct = pct >= 100 ? '#22c55e' : pct >= 70 ? '#eab308' : '#a78bfa'
              return (
                <div key={v.id} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: 16, opacity: v.ativo ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#a78bfa', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3em', fontWeight: 700 }}>
                      {v.nome.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0c0ff', fontWeight: 700 }}>{v.nome}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.75em' }}>{v.email}</div>
                    </div>
                    <div style={{ padding: '2px 8px', background: v.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: v.ativo ? '#22c55e' : '#ef4444', borderRadius: 4, fontSize: '0.7em', fontWeight: 600 }}>
                      {v.ativo ? 'Ativa' : 'Inativa'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: '0.85em' }}>
                    <div><span style={{ color: '#7070a0' }}>Vendas/mês:</span> <span style={{ color: '#22c55e', fontWeight: 600 }}>R$ {v.vendas_mes.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Pedidos:</span> <span style={{ color: '#b0b0cc' }}>{v.vendas_mes.quantidade}</span></div>
                    <div><span style={{ color: '#7070a0' }}>Comissão:</span> <span style={{ color: '#eab308', fontWeight: 600 }}>R$ {v.vendas_mes.comissao.toFixed(0)}</span></div>
                    <div><span style={{ color: '#7070a0' }}>% Comissão:</span> <span style={{ color: '#a78bfa' }}>{v.comissao_config.pct}%</span></div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
                      <span style={{ color: '#7070a0' }}>Meta: R$ {v.meta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                      <span style={{ color: corPct, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, background: '#0a0a1a', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: corPct }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {open && <NovaVendedoraModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />}
    </div>
  )
}

function NovaVendedoraModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nome: '', email: '', telefone: '', cpf: '', password: 'vendedora123',
    comissao_pct: 10, meta_valor: 5000, pix_key: '', observacao: '',
  })
  const [saving, setSaving] = useState(false)

  async function salvar() {
    if (!form.nome || !form.email) return alert('Nome e email obrigatórios')
    setSaving(true)
    try {
      const res = await apiFetch('/api/vendedoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (j.success) {
        alert('✅ Vendedora criada!')
        onSaved()
      } else {
        alert('❌ ' + j.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#a78bfa' }}>+ Nova Vendedora</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#b0b0cc', cursor: 'pointer', fontSize: '1.5em' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={input} />
          <input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={input} />
          <input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} style={input} />
          <input placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} style={input} />
          <input placeholder="Senha inicial" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={input} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="number" step="0.1" placeholder="% Comissão" value={form.comissao_pct} onChange={(e) => setForm({ ...form, comissao_pct: parseFloat(e.target.value) || 0 })} style={input} />
            <input type="number" placeholder="Meta R$" value={form.meta_valor} onChange={(e) => setForm({ ...form, meta_valor: parseFloat(e.target.value) || 0 })} style={input} />
          </div>
          <input placeholder="Chave PIX" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} style={input} />
          <textarea placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={salvar} disabled={saving} style={{ flex: 1, padding: '12px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? '⏳ Salvando...' : '💾 Criar Vendedora'}
          </button>
          <button onClick={onClose} style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }
