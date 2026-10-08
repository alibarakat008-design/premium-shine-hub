'use client'

// Componente de notificações com badge e dropdown
// Mostra alertas críticos: estoque, token, vendas, custos

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Notificacao = {
  id: string
  tipo: 'critica' | 'atencao' | 'sucesso' | 'info'
  emoji: string
  titulo: string
  subtitulo: string
  link?: string
  criado_em: string
}

const TIPO_BG: Record<string, string> = {
  critica: '#fee2e2',
  atencao: '#fef3c7',
  sucesso: '#d1fae5',
  info: '#dbeafe',
}
const TIPO_BORDER: Record<string, string> = {
  critica: '#ef4444',
  atencao: '#f59e0b',
  sucesso: '#10b981',
  info: '#3b82f6',
}
const TIPO_LABEL: Record<string, string> = {
  critica: 'Crítico',
  atencao: 'Atenção',
  sucesso: 'Sucesso',
  info: 'Info',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [counts, setCounts] = useState({ total: 0, critica: 0, atencao: 0 })
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifs = async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/notifications', {
      })
      const j = await r.json()
      if (j.ok) {
        setNotificacoes(j.notificacoes)
        setCounts(j.counts)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 60000) // 1min
    return () => clearInterval(interval)
  }, [])
  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const totalBadge = counts.critica + counts.atencao
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#6b7280',
          fontSize: '1.1em',
          padding: 4,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
        title="Notificações"
      >
        🔔
        {totalBadge > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: counts.critica > 0 ? '#ef4444' : '#f59e0b',
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          >
            {totalBadge}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 400,
            maxHeight: 540,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #e5e7eb',
              background: '#fafbfc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Notificações</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {counts.critica > 0 && (
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{counts.critica} crítico{counts.critica > 1 ? 's' : ''}</span>
                )}
                {counts.critica > 0 && counts.atencao > 0 && ' • '}
                {counts.atencao > 0 && (
                  <span style={{ color: '#f59e0b' }}>{counts.atencao} atenção</span>
                )}
                {counts.critica === 0 && counts.atencao === 0 && 'Tudo certo! 🎉'}
              </div>
            </div>
            <button
              onClick={fetchNotifs}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Atualizar"
            >
              ↻
            </button>
          </div>
          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && notificacoes.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
            ) : notificacoes.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Tudo certo!</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Nenhum alerta pendente</div>
              </div>
            ) : (
              notificacoes.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || '#'}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    borderBottom: '1px solid #f3f4f6',
                    textDecoration: 'none',
                    background: TIPO_BG[n.tipo] + '20',
                    borderLeft: `3px solid ${TIPO_BORDER[n.tipo]}`,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = TIPO_BG[n.tipo])}
                  onMouseLeave={(e) => (e.currentTarget.style.background = TIPO_BG[n.tipo] + '20')}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ fontSize: 20, flexShrink: 0 }}>{n.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{n.titulo}</span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: TIPO_BORDER[n.tipo],
                            color: 'white',
                            textTransform: 'uppercase',
                          }}
                        >
                          {TIPO_LABEL[n.tipo]}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{n.subtitulo}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
          {/* Footer */}
          <div style={{ padding: 10, borderTop: '1px solid #e5e7eb', background: '#fafbfc', textAlign: 'center' }}>
            <Link
              href="/admin/alertas"
              onClick={() => setOpen(false)}
              style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}
            >
              Ver todos os alertas →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
