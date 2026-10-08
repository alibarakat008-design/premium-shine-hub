'use client'

/**
 * ADMIN CONVITES B2B
 * - Lista todos os convites (pendente/aceito/expirado/revogado)
 * - Botão "Convidar" abre modal
 * - Copia link de convite pra enviar manualmente
 * - Revoga convite pendente
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Invite = {
  id: string
  email: string
  nome: string | null
  empresa: string | null
  token: string
  mensagem: string | null
  plano: string
  status: 'pendente' | 'aceito' | 'expirado' | 'revogado'
  expira_em: string
  aceito_em: string | null
  created_at: string
}

const STATUS_COLORS: any = {
  pendente: '#f59e0b',
  aceito: '#10b981',
  expirado: 'var(--psh-text-secondary, #9ca3af)',
  revogado: '#ef4444',
}

export default function B2bInvitesPage() {
  const [convites, setConvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', nome: '', empresa: '', plano: 'basic', mensagem: '' })
  const [salvando, setSalvando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimoLink, setUltimoLink] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('todos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch('/api/admin/b2b-invites?status=${statusFilter}')
    const j = await r.json()
    if (j.ok) setConvites(j.convites || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const enviar = async () => {
    if (!form.email) { setError('Email obrigatório'); return }
    setError(null)
    setSalvando(true)
    try {
      const r = await apiFetch('/api/admin/b2b-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setUltimoLink(j.link)
      setOpen(false)
      setForm({ email: '', nome: '', empresa: '', plano: 'basic', mensagem: '' })
      fetchData()
    } catch (err: any) { setError(err.message) } finally { setSalvando(false) }
  }
  const revogar = async (id: string) => {
    if (!confirm('Revogar este convite?')) return
    await apiFetch('/api/admin/b2b-invites?id=${id}', { method: 'DELETE' })
    fetchData()
  }
  const copiarLink = (token: string) => {
    const link = `${window.location.origin}/b2b/aceitar-convite/${token}`
    navigator.clipboard.writeText(link)
    alert('Link copiado!')
  }
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>✉️ Convites B2B</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12, margin: '2px 0 0 0' }}>{convites.length} convites • expiram em 14 dias</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="todos">Todos status</option>
            <option value="pendente">Pendentes</option>
            <option value="aceito">Aceitos</option>
            <option value="expirado">Expirados</option>
            <option value="revogado">Revogados</option>
          </select>
          <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✉️ Convidar B2B</button>
        </div>
      </div>
      {ultimoLink && (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>✓ Convite criado!</div>
          <div style={{ fontSize: 10, color: '#047857', marginBottom: 6 }}>Copie o link abaixo e envie pro cliente (email, WhatsApp, etc):</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={ultimoLink} readOnly style={{ flex: 1, padding: '6px 10px', border: '1px solid #6ee7b7', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', background: 'var(--psh-bg-primary, white)' }} />
            <button onClick={() => navigator.clipboard.writeText(ultimoLink)} style={{ padding: '6px 12px', background: '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>📋 Copiar</button>
            <button onClick={() => setUltimoLink(null)} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : convites.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
          <h3 style={{ color: 'var(--psh-text-primary, #111827)', margin: '0 0 8px 0' }}>Nenhum convite ainda</h3>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Convide seu primeiro cliente B2B por email</p>
          <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✉️ Convidar agora</button>
        </div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                <th style={th}>Email</th>
                <th style={th}>Nome</th>
                <th style={th}>Empresa</th>
                <th style={th}>Plano</th>
                <th style={th}>Status</th>
                <th style={th}>Expira</th>
                <th style={th}>Ações</th>
              </tr></thead>
              <tbody>
                {convites.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{c.email}</td>
                    <td style={td}>{c.nome || '—'}</td>
                    <td style={td}>{c.empresa || '—'}</td>
                    <td style={td}><span style={{ padding: '2px 6px', background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 3, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{c.plano}</span></td>
                    <td style={td}><span style={{ padding: '2px 8px', background: STATUS_COLORS[c.status] + '20', color: STATUS_COLORS[c.status], borderRadius: 3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span></td>
                    <td style={{ ...td, fontSize: 11 }}>{new Date(c.expira_em).toLocaleDateString('pt-BR')}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => copiarLink(c.token)} style={{ padding: '4px 8px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>📋 Link</button>
                        {c.status === 'pendente' && (
                          <button onClick={() => revogar(c.id)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 500, maxWidth: '95vw', background: 'var(--psh-bg-primary, white)', borderRadius: 12, zIndex: 101, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 16px 0' }}>✉️ Convidar novo cliente B2B</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Email *">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@empresa.com" style={inputStyle} />
              </Field>
              <Field label="Nome do responsável">
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="João Silva" style={inputStyle} />
              </Field>
              <Field label="Empresa">
                <input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Loja do João" style={inputStyle} />
              </Field>
              <Field label="Plano inicial">
                <select value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })} style={inputStyle}>
                  <option value="basic">Basic (1 conta)</option>
                  <option value="pro">Pro (5 contas)</option>
                  <option value="enterprise">Enterprise (ilimitado)</option>
                </select>
              </Field>
              <Field label="Mensagem personalizada (opcional)">
                <textarea value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} placeholder="Oi! Te convidamos pro nosso portal..." style={{ ...inputStyle, minHeight: 60 }} />
              </Field>
              {error && <div style={{ padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>⚠️ {error}</div>}
              <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textAlign: 'center' }}>Convite expira em 14 dias. Após aceitar, o cliente ganha 14 dias de trial.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => setOpen(false)} style={{ flex: 1, padding: 10, background: 'var(--psh-bg-primary, white)', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={enviar} disabled={salvando} style={{ flex: 1, padding: 10, background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: salvando ? 'not-allowed' : 'pointer' }}>{salvando ? 'Criando...' : '✉️ Criar convite'}</button>
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
      <label style={{ display: 'block', fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', boxSizing: 'border-box' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
