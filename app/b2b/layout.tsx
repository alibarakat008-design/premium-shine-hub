'use client'

/**
 * LAYOUT B2B
 * - Header com nome do cliente + logout
 * - Sidebar simples com 5 itens
 * - Tracking automático de page_view
 */

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function B2bLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [cliente, setCliente] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verifica sessão
    fetch('/api/b2b/dashboard')
      .then((r) => {
        if (r.status === 401) {
          router.push('/b2b/login')
          return null
        }
        return r.json()
      })
      .then((j) => {
        if (j && j.ok) {
          setCliente(j.cliente || null)
        }
        setLoading(false)
      })

    // Track page view
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem('b2b_session_id', sessionId)
    const startTime = Date.now()

    fetch('/api/audit/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'page_view',
        page: pathname,
        session_id: sessionId,
      }),
    }).catch(() => {})

    return () => {
      const duration = Date.now() - startTime
      // Track time on page (best effort, não bloqueia)
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/audit/track', JSON.stringify({
          event_type: 'page_view_end',
          page: pathname,
          duration_ms: duration,
          session_id: sessionId,
        }))
      }
    }
  }, [pathname, router])

  // Track clicks
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest('button, a, [data-track]')
      if (!btn) return
      const action = btn.textContent?.trim().slice(0, 50) || btn.getAttribute('data-track') || 'unknown'
      const sessionId = sessionStorage.getItem('b2b_session_id')
      fetch('/api/audit/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'click',
          page: pathname,
          action,
          session_id: sessionId,
        }),
      }).catch(() => {})
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [pathname])

  const logout = async () => {
    await fetch('/api/b2b/auth/logout', { method: 'POST' })
    router.push('/b2b/login')
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafbfc' }}>Carregando...</div>
  }

  const navItems = [
    { href: '/b2b/dashboard', emoji: '📊', label: 'Dashboard' },
    { href: '/b2b/vendas', emoji: '💰', label: 'Vendas' },
    { href: '/b2b/produtos', emoji: '🛍️', label: 'Produtos' },
    { href: '/b2b/relatorios', emoji: '📑', label: 'Relatórios' },
    { href: '/b2b/marketplace', emoji: '🔗', label: 'Marketplace' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 220, background: 'white', borderRight: '1px solid #e5e7eb', position: 'fixed', top: 0, left: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700 }}>PS</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Premium Shine</div>
              <div style={{ fontSize: 9, color: '#6b7280' }}>Portal B2B</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {navItems.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + '/')
            return (
              <div key={it.href} onClick={() => router.push(it.href)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: active ? '#eff6ff' : 'transparent', color: active ? '#3b82f6' : '#374151', fontSize: 13, fontWeight: active ? 600 : 500 }}>
                <span style={{ fontSize: 16 }}>{it.emoji}</span>
                {it.label}
              </div>
            )
          })}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fafbfc', borderRadius: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
              {cliente?.nome?.charAt(0).toUpperCase() || 'B'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente?.nome || 'B2B'}</div>
              <div style={{ fontSize: 9, color: '#6b7280' }}>{cliente?.empresa || ''}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width: '100%', marginTop: 8, padding: 6, background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>🚪 Sair</button>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: 220 }}>{children}</main>
    </div>
  )
}
