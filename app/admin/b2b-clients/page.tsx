'use client'

/**
 * ADMIN B2B CLIENTS
 * - Lista todos os clientes B2B
 * - Stats: contas vinculadas, eventos 7d, último acesso
 * - Ativar/bloquear/resetar trial
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type B2b = {
  id: string
  email: string
  nome: string
  empresa: string | null
  cnpj: string | null
  telefone: string | null
  plano: string
  status: string
  trial_ate: string | null
  ultimo_login: string | null
  created_at: string
  _count: { marketplace_accounts: number; audit_events: number }
  stats: { eventos_7d: number; eventos_total: number; ultimo_evento: { created_at: string; event_type: string; page: string } | null }
}

const STATUS_COLORS: any = { ativo: '#10b981', trial: '#f59e0b', inativo: 'var(--psh-text-secondary, #6b7280)', bloqueado: '#ef4444' }
const PLANO_COLORS: any = { basic: 'var(--psh-text-secondary, #6b7280)', pro: '#3b82f6', enterprise: '#8b5cf6' }

export default function AdminB2bPage() {
  const [clientes, setClientes] = useState<B2b[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch('/api/admin/b2b-clients')
    const j = await r.json()
    if (j.ok) setClientes(j.clientes || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = clientes.filter((c) => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.email.toLowerCase().includes(busca.toLowerCase()) && !(c.empresa || '').toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>👥 Clientes B2B</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12, margin: '2px 0 0 0' }}>{clientes.length} clientes cadastrados</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/canais" style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🔀 Segmentação de Canais</Link>
          <Link href="/admin/b2b-invites" style={{ padding: '8px 16px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✉️ Convidar B2B</Link>
          <Link href="/admin/audit-acessos" style={{ padding: '8px 16px', background: '#8b5cf6', color: 'var(--psh-bg-primary, white)', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>👁️ Audit Acessos</Link>
        </div>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12 }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, email ou empresa..." style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
          <option value="todos">Todos status</option>
          <option value="trial">Trial</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          {clientes.length === 0 ? 'Nenhum cliente B2B cadastrado ainda' : 'Nenhum resultado'}
        </div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)' }}>
                  <th style={th}>Cliente</th>
                  <th style={th}>Email</th>
                  <th style={th}>Plano</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'center' }}>Contas</th>
                  <th style={{ ...th, textAlign: 'center' }}>Eventos 7d</th>
                  <th style={th}>Última atividade</th>
                  <th style={th}>Último login</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}><div style={{ fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>{c.nome}</div><div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{c.empresa || '—'}</div></td>
                    <td style={{ ...td, fontSize: 11 }}>{c.email}</td>
                    <td style={td}><span style={{ padding: '2px 8px', background: PLANO_COLORS[c.plano] + '20', color: PLANO_COLORS[c.plano], borderRadius: 3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.plano}</span></td>
                    <td style={td}><span style={{ padding: '2px 8px', background: STATUS_COLORS[c.status] + '20', color: STATUS_COLORS[c.status], borderRadius: 3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span></td>
                    <td style={{ ...td, textAlign: 'center' }}>{c._count.marketplace_accounts}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ padding: '2px 6px', background: c.stats.eventos_7d > 10 ? '#dbeafe' : 'var(--psh-bg-secondary, #f3f4f6)', color: c.stats.eventos_7d > 10 ? '#1e40af' : 'var(--psh-text-primary, #374151)', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>{c.stats.eventos_7d}</span>
                    </td>
                    <td style={td}>
                      {c.stats.ultimo_evento ? (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{new Date(c.stats.ultimo_evento.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                          <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>{c.stats.ultimo_evento.event_type} • {c.stats.ultimo_evento.page?.slice(0, 25)}</div>
                        </div>
                      ) : <span style={{ color: 'var(--psh-text-secondary, #9ca3af)' }}>Nunca acessou</span>}
                    </td>
                    <td style={{ ...td, fontSize: 10 }}>{c.ultimo_login ? new Date(c.ultimo_login).toLocaleString('pt-BR') : '—'}</td>
                    <td style={td}>
                      <Link href={`/admin/audit-acessos?b2b_client_id=${c.id}`} style={{ padding: '3px 8px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', borderRadius: 4, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>👁️</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'middle' }
