'use client'

/**
 * =====================================================
 * PÁGINA DE MONITORAMENTO DE CRONS
 * Premium Shine Hub
 * =====================================================
 * Mostra execuções recentes dos jobs automáticos
 * Caminho: app/admin/cron-logs/page.tsx
 * =====================================================
 */

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface CronLog {
  id: string
  tipo: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  data: any
}

interface Stats {
  total_execucoes: number
  duracao_media_ms: number
}

function CronLogsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [logs, setLogs] = useState<CronLog[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterTipo, setFilterTipo] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchLogs()
  }, [status, filterTipo])

  async function fetchLogs() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterTipo) params.append('tipo', filterTipo)
    params.append('limit', '50')

    try {
      const res = await fetch(`/api/cron/logs?${params}`)
      const json = await res.json()
      setLogs(json.data || [])
      setStats(json.stats || null)
    } catch (err) {
      console.error('Erro:', err)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ marginBottom: 16, fontSize: '0.85em' }}>
          <a href="/admin" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Dashboard</a>
        </div>

        <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>⏰ Monitor de Jobs Automáticos</h1>
        <div style={{ color: '#7070a0', fontSize: '0.9em', marginBottom: 24 }}>
          Histórico de execuções dos cron jobs
        </div>

        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statBox}>
              <div style={statLabel}>Execuções</div>
              <div style={{ ...statValue, color: '#a78bfa' }}>{stats.total_execucoes}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Duração Média</div>
              <div style={{ ...statValue, color: '#22c55e' }}>{(stats.duracao_media_ms / 1000).toFixed(1)}s</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>Status</div>
              <div style={{ ...statValue, color: '#22c55e', fontSize: '1.2em' }}>🟢 Operacional</div>
            </div>
          </div>
        )}

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} style={inputStyle}>
              <option value="">Todos os tipos</option>
              <option value="sync_marketplaces">🔄 Sync Marketplaces</option>
              <option value="sync_compras">Sugestão de Compras</option>
              <option value="dre_mensal">DRE Mensal</option>
            </select>
            <button onClick={fetchLogs} style={btnSecondary}>🔄 Atualizar</button>
            <div style={{ marginLeft: 'auto', color: '#7070a0', fontSize: '0.85em' }}>
              Jobs rodam a cada 1h (sync) e 1x/dia (compras/DRE)
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>
              Nenhuma execução registrada ainda. Os jobs rodam automaticamente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {logs.map((log) => {
                const tipoLabel: Record<string, { label: string; emoji: string; color: string }> = {
                  sync_marketplaces: { label: 'Sync Marketplaces', emoji: '🔄', color: '#60a5fa' },
                  sync_compras: { label: 'Sugestão de Compras', emoji: '🛒', color: '#eab308' },
                  dre_mensal: { label: 'DRE Mensal', emoji: '📊', color: '#a78bfa' },
                }
                const tipo = tipoLabel[log.tipo] || { label: log.tipo, emoji: '⚙️', color: '#888' }
                const statusColor = log.status === 'success' ? '#22c55e' : log.status === 'partial' ? '#eab308' : '#ef4444'

                return (
                  <div key={log.id} style={{ background: '#0d0d25', borderRadius: 10, padding: 16, borderLeft: `3px solid ${tipo.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.3em' }}>{tipo.emoji}</span>
                          <span style={{ color: tipo.color, fontWeight: 600, fontSize: '0.95em' }}>{tipo.label}</span>
                          <span style={{ background: `${statusColor}22`, color: statusColor, padding: '2px 10px', borderRadius: 12, fontSize: '0.75em', fontWeight: 600 }}>
                            {log.status === 'success' ? '✓ Sucesso' : log.status === 'partial' ? '⚠️ Parcial' : '❌ Erro'}
                          </span>
                        </div>
                        <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 4 }}>
                          Iniciado: {new Date(log.started_at).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {log.duration_ms && (
                          <div style={{ color: '#b0b0cc', fontSize: '0.9em' }}>
                            Duração: <strong style={{ color: '#a78bfa' }}>{(log.duration_ms / 1000).toFixed(1)}s</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {log.data?.results && log.data.results.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2a2a4a' }}>
                        <div style={{ color: '#7070a0', fontSize: '0.8em', marginBottom: 4 }}>
                          Contas processadas: {log.data.accounts_processed} · Pedidos importados: {log.data.total_orders_imported || 0}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {log.data.results.map((r: any, i: number) => (
                            <span key={i} style={{
                              fontSize: '0.75em',
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: r.status === 'success' ? 'rgba(34,197,94,0.2)' : r.status === 'skipped' ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)',
                              color: r.status === 'success' ? '#22c55e' : r.status === 'skipped' ? '#eab308' : '#ef4444',
                            }}>
                              {r.plataforma === 'mercado_livre' ? '🏪' : '🛒'} {r.nickname}: {r.orders_synced || 0} pedidos
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {log.data?.pedidos_criados !== undefined && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2a2a4a', color: '#b0b0cc', fontSize: '0.85em' }}>
                        💡 {log.data.pedidos_criados} pedidos de compra sugeridos criados
                      </div>
                    )}

                    {log.status === 'error' && log.data?.error && (
                      <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 6, color: '#ef4444', fontSize: '0.85em' }}>
                        ❌ {log.data.error}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, marginTop: 20, background: 'rgba(96,165,250,0.05)' }}>
          <h3 style={{ color: '#60a5fa', marginBottom: 8 }}>⏰ Sobre os Crons</h3>
          <ul style={{ color: '#b0b0cc', fontSize: '0.9em', paddingLeft: 20, lineHeight: 1.8 }}>
            <li><strong>Sync Marketplaces:</strong> Roda a cada 1h. Importa pedidos dos últimos 2 dias, atualiza produtos 1x/dia.</li>
            <li><strong>Sugestão de Compras:</strong> Roda 1x/dia às 6h. Detecta produtos com estoque crítico e gera pedido sugerido.</li>
            <li><strong>DRE Mensal:</strong> Roda dia 1 de cada mês. Gera PDF e salva no Google Drive.</li>
            <li><strong>Verificação de Estoque:</strong> A cada sync, gera alerta pra produtos críticos.</li>
            <li><strong>Produtos Parados:</strong> Detecta SKUs sem venda em 30+ dias.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const inputStyle = { padding: 8, background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: '0.9em' } as const
const statBox = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' as const }
const statLabel = { color: '#7070a0', fontSize: '0.7em', textTransform: 'uppercase' as const, marginBottom: 4 }
const statValue = { fontSize: '1.4em', fontWeight: 'bold' as const }
const btnSecondary = { padding: '8px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const

export default function CronLogsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#b0b0cc' }}>Carregando...</div>}>
      <CronLogsContent />
    </Suspense>
  )
}
