'use client'

/**
 * ADMIN AUDIT DE ACESSOS
 * - Lista de eventos de comportamento (page_view, click, login, etc)
 * - Resumo por cliente e por página
 * - Filtros: cliente, evento, página, período
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

type Evento = {
  id: string
  b2b_client_id: string | null
  event_type: string
  page: string | null
  action: string | null
  metadata: any
  ip_address: string | null
  user_agent: string | null
  duration_ms: number | null
  created_at: string
  b2b_clients: { id: string; nome: string; email: string; empresa: string | null } | null
}

const EVENT_COLORS: any = {
  page_view: '#3b82f6',
  click: '#8b5cf6',
  login: '#10b981',
  logout: 'var(--psh-text-secondary, #6b7280)',
  export: '#f59e0b',
  download: '#f59e0b',
  form_submit: '#06b6d4',
  error: '#ef4444',
}

export default function AuditAcessosPage() {
  const searchParams = useSearchParams()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [porCliente, setPorCliente] = useState<any[]>([])
  const [porPage, setPorPage] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [b2bFilter, setB2bFilter] = useState(searchParams.get('b2b_client_id') || 'todos')
  const [eventFilter, setEventFilter] = useState('todos')
  const [b2bs, setB2bs] = useState<any[]>([])

  useEffect(() => {
    apiFetch('/api/admin/b2b-clients')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setB2bs(j.clientes || []) })
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ days: String(days), limit: '200' })
    if (b2bFilter !== 'todos') params.set('b2b_client_id', b2bFilter)
    if (eventFilter !== 'todos') params.set('event_type', eventFilter)
    apiFetch('/api/admin/audit-acessos?${params}')
      .then((r) => r.json())
      .then((j) => { setEventos(j.eventos || []); setPorCliente(j.por_cliente || []); setPorPage(j.por_page || []); setLoading(false) })
  }, [days, b2bFilter, eventFilter])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>👁️ Audit de Acessos</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12, margin: '2px 0 0 0' }}>O que cada B2B acessou e clicou</p>
        </div>
        <Link href="/admin/b2b-clients" style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', fontWeight: 500, textDecoration: 'none', fontSize: 12 }}>← Clientes B2B</Link>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={selectStyle}>
          <option value={1}>Último dia</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <select value={b2bFilter} onChange={(e) => setB2bFilter(e.target.value)} style={selectStyle}>
          <option value="todos">Todos clientes</option>
          {b2bs.map((b) => <option key={b.id} value={b.id}>{b.nome} ({b.email})</option>)}
        </select>
        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} style={selectStyle}>
          <option value="todos">Todos eventos</option>
          <option value="page_view">👁️ Page views</option>
          <option value="click">🖱️ Cliques</option>
          <option value="login">🔓 Logins</option>
          <option value="logout">🔒 Logouts</option>
          <option value="export">📥 Exports</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <ResumoPanel titulo="👥 Top Clientes" items={porCliente.slice(0, 10).map((c) => ({ id: c.id, primary: c.nome, secondary: c.email, value: c.count, subValue: `${c.total_pages} páginas • ${new Date(c.last_seen).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` }))} cor="#3b82f6" />
            <ResumoPanel titulo="📄 Top Páginas" items={porPage.slice(0, 10).map((p) => ({ primary: p.page, secondary: `${p.unique_users} usuários únicos`, value: p.count }))} cor="#8b5cf6" />
          </div>

          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>📜 Eventos ({eventos.length})</div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {eventos.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: EVENT_COLORS[e.event_type] || 'var(--psh-text-secondary, #6b7280)' }} />
                  <span style={{ minWidth: 80, fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span style={{ padding: '1px 6px', background: EVENT_COLORS[e.event_type] + '20', color: EVENT_COLORS[e.event_type], borderRadius: 3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', minWidth: 70, textAlign: 'center' }}>{e.event_type}</span>
                  <span style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 500 }}>{e.b2b_clients?.nome || 'Anônimo'}</span>
                  {e.page && <span style={{ color: 'var(--psh-text-secondary, #6b7280)', fontFamily: 'monospace' }}>{e.page}</span>}
                  {e.action && <span style={{ color: '#3b82f6', fontStyle: 'italic' }}>→ {e.action.slice(0, 40)}</span>}
                  {e.duration_ms && <span style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 9 }}>({e.duration_ms}ms)</span>}
                </div>
              ))}
              {eventos.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum evento no período</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ResumoPanel({ titulo, items, cor }: { titulo: string; items: { id?: string; primary: string; secondary?: string; value: number; subValue?: string }[]; cor: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.primary}</div>
              {it.secondary && <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #6b7280)' }}>{it.secondary}</div>}
              {it.subValue && <div style={{ fontSize: 9, color: 'var(--psh-text-secondary, #9ca3af)' }}>{it.subValue}</div>}
            </div>
            <div style={{ fontWeight: 700, color: cor, fontSize: 13 }}>{it.value}</div>
          </div>
        ))}
        {items.length === 0 && <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, textAlign: 'center' }}>Sem dados</div>}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
