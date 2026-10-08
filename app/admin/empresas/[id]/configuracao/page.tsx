'use client'

/**
 * /admin/empresas/[id]/configuracao
 *
 * Página de configuração específica da empresa:
 *   - Dados básicos (CNPJ, razão, email, tipo)
 *   - Token ML: 3 opções
 *       1) OAuth (botão "Conectar minha conta ML" — recomendado)
 *       2) Manual (colar access_token + refresh_token direto)
 *       3) Testar conexão atual
 *   - Status da conexão ML (válido, expira em X)
 */

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

type Company = {
  id: string
  cnpj: string
  nome_fantasia: string | null
  razao_social: string
  account_type: string
  ativa: boolean
  email: string | null
  ml_user_id: number | null
  ml_expires_at: string | null
  has_access_token: boolean
  has_refresh_token: boolean
  ml_pending?: boolean
}

export default function ConfiguracaoEmpresaPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const companyId = params.id

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Manual token form
  const [showManual, setShowManual] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    load()
    // Pega params da URL (msg de callback)
    const url = new URL(window.location.href)
    const mlErr = url.searchParams.get('ml_error')
    const mlOk = url.searchParams.get('ml_success')
    if (mlErr) setError(decodeURIComponent(mlErr))
    if (mlOk) setSuccess(decodeURIComponent(mlOk))
  }, [companyId])

  const load = async () => {
    setLoading(true)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch(`/api/admin/empresas/${companyId}/detalhes`, {
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erro ao carregar')
      setCompany(data.company)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const startOAuth = () => {
    window.location.href = `/api/admin/ml-oauth/start?company_id=${companyId}`
  }

  const saveManual = async () => {
    setError(null)
    setSuccess(null)
    if (!accessToken) {
      setError('Access token é obrigatório')
      return
    }
    setSaving(true)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch(`/api/admin/empresas/${companyId}/token-ml`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken || null }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSuccess(`✅ Tokens salvos! ${data.test?.nickname ? `Conta: ${data.test.nickname} (${data.test.user_id})` : ''}`)
      setAccessToken('')
      setRefreshToken('')
      setShowManual(false)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch(`/api/admin/empresas/${companyId}/testar-ml`, {
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      const data = await res.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const clearTokens = async () => {
    if (!confirm('Remover tokens ML desta empresa? Ela não vai mais conseguir importar vendas até reconectar.')) return
    try {
      const auth = btoa('premium:shine2026')
      await fetch(`/api/admin/empresas/${companyId}/token-ml?action=clear`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      await load()
      setSuccess('Tokens removidos')
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>⏳ Carregando...</div>
  }
  if (!company) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>Empresa não encontrada</div>
  }

  const tokenExpiresAt = company.ml_expires_at ? new Date(company.ml_expires_at) : null
  const isExpired = tokenExpiresAt ? tokenExpiresAt.getTime() < Date.now() : false
  const minutesLeft = tokenExpiresAt ? Math.round((tokenExpiresAt.getTime() - Date.now()) / 60000) : null

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push('/admin/empresas')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--psh-text-secondary)', fontSize: 13, marginBottom: 8,
          }}
        >
          ← Voltar pra Empresas
        </button>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          ⚙️ Configuração: {company.nome_fantasia || company.razao_social}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
          CNPJ: {company.cnpj} · Tipo: <b>{company.account_type}</b>
        </p>
      </div>

      {error && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: '#fee2e2', color: '#991b1b',
          fontSize: 13, marginBottom: 16,
        }}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: '#d1fae5', color: '#065f46',
          fontSize: 13, marginBottom: 16,
        }}>
          {success}
        </div>
      )}

      {/* Card: Conexão Mercado Livre */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          🔗 Conexão com Mercado Livre
        </h2>

        {/* Status atual */}
        <div style={{
          padding: 16,
          borderRadius: 8,
          background: company.has_access_token
            ? (isExpired ? '#fef3c7' : '#d1fae5')
            : (company.ml_pending ? '#e0f2fe' : 'var(--psh-bg-secondary, #f3f4f6)'),
          border: `1px solid ${company.has_access_token ? (isExpired ? '#fde68a' : '#86efac') : (company.ml_pending ? '#7dd3fc' : 'var(--psh-border, #e5e7eb)')}`,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>
              {company.has_access_token ? (isExpired ? '⚠️' : '✅') : (company.ml_pending ? '⏳' : '🔌')}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {company.has_access_token
                  ? (isExpired ? 'Token EXPIRADO' : 'Token ATIVO')
                  : (company.ml_pending ? 'Conexão pendente (OAuth bloqueado)' : 'Não conectado')}
              </div>
              {company.ml_user_id && (
                <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 2 }}>
                  User ID ML: <b>{company.ml_user_id}</b>
                </div>
              )}
              {minutesLeft !== null && (
                <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)' }}>
                  {isExpired
                    ? `Expirou há ${Math.abs(minutesLeft)} min`
                    : `Expira em ${minutesLeft} min (${tokenExpiresAt?.toLocaleString('pt-BR')})`}
                </div>
              )}
              {company.ml_pending && (
                <div style={{ fontSize: 12, color: '#075985', marginTop: 4 }}>
                  💡 A outras funcionalidades do painel funcionam normal. Reconecte o ML quando possível.
                </div>
              )}
            </div>
            {company.has_access_token && (
              <button
                onClick={testConnection}
                disabled={testing}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--psh-border-primary)',
                  background: 'var(--psh-bg-primary)',
                  color: 'var(--psh-text-primary)',
                  fontSize: 12,
                  cursor: testing ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {testing ? '⏳ Testando...' : '🧪 Testar'}
              </button>
            )}
          </div>

          {testResult && (
            <div style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 6,
              background: testResult.ok ? '#d1fae5' : '#fee2e2',
              color: testResult.ok ? '#065f46' : '#991b1b',
              fontSize: 12,
            }}>
              {testResult.ok ? (
                <>
                  ✅ Token funcionando!
                  {testResult.nickname && <div>Conta: <b>{testResult.nickname}</b></div>}
                  {testResult.user_id && <div>User ID: {testResult.user_id}</div>}
                </>
              ) : (
                <>❌ {testResult.error || 'Token inválido'}</>
              )}
            </div>
          )}
        </div>

        {/* Opção 1: OAuth */}
        <div style={{
          padding: 16,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
          border: '1px solid #fde68a',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>
                ⭐ Opção 1: Conectar via OAuth (Recomendado)
              </div>
              <div style={{ fontSize: 12, color: '#78350f', marginTop: 4 }}>
                Você autoriza uma vez e o sistema gerencia o refresh automático do token.
              </div>
            </div>
            <button
              onClick={startOAuth}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: 'var(--psh-bg-primary, #fff)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔗 Conectar minha conta ML
            </button>
          </div>
        </div>

        {/* Opção 2: Manual */}
        <div style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--psh-bg-primary)',
          border: '1px solid var(--psh-border-primary)',
        }}>
          <div
            onClick={() => setShowManual(!showManual)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--psh-text-primary)' }}>
                🔧 Opção 2: Colar tokens manualmente
              </div>
              <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 4 }}>
                Pra quem já tem tokens gerados fora do sistema (ex: Postman, outra ferramenta).
              </div>
            </div>
            <span style={{ color: 'var(--psh-text-secondary)' }}>{showManual ? '▲' : '▼'}</span>
          </div>

          {showManual && (
            <div style={{ marginTop: 12 }}>
              <Field
                label="Access Token *"
                value={accessToken}
                onChange={setAccessToken}
                placeholder="APP_USR-1234567890..."
                mono
              />
              <Field
                label="Refresh Token (opcional mas recomendado)"
                value={refreshToken}
                onChange={setRefreshToken}
                placeholder="TG-xxxxxxxxx..."
                mono
              />
              <p style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 8 }}>
                💡 Sem refresh_token, o token vai expirar em ~6h e a empresa não vai conseguir mais importar vendas.
              </p>
              <button
                onClick={saveManual}
                disabled={saving || !accessToken}
                style={{
                  marginTop: 8,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: saving || !accessToken ? 'var(--psh-text-secondary, #9ca3af)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  color: 'var(--psh-bg-primary, #fff)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: saving || !accessToken ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '⏳ Salvando...' : '💾 Salvar Tokens'}
              </button>
            </div>
          )}
        </div>

        {company.has_access_token && (
          <button
            onClick={clearTokens}
            style={{
              marginTop: 12,
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #fca5a5',
              background: 'transparent',
              color: '#991b1b',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            🗑️ Remover tokens desta empresa
          </button>
        )}
      </div>

      {/* Card: Próximos passos */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        padding: 24,
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          📋 Próximos passos após conectar
        </h2>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--psh-text-primary)', lineHeight: 1.8 }}>
          <li>
            Vá em <a href="/admin/empresas" style={{ color: '#7c3aed' }}>Empresas</a> e clique em
            <b> 📥 Importar ML</b> nesta empresa.
          </li>
          <li>
            Cole os <b>order_numbers</b> das vendas que você quer importar (até 50 por vez).
          </li>
          <li>
            O sistema vai usar o token desta empresa pra buscar via API ML e criar as vendas com <code>company_id</code> correto.
          </li>
          <li>
            Em <a href="/admin/vendas-ao-vivo" style={{ color: '#7c3aed' }}>Vendas ao Vivo</a>,
            troque pra esta empresa no seletor superior direito pra ver SÓ as vendas dela.
          </li>
          <li>
            Cron noturno (se habilitado) importa automaticamente as vendas novas dos últimos 7 dias.
          </li>
        </ol>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{
        fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)',
        textTransform: 'uppercase',
      }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          marginTop: 4,
          padding: '10px 12px',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 8,
          background: 'var(--psh-bg-primary)',
          color: 'var(--psh-text-primary)',
          fontSize: 12,
          fontFamily: mono ? 'monospace' : 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}