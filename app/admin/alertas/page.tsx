'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Alerta {
  id: string
  tipo: string
  severidade: string
  titulo: string
  mensagem: string
  entidade_tipo: string | null
  entidade_id: string | null
  acao_url: string | null
  lido: boolean | null
  resolvido: boolean | null
  created_at: string
}

const TIPO_INFO: Record<string, { emoji: string; label: string; cor: string }> = {
  preco_fora: { emoji: '💸', label: 'Preço Fora', cor: '#ef4444' },
  estoque_critico: { emoji: '📦', label: 'Estoque', cor: '#f97316' },
  venda_suspeita: { emoji: '⚠️', label: 'Venda Suspeita', cor: '#eab308' },
  giro_lento: { emoji: '💤', label: 'Giro Lento', cor: '#60a5fa' },
  margem_baixa: { emoji: '📉', label: 'Margem Baixa', cor: '#ef4444' },
  outro: { emoji: '🔔', label: 'Outro', cor: '#a78bfa' },
}

const SEV_COR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f97316',
  info: '#60a5fa',
}

export default function AlertasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'resolvidos'>('pendentes')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    fetch('/api/alertas').then(r => r.json()).then(j => { if (j.success) setAlertas(j.data); setLoading(false) })
  }

  useEffect(load, [])

  async function gerar() {
    setGerando(true)
    try {
      const res = await apiFetch('/api/alertas/gerar', { method: 'POST' })
      const j = await res.json()
      alert(j.success ? `✅ ${j.message}` : `❌ ${j.error}`)
      load()
    } finally {
      setGerando(false)
    }
  }

  async function marcar(id: string, campo: 'lido' | 'resolvido', valor: boolean) {
    await apiFetch(`/api/alertas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    load()
  }

  const filtrados = alertas.filter(a => {
    if (filtro === 'pendentes') return !a.resolvido
    if (filtro === 'resolvidos') return a.resolvido
    return true
  })

  const stats = {
    critical: alertas.filter(a => a.severidade === 'critical' && !a.resolvido).length,
    warning: alertas.filter(a => a.severidade === 'warning' && !a.resolvido).length,
    info: alertas.filter(a => a.severidade === 'info' && !a.resolvido).length,
    resolvidos: alertas.filter(a => a.resolvido).length,
  }

  if (status === 'loading' || loading) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>🔔 Alertas Inteligentes</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Detecção automática de problemas: preço fora, estoque crítico, giro lento, etc</div>
          </div>
          <button onClick={gerar} disabled={gerando} style={{ padding: '12px 24px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 8, cursor: gerando ? 'wait' : 'pointer', fontWeight: 700, opacity: gerando ? 0.6 : 1 }}>
            {gerando ? '⏳ Analisando...' : '🔍 Gerar Alertas'}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="🚨 Críticos" value={stats.critical} color="#ef4444" />
          <Card label="⚠️ Avisos" value={stats.warning} color="#f97316" />
          <Card label="ℹ️ Info" value={stats.info} color="#60a5fa" />
          <Card label="✅ Resolvidos" value={stats.resolvidos} color="#22c55e" />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <FilterBtn active={filtro === 'pendentes'} onClick={() => setFiltro('pendentes')}>🔔 Pendentes</FilterBtn>
          <FilterBtn active={filtro === 'resolvidos'} onClick={() => setFiltro('resolvidos')}>✅ Resolvidos</FilterBtn>
          <FilterBtn active={filtro === 'todos'} onClick={() => setFiltro('todos')}>📋 Todos</FilterBtn>
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 60, textAlign: 'center', color: '#22c55e' }}>
            ✅ Nenhum alerta {filtro === 'pendentes' ? 'pendente' : ''}!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(a => {
              const tipo = TIPO_INFO[a.tipo] || TIPO_INFO.outro
              const cor = SEV_COR[a.severidade] || tipo.cor
              return (
                <div key={a.id} style={{
                  background: a.resolvido ? '#0a0a1a' : '#12122a',
                  border: `1px solid ${a.resolvido ? '#1a1a3a' : cor}`,
                  borderLeft: `4px solid ${cor}`,
                  borderRadius: 8, padding: 14, opacity: a.resolvido ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.2em' }}>{tipo.emoji}</span>
                        <span style={{ color: '#d0c0ff', fontWeight: 700 }}>{a.titulo}</span>
                        <span style={{ padding: '2px 8px', background: `${cor}30`, color: cor, borderRadius: 4, fontSize: '0.7em', fontWeight: 700, textTransform: 'uppercase' }}>
                          {a.severidade}
                        </span>
                        {a.resolvido && <span style={{ padding: '2px 8px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: 4, fontSize: '0.7em' }}>✅ RESOLVIDO</span>}
                      </div>
                      <div style={{ color: '#b0b0cc', fontSize: '0.85em', marginTop: 4 }}>{a.mensagem}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.7em', marginTop: 4 }}>
                        {new Date(a.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {a.acao_url && (
                        <a href={a.acao_url} target="_blank" style={{ padding: '6px 12px', background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: 4, textDecoration: 'none', fontSize: '0.8em' }}>
                          👁️ Ver
                        </a>
                      )}
                      {!a.resolvido && (
                        <button onClick={() => marcar(a.id, 'resolvido', true)} style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#22c55e', borderRadius: 4, cursor: 'pointer', fontSize: '0.8em' }}>
                          ✓ Resolver
                        </button>
                      )}
                      {!a.lido && !a.resolvido && (
                        <button onClick={() => marcar(a.id, 'lido', true)} style={{ padding: '6px 10px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 4, cursor: 'pointer', fontSize: '0.8em' }}>
                          Marcar lido
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.8em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px',
      background: active ? '#a78bfa' : 'transparent',
      color: active ? '#000' : '#b0b0cc',
      border: `1px solid ${active ? '#a78bfa' : '#2a2a4a'}`,
      borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85em',
    }}>
      {children}
    </button>
  )
}
