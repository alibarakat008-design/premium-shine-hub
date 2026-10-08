'use client'

/**
 * LAYOUT ADMIN — Premium Shine Hub
 * Sidebar à esquerda estilo Metrify
 * - Logo no topo
 * - Conta ativa (clicável, com "Gerenciar contas")
 * - Menu lateral agrupado (com permissões por role)
 * - Conteúdo à direita
 * - ThemeToggle (light/dark) no canto superior direito
 * - CompanySwitcher (multi-tenant)
 *
 * PERMISSÕES:
 *   - role=matriz: vê tudo
 *   - role=parceiro/filial: vê SÓ dashboard, vendas-ao-vivo, dashboard-parceiro
 *   - GH SHOP / FLEUR: vê tudo (mesmo sidebar completo que LIURA)
 */

import { useRouter, usePathname } from 'next/navigation'
import ShopeeExtensionBanner from '@/app/components/ShopeeExtensionBanner'
import { useEffect, useState } from 'react'
import SidebarNavigation from './components/SidebarNavigation'
import { ADMIN_MENU, PARCEIRO_MENU, matchesRoute } from './components/navigation'
import NotificationBell from './components/NotificationBell'
import ThemeToggle from '../components/ThemeToggle'
import CompanySwitcher from '../components/CompanySwitcher'

// Páginas que SÓ a matriz pode ver
const MATRIZ_ONLY = [
  '/admin/empresas',
  '/admin/empresas/',
  '/admin/login-empresa',
  '/admin/cron-logs',
  '/admin/audit-log',
  '/admin/audit-acessos',
  '/admin/configuracoes',
  '/admin/ml-contas',
]

