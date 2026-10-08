'use client'

/**
 * CompanySwitcher - dropdown no canto superior direito do admin
 * Permite alternar entre a matriz (LIURAESSENCE) e outras companies parceiras
 * Pra observar vendas delas. Persiste em cookie `psh_active_company`.
 *
 * Quando nenhuma company está selecionada, vê TUDO (todas as companies).
 */

import { useEffect, useState, useRef } from 'react'

type Company = {
  id: string
  cnpj: string
  nome_fantasia: string | null
  razao_social: string
  account_type: string
  ativa: boolean
  vendas_30d: number
  receita_30d: number
  total_orders: number
  total_products: number
  total_ml_accounts: number
}

const ICON_BY_TYPE: Record<string, string> = {
  matriz: '👑',
  filial: '🏢',
  parceiro: '🤝',
  cliente: '🛒',
  fornecedor: '📦',
}

const COLOR_BY_TYPE: Record<string, string> = {
  matriz: '#7c3aed',
  filial: '#0ea5e9',
  parceiro: '#10b981',
  cliente: '#f59e0b',
  fornecedor: '#6b7280',
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[2]) : null
}

export default function CompanySwitcher() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sessionRole, setSessionRole] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const auth = btoa('premium:shine2026')
      const [res1, res2] = await Promise.all([
        fetch('/api/admin/companies', {
          credentials: 'include',
          headers: { Authorization: `Basic ${auth}` },
        }),
        fetch('/api/admin/login-empresa', {
          credentials: 'include',
          headers: { Authorization: `Basic ${auth}` },
        }),
      ])
      const data = await res1.json()
      const session = await res2.json()
      if (data.ok) {
        setCompanies(data.companies || [])
        setActiveId(data.active_company_id || null)
      }
      if (session.ok) {
        setSessionRole(session.role || null)
      }
    } catch (e) {
      console.error('[CompanySwitcher] load failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Fecha dropdown ao clicar fora
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectCompany = async (id: string | null) => {
    // Se user NÃO é matriz, NÃO permite trocar pra outra empresa
    if (sessionRole && sessionRole !== 'matriz') {
      alert('🔒 Sua conta está vinculada a uma empresa parceira. Você só pode ver vendas da sua própria empresa.\n\nFaça login novamente como matriz se quiser alternar: /admin/login-empresa')
      return
    }

    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/company-active', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ company_id: id }),
      })
      const data = await res.json()
      if (data.ok) {
        setActiveId(id)
        setOpen(false)
        // Recarrega página pra aplicar filtro em todas as queries
        window.location.reload()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    }
  }

  const active = companies.find((c) => c.id === activeId) || null
  const label = active ? active.nome_fantasia || active.razao_social : 'Todas as Empresas'
  const icon = active ? ICON_BY_TYPE[active.account_type] || '🏷️' : '🌐'
  const color = active ? COLOR_BY_TYPE[active.account_type] || '#6b7280' : '#7c3aed'

  if (loading) {
    return (
      <button
        style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--psh-border-primary)',
          background: 'transparent', color: 'var(--psh-text-secondary)', fontSize: 12, cursor: 'pointer',
        }}
        disabled
      >
        ⏳ Carregando...
      </button>
    )
  }

  // PRIVACIDADE: Se NÃO for matriz, mostrar APENAS o nome da empresa dele
  // SEM dropdown de troca, SEM lista de outras empresas
  const isMatriz = !sessionRole || sessionRole === 'matriz'
  if (!isMatriz) {
    return (
      <div
        title="Sua conta só pode ver vendas da própria empresa"
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: `1px solid ${color}`,
          background: `${color}15`,
          color: color,
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 160,
          maxWidth: 240,
          cursor: 'default',
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          textAlign: 'left',
        }}>
          {label}
        </span>
        <span style={{ fontSize: 11, opacity: 0.9 }} title="Conta parceira: vê só sua empresa">🔒</span>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Trocar empresa visualizada"
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: `1px solid ${active ? color : 'var(--psh-border-primary)'}`,
          background: active ? `${color}15` : 'transparent',
          color: active ? color : 'var(--psh-text-secondary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.15s',
          minWidth: 160,
          maxWidth: 240,
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          textAlign: 'left',
        }}>
          {label}
        </span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 320,
            maxWidth: 400,
            maxHeight: 480,
            overflowY: 'auto',
            background: 'var(--psh-bg-secondary)',
            border: '1px solid var(--psh-border-primary)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 9999,
            padding: 6,
          }}
        >
          {/* Header */}
          <div style={{
            padding: '8px 10px',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--psh-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            🏢 EMPRESAS CADASTRADAS ({companies.length})
          </div>

          {/* Opção TODAS — só aparece pra matriz */}
          {sessionRole === null || sessionRole === 'matriz' ? (
            <>
              <button
                onClick={() => selectCompany(null)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: activeId === null ? '2px solid #7c3aed' : '1px solid transparent',
                  background: activeId === null ? '#7c3aed15' : 'transparent',
                  color: 'var(--psh-text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  marginBottom: 4,
                }}
                onMouseEnter={(e) => { if (activeId !== null) e.currentTarget.style.background = 'var(--psh-hover-bg)' }}
                onMouseLeave={(e) => { if (activeId !== null) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 18 }}>🌐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Todas as Empresas</div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>
                    Visão consolidada de TUDO
                  </div>
                </div>
                {activeId === null && <span style={{ color: '#7c3aed', fontSize: 14 }}>✓</span>}
              </button>

              <div style={{
                borderTop: '1px solid var(--psh-border-primary)',
                margin: '4px 0',
              }} />
            </>
          ) : null}

          {/* Lista de companies */}
          {companies.map((c) => {
            const isActive = activeId === c.id
            const cor = COLOR_BY_TYPE[c.account_type] || '#6b7280'
            const icone = ICON_BY_TYPE[c.account_type] || '🏷️'
            return (
              <button
                key={c.id}
                onClick={() => selectCompany(c.id)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: isActive ? `2px solid ${cor}` : '1px solid transparent',
                  background: isActive ? `${cor}15` : 'transparent',
                  color: 'var(--psh-text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--psh-hover-bg)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 18 }}>{icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {c.nome_fantasia || c.razao_social}
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: cor,
                      color: '#fff',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {c.account_type}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 2 }}>
                    📦 {c.total_orders} vendas • 🛍️ {c.total_products} SKUs • {c.vendas_30d} vendas (30d)
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--psh-text-secondary)', opacity: 0.7 }}>
                    {c.cnpj}
                  </div>
                </div>
                {isActive && <span style={{ color: cor, fontSize: 14 }}>✓</span>}
              </button>
            )
          })}

          {companies.length === 0 && (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--psh-text-secondary)',
              fontSize: 12,
            }}>
              Nenhuma empresa cadastrada ainda.
              <br />
              <span style={{ fontSize: 10 }}>
                Cadastre via /admin/cadastros ou API
              </span>
            </div>
          )}

          {/* Footer com info */}
          <div style={{
            borderTop: '1px solid var(--psh-border-primary)',
            marginTop: 6,
            paddingTop: 8,
            fontSize: 10,
            color: 'var(--psh-text-secondary)',
            textAlign: 'center',
          }}>
            💡 Cada empresa pode importar suas vendas do ML,
            <br />cadastrar seus custos e produtos.
          </div>
        </div>
      )}
    </div>
  )
}