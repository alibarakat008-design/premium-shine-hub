'use client'

/**
 * AUDIT LOG
 * Rastreabilidade de mudanças críticas no sistema
 * - Quem mudou, o quê, quando
 * - Filtros: ação, tabela, período, usuário
 * - Detalhe expandível pra ver antes/depois
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Log = {
  id: string
  acao: string
  tabela: string | null
  registro_id: string | null
  dados_anteriores: any
  dados_novos: any
  ip_address: string | null
  user_agent: string | null
  created_at: string
  usuario: { id: string; nome: string; email: string } | null
}

type Resumo = {
  total: number
  por_acao: Record<string, number>
  por_tabela: Record<string, number>
  por_usuario: { id: string; nome: string; email: string; count: number }[]
}

const ACOES_COMUNS = [
  'product.create', 'product.update', 'product.delete',
  'product.price_change', 'product.cost_change', 'product.stock_change',
  'order.status_change', 'order.cancel',
  'listing.sync', 'listing.update',
  'goal.update', 'cost.create', 'cost.update',
  'auth.login', 'auth.logout',
]

const ACOES_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  'product.create': { label: 'Produto criado', emoji: '✨', color: '#10b981' },
  'product.update': { label: 'Produto atualizado', emoji: '✏️', color: '#3b82f6' },
  'product.delete': { label: 'Produto excluído', emoji: '🗑️', color: '#ef4444' },
  'product.price_change': { label: 'Preço alterado', emoji: '💰', color: '#f59e0b' },
  'product.cost_change': { label: 'Custo alterado', emoji: '💵', color: '#f59e0b' },
  'product.stock_change': { label: 'Estoque alterado', emoji: '📦', color: '#8b5cf6' },
  'order.status_change': { label: 'Status do pedido', emoji: '🔄', color: '#06b6d4' },
  'order.cancel': { label: 'Pedido cancelado', emoji: '❌', color: '#ef4444' },
  'listing.sync': { label: 'Listing sincronizado', emoji: '🔄', color: '#3b82f6' },
  'listing.update': { label: 'Listing atualizado', emoji: '✏️', color: '#3b82f6' },
  'goal.update': { label: 'Meta atualizada', emoji: '🎯', color: '#8b5cf6' },
  'cost.create': { label: 'Custo criado', emoji: '➕', color: '#10b981' },
  'cost.update': { label: 'Custo atualizado', emoji: '✏️', color: '#3b82f6' },
  'auth.login': { label: 'Login', emoji: '🔓', color: '#10b981' },
  'auth.logout': { label: 'Logout', emoji: '🔒', color: 'var(--psh-text-secondary, #6b7280)' },
}

const fmt = (d: string) => {
  const date = new Date(d)
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const fmtAgo = (d: string) => {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const dd = Math.floor(h / 24)
  return `${dd}d`
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [acaoFilter, setAcaoFilter] = useState('todas')
  const [tabelaFilter, setTabelaFilter] = useState('todas')
  const [expandido, setExpandido] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ days: String(days) })
      if (acaoFilter !== 'todas') params.set('acao', acaoFilter)
      if (tabelaFilter !== 'todas') params.set('tabela', tabelaFilter)
      const r = await apiFetch(`/api/admin/audit-log?${params}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setLogs(j.logs)
      setResumo({ total: j.total, por_acao: j.por_acao, por_tabela: j.por_tabela, por_usuario: j.por_usuario })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days, acaoFilter, tabelaFilter])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  const tabelas = Object.keys(resumo?.por_tabela || {})

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📜 Audit Log</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Rastreabilidade de mudanças no sistema</p>
        </div>
        <Link href="/admin/configuracoes" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Configurações</Link>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}

      {/* KPIs */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi label="Eventos" value={resumo.total} color="#3b82f6" />
          <Kpi label="Tipos de ação" value={Object.keys(resumo.por_acao).length} color="#8b5cf6" />
          <Kpi label="Tabelas afetadas" value={Object.keys(resumo.por_tabela).length} color="#10b981" />
          <Kpi label="Usuários ativos" value={resumo.por_usuario.length} color="#f59e0b" />
        </div>
      )}

      {/* Top ações/usuários */}
      {resumo && (resumo.por_usuario.length > 0 || Object.keys(resumo.por_acao).length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
          {resumo.por_usuario.length > 0 && (
            <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 8 }}>👤 TOP USUÁRIOS</div>
              {resumo.por_usuario.slice(0, 5).map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--psh-text-primary, #374151)' }}>{u.nome || u.email}</span>
                  <span style={{ background: '#eef2ff', color: '#4338ca', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{u.count}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(resumo.por_acao).length > 0 && (
            <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 8 }}>⚡ TOP AÇÕES</div>
              {Object.entries(resumo.por_acao)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([k, v]) => {
                  const info = ACOES_LABELS[k] || { label: k, emoji: '⚙️', color: 'var(--psh-text-secondary, #6b7280)' }
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                      <span style={{ color: 'var(--psh-text-primary, #374151)' }}>{info.emoji} {info.label}</span>
                      <span style={{ background: 'var(--psh-bg-secondary, #f3f4f6)', color: 'var(--psh-text-primary, #374151)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{v}</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value={1}>Hoje</option>
          <option value={3}>3 dias</option>
          <option value={7}>7 dias</option>
          <option value={15}>15 dias</option>
          <option value={30}>30 dias</option>
        </select>
        <select value={acaoFilter} onChange={(e) => setAcaoFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="todas">Todas ações</option>
          {ACOES_COMUNS.map((a) => (
            <option key={a} value={a}>{ACOES_LABELS[a]?.label || a}</option>
          ))}
        </select>
        {tabelas.length > 0 && (
          <select value={tabelaFilter} onChange={(e) => setTabelaFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
            <option value="todas">Todas tabelas</option>
            {tabelas.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando...</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📜</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Nenhum evento encontrado</div>
          <div style={{ fontSize: 12 }}>O audit log registra mudanças em produtos, pedidos, preços, custos, etc.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {logs.map((l) => {
              const info = ACOES_LABELS[l.acao || ''] || { label: l.acao, emoji: '⚙️', color: 'var(--psh-text-secondary, #6b7280)' }
              const expandidoAqui = expandido === l.id
              return (
                <div key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <div
                    onClick={() => setExpandido(expandidoAqui ? null : l.id)}
                    style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: expandidoAqui ? 'var(--psh-bg-secondary, #fafbfc)' : 'white' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: info.color + '20', color: info.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{info.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--psh-text-primary, #111827)' }}>{info.label}</span>
                        {l.tabela && <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', background: 'var(--psh-bg-secondary, #f3f4f6)', padding: '1px 6px', borderRadius: 3 }}>{l.tabela}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{l.usuario?.nome || l.usuario?.email || 'Sistema'}</span>
                        {l.ip_address && <span>• {l.ip_address}</span>}
                        <span>• {fmtAgo(l.created_at)} atrás</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #9ca3af)' }}>{fmt(l.created_at)}</div>
                    <span style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11, transform: expandidoAqui ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                  {expandidoAqui && (
                    <div style={{ padding: '12px 16px 16px 56px', background: 'var(--psh-bg-secondary, #fafbfc)', fontSize: 12 }}>
                      {l.registro_id && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600 }}>ID: </span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--psh-text-primary, #374151)' }}>{l.registro_id}</span>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Antes</div>
                          <pre style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 4, padding: 8, fontSize: 10, color: 'var(--psh-text-primary, #374151)', maxHeight: 200, overflow: 'auto', margin: 0 }}>
                            {l.dados_anteriores ? JSON.stringify(l.dados_anteriores, null, 2) : '—'}
                          </pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Depois</div>
                          <pre style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 4, padding: 8, fontSize: 10, color: 'var(--psh-text-primary, #374151)', maxHeight: 200, overflow: 'auto', margin: 0 }}>
                            {l.dados_novos ? JSON.stringify(l.dados_novos, null, 2) : '—'}
                          </pre>
                        </div>
                      </div>
                      {l.user_agent && (
                        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>
                          <strong>UA:</strong> {l.user_agent}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value.toLocaleString('pt-BR')}</div>
    </div>
  )
}