// GH SHOP / FLEUR: mesmo sidebar que LIURA (mesmo sendo account_type=parceiro)
const GH_SHOP_COMPANY_IDS = [
  'a2176d33-f604-48cf-8d8a-df4313ce1417', // GH SHOP / FLEUR
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [contaOpen, setContaOpen] = useState(false)
  const [sessionRole, setSessionRole] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  // Detecta role da sessão (cookie psh_auth_token do parceiro OU next-auth do admin)
  useEffect(() => {
    const fetchSession = async () => {
      try {
        // Tenta /api/auth/me primeiro (parceiro)
        const r1 = await fetch('/api/auth/me', { credentials: 'include' })
        const d1 = await r1.json()
        if (d1.ok && d1.user) {
          setSessionRole(d1.company?.account_type || null)
          setCompanyId(d1.company?.id || null)
          setAuthState('authenticated')
          return
        }

        // Fallback: /api/admin/login-empresa (multi-tenant antigo)
        const auth = btoa('premium:shine2026')
        const r2 = await fetch('/api/admin/login-empresa', {
          credentials: 'include',
          headers: { Authorization: `Basic ${auth}` },
        })
        const d2 = await r2.json()
        if (d2.ok && d2.session) {
          setSessionRole(d2.role)
          setCompanyId(d2.session?.company_id || null)
          setAuthState('authenticated')
          return
        }

        setAuthState('unauthenticated')
      } catch (e) {
        console.error('[layout] session fetch failed', e)
        setAuthState('unauthenticated')
      }
    }
    fetchSession()
  }, [])

  // Verifica permissão
  // GH SHOP / FLEUR: mesmo sidebar completo que LIURA (mesmo com account_type=parceiro)
  const isGhShop = companyId && GH_SHOP_COMPANY_IDS.includes(companyId)
  const isMatriz = isGhShop || !sessionRole || sessionRole === 'matriz'
  const canAccess = (href: string) => {
    if (isMatriz) return true
    return !MATRIZ_ONLY.some(p => href.startsWith(p))
  }

  // Detecta user logado (parceiro via /api/auth/me)
  const [authUser, setAuthUser] = useState<{ id: string; nome: string; email: string; company?: any } | null>(null)

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' })
        const data = await r.json()
        if (data.ok && data.user) {
          setAuthUser({
            id: data.user.id,
            nome: data.user.nome,
            email: data.user.email,
            company: data.company,
          })
        }
      } catch (e) {
        console.error('[layout] /api/auth/me failed', e)
      }
    }
    fetchMe()
  }, [])

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      })
      window.location.href = '/login-parceiro'
    } catch (e) {
      console.error('[layout] signout failed', e)
    }
  }

  // ====== Responsivo: sidebar drawer no mobile, fixa no desktop ======
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false) // drawer só vale no mobile
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        document.getElementById('admin-menu-toggle')?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isMobile, sidebarOpen])

  // Fecha drawer ao trocar de rota no mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile])

  const grupos = (isMatriz ? ADMIN_MENU : PARCEIRO_MENU)
    .map(group => ({ ...group, items: group.items.filter(item => canAccess(item.href)) }))
    .filter(group => group.items.length > 0)

  // Breadcrumb
  const allItems = grupos.flatMap(g => g.items)
  const currentItem = allItems.filter(i => matchesRoute(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  const tituloAtual = currentItem?.label || 'Admin'

  // Logo "Premium Shine" primeira letra de cada palavra
  const userName = authUser?.nome || 'Admin'
  const userEmail = authUser?.email || ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--psh-bg-primary)' }}>
      {/* Backdrop mobile - só aparece quando drawer aberto */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 199,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sidebar - estilo Metrify: clean, adaptativa tema, responsiva */}
      <aside id="admin-sidebar" aria-label="Menu principal" style={{
        width: isMobile ? 240 : 220,
        background: 'var(--psh-bg-secondary)',
        borderRight: '1px solid var(--psh-border-primary)',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100dvh',
        overflow: 'hidden',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        transform: isMobile
          ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)')
          : 'translateX(0)',
        transition: 'transform 0.25s ease',
        visibility: isMobile && !sidebarOpen ? 'hidden' : 'visible',
      }}>
        {isMobile && <button type="button" onClick={() => { setSidebarOpen(false); document.getElementById('admin-menu-toggle')?.focus() }} aria-label="Fechar menu lateral" style={{ alignSelf: 'flex-end', margin: '8px 10px 0', background: 'transparent', border: 0, color: 'var(--psh-text-secondary)', cursor: 'pointer', fontSize: 20 }}>×</button>}
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--psh-border-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #a78bfa, #f472b6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '1em',
            }}>PS</div>
            <div style={{ fontSize: '1.05em', fontWeight: 700, color: 'var(--psh-text-primary)' }}>Premium Shine</div>
          </div>
        </div>

        {/* Conta ativa */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--psh-border-secondary)', position: 'relative' }}>
          <div
            onClick={() => isMatriz && setContaOpen(!contaOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: isMatriz ? 'pointer' : 'default' }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: '#7c2d12', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.95em', position: 'relative',
            }}>
              {(authUser?.company?.nome || authUser?.nome || 'PS').substring(0, 5).toUpperCase()}
              <div style={{
                position: 'absolute', bottom: -2, right: -2, width: 12, height: 12,
                background: '#10b981', borderRadius: '50%', border: '2px solid var(--psh-bg-secondary)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--psh-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authUser?.company?.nome || authUser?.nome || 'Premium Shine'}
              </div>
              <div style={{ fontSize: '0.7em', color: 'var(--psh-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authUser?.email || ''}
              </div>
            </div>
            {isMatriz ? (
              <span style={{ color: 'var(--psh-text-muted)', fontSize: '0.8em' }}>⇅</span>
            ) : (
              <span style={{ fontSize: '0.85em' }} title={isGhShop ? "GH SHOP / FLEUR - menu completo" : "Conta parceira: vê só sua empresa"}>{isGhShop ? '✅' : '🔒'}</span>
            )}
          </div>
          {contaOpen && isMatriz && (
            <div style={{
              position: 'absolute', top: '100%', left: 16, right: 16, marginTop: 4,
              background: 'var(--psh-bg-secondary)', border: '1px solid var(--psh-border-primary)', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 300, padding: 4,
            }}>
              <div
                onClick={() => { setContaOpen(false); router.push('/admin/ml-contas') }}
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85em', color: 'var(--psh-text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--psh-hover-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                ⚙️ Gerenciar contas
              </div>
              <div
                onClick={() => { setContaOpen(false); router.push('/admin/ml-contas') }}
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85em', color: 'var(--psh-text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--psh-hover-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                + Conectar nova conta
              </div>
            </div>
          )}
        </div>

        {/* Same permitted navigation supplies the sidebar and page title. */}
        <SidebarNavigation groups={grupos} pathname={pathname} storageScope={isMatriz ? 'matriz' : 'parceiro'} onNavigate={() => setSidebarOpen(false)} />
        <div style={{ padding: 12, borderTop: '1px solid var(--psh-border-secondary)', fontSize: 11, color: 'var(--psh-text-muted)', textAlign: 'center' }}>
          Premium Shine Hub
        </div>
      </aside>

      {/* Conteúdo à direita */}
      <div style={{
        flex: 1,
        marginLeft: isMobile ? 0 : 220,
        background: 'var(--psh-bg-primary)',
        minWidth: 0, // evita overflow em tabelas
      }}>
        {/* Topbar */}
        <header style={{
          background: 'var(--psh-bg-secondary)',
          borderBottom: '1px solid var(--psh-border-primary)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 16,
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          {/* Botão hamburger - SÓ no mobile */}
          {isMobile && (
            <button
              id="admin-menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--psh-border-primary)',
                background: 'transparent',
                color: 'var(--psh-text-primary)',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ☰
            </button>
          )}
          <div style={{ color: 'var(--psh-text-muted)', fontSize: '0.85em' }}>Painel</div>
          <span style={{ color: 'var(--psh-text-muted)' }}>/</span>
          <div style={{ color: 'var(--psh-text-primary)', fontSize: '0.9em', fontWeight: 600 }}>{tituloAtual}</div>
          <div style={{ flex: 1 }} />
          {sessionRole && sessionRole !== 'matriz' && (
            <div style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              🔒 {sessionRole.toUpperCase()}
            </div>
          )}
          <CompanySwitcher />
          <ThemeToggle />
          {isMatriz && <NotificationBell />}
          <div
            title={authUser?.email || userEmail}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.85em',
              cursor: 'pointer',
            }}
          >
            {(authUser?.nome || userName).charAt(0).toUpperCase()}
          </div>
          {!isMatriz && authUser && (
            <button
              onClick={signOut}
              title="Sair"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid var(--psh-border-primary)',
                background: 'transparent',
                color: 'var(--psh-text-secondary)',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              🚪
            </button>
          )}
        </header>

        {/* Conteúdo da página */}
        <main style={{ minHeight: 'calc(100vh - 61px)' }}>
          <ShopeeExtensionBanner />
          {children}
        </main>
      </div>
    </div>
  )
}
