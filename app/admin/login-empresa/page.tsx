'use client'

/**
 * /admin/login-empresa - Login multi-tenant
 *
 * Mostra lista de empresas cadastradas com 2 botões grandes cada:
 *   👑 Entrar como Matriz (vê TUDO)
 *   🤝 Entrar como [Nome] (vê SÓ suas próprias vendas)
 *
 * Quando loga como parceiro/filial, força o filtro de vendas pra aquela empresa.
 * Quando loga como matriz, libera o filtro (vê tudo).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Company = {
  id: string
  cnpj: string
  nome_fantasia: string | null
  razao_social: string
  account_type: string
  ativa: boolean
  email: string | null
  total_orders: number
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
  fornecedor: 'var(--psh-text-secondary, #6b7280)',
}

export default function LoginEmpresaPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null)
  const [currentSession, setCurrentSession] = useState<any>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
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
      if (data.ok) setCompanies(data.companies || [])
      if (session.ok && session.session) setCurrentSession(session.session)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const login = async (companyId: string) => {
    setLogging(companyId)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/login-empresa', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ company_id: companyId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      // Redireciona pro painel
      router.push('/admin/vendas-ao-vivo')
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setLogging(null)
    }
  }

  const logout = async () => {
    setLogging('logout')
    try {
      const auth = btoa('premium:shine2026')
      await fetch('/api/admin/login-empresa', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      setCurrentSession(null)
      // Recarrega
      window.location.reload()
    } catch (e) {
      console.error(e)
    } finally {
      setLogging(null)
    }
  }

  const matrizes = companies.filter(c => c.account_type === 'matriz' && c.ativa)
  const outros = companies.filter(c => c.account_type !== 'matriz' && c.ativa)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--psh-bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Sessão atual */}
      {currentSession && (
        <div style={{
          marginBottom: 24,
          padding: 16,
          background: 'var(--psh-bg-secondary)',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 12,
          maxWidth: 600,
          width: '100%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
                Sessão Atual
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)', marginTop: 4 }}>
                {ICON_BY_TYPE[currentSession.account_type] || '🏷️'} {currentSession.nome_fantasia || currentSession.razao_social}
              </div>
              <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 2 }}>
                {currentSession.account_type === 'matriz'
                  ? '👁️ Vê TODAS as empresas'
                  : `🔒 Vê SÓ vendas da sua empresa`}
              </div>
            </div>
            <button
              onClick={logout}
              disabled={logging === 'logout'}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid var(--psh-border-primary)',
                background: 'var(--psh-bg-primary)',
                color: 'var(--psh-text-primary)',
                fontSize: 13,
                cursor: logging === 'logout' ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {logging === 'logout' ? '⏳' : '🚪 Sair'}
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 700 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          margin: 0,
          background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          🔐 Login Multi-Empresa
        </h1>
        <p style={{
          fontSize: 13,
          color: 'var(--psh-text-secondary)',
          marginTop: 8,
        }}>
          Escolha em qual empresa você quer entrar agora.
          <br />
          <b style={{ color: 'var(--psh-text-primary)' }}>Matriz</b> vê tudo · <b style={{ color: 'var(--psh-text-primary)' }}>Parceiros</b> veem só suas próprias vendas
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--psh-text-secondary)' }}>⏳ Carregando empresas...</div>
      ) : (
        <div style={{ maxWidth: 900, width: '100%' }}>
          {/* Matrizes */}
          {matrizes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--psh-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 12,
              }}>
                👑 Matrizes ({matrizes.length})
              </h2>
              {matrizes.map(c => (
                <CompanyLoginCard
                  key={c.id}
                  company={c}
                  logging={logging === c.id}
                  onLogin={() => login(c.id)}
                  highlight
                />
              ))}
            </div>
          )}

          {/* Outros */}
          {outros.length > 0 && (
            <div>
              <h2 style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--psh-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 12,
              }}>
                🤝 Parceiros / Filiais ({outros.length})
              </h2>
              {outros.map(c => (
                <CompanyLoginCard
                  key={c.id}
                  company={c}
                  logging={logging === c.id}
                  onLogin={() => login(c.id)}
                />
              ))}
            </div>
          )}

          {companies.length === 0 && (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'var(--psh-bg-secondary)',
              borderRadius: 12,
              color: 'var(--psh-text-secondary)',
            }}>
              Nenhuma empresa cadastrada.
              <br />
              <button
                onClick={() => router.push('/admin/empresas')}
                style={{
                  marginTop: 12,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  color: 'var(--psh-bg-primary, #fff)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ➕ Cadastrar Primeira Empresa
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32, fontSize: 11, color: 'var(--psh-text-muted)' }}>
        💡 Dica: a sessão fica salva em cookies por 1 ano. Você pode trocar de empresa quando quiser.
      </div>
    </div>
  )
}

function CompanyLoginCard({ company, logging, onLogin, highlight }: {
  company: Company
  logging: boolean
  onLogin: () => void
  highlight?: boolean
}) {
  const cor = COLOR_BY_TYPE[company.account_type] || 'var(--psh-text-secondary, #6b7280)'
  const icone = ICON_BY_TYPE[company.account_type] || '🏷️'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: 16,
      background: 'var(--psh-bg-secondary)',
      border: `2px solid ${highlight ? cor : 'var(--psh-border-primary)'}`,
      borderRadius: 12,
      marginBottom: 8,
      transition: 'all 0.15s',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: `${cor}20`,
        color: cor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, flexShrink: 0,
      }}>
        {icone}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--psh-text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {company.nome_fantasia || company.razao_social}
          <span style={{
            padding: '2px 8px',
            borderRadius: 10,
            background: `${cor}20`,
            color: cor,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            {company.account_type}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 4 }}>
          {company.cnpj} · {company.total_orders} vendas
        </div>
        {company.email && (
          <div style={{ fontSize: 11, color: 'var(--psh-text-muted)', marginTop: 2 }}>
            ✉️ {company.email}
          </div>
        )}
      </div>
      <button
        onClick={onLogin}
        disabled={logging}
        style={{
          padding: '12px 20px',
          borderRadius: 8,
          border: 'none',
          background: logging ? 'var(--psh-text-secondary, #9ca3af)' : `linear-gradient(135deg, ${cor}, ${cor}cc)`,
          color: 'var(--psh-bg-primary, #fff)',
          fontSize: 13,
          fontWeight: 700,
          cursor: logging ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {logging ? '⏳ Entrando...' : `Entrar como ${company.account_type === 'matriz' ? 'Matriz' : company.nome_fantasia?.split(' ')[0] || 'Empresa'}`}
      </button>
    </div>
  )
}