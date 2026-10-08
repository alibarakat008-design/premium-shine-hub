'use client'

/**
 * /admin/integracoes
 *
 * Página central de integrações: ML, Shopee, Mercado Pago, etc.
 * Mostra status, última sync, e botões de ação.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface IntegrationStatus {
  plataforma: string
  label: string
  emoji: string
  cor: string
  ativa: boolean
  shop_id?: string | number
  expires_at?: string
  user_id?: string | number
  last_sync?: string
  total_orders?: number
  error?: string
}

export default function IntegracoesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, any>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      // Detecta company logada
      const r1 = await fetch('/api/auth/me', { credentials: 'include' })
      const d1 = await r1.json()
      let companyId = d1?.user?.company_id || d1?.company?.id

      if (!companyId) {
        const r2 = await fetch('/api/admin/login-empresa', {
          credentials: 'include',
          headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
        })
        const d2 = await r2.json()
        companyId = d2?.session?.company_id || d2?.company?.id
      }

      if (!companyId) {
        setLoading(false)
        return
      }

      // Carrega status das integrações
      const auth = 'Basic ' + btoa('premium:shine2026')
      const r3 = await fetch(`/api/admin/integrations-status?company_id=${companyId}`, { headers: { Authorization: auth } })
      const d3 = await r3.json()
      if (d3.ok) {
        setCompany(d3.company)
        setIntegrations(d3.integrations || [])
      }
    } catch (e: any) {
      console.error(e)
    }
    setLoading(false)
  }

  async function testIntegration(plataforma: string) {
    setTesting(plataforma)
    setTestResult({ ...testResult, [plataforma]: null })
    try {
      const auth = 'Basic ' + btoa('premium:shine2026')
      const endpoint = plataforma === 'shopee' ? 'test-shopee-token' : `test-company-token?plataforma=${plataforma}`
      const r = await fetch(`/api/admin/${endpoint}?company_id=${company.id}`, { headers: { Authorization: auth } })
      const j = await r.json()
      setTestResult({ ...testResult, [plataforma]: j })
      // Recarrega
      await load()
    } catch (e: any) {
      setTestResult({ ...testResult, [plataforma]: { ok: false, error: e.message } })
    }
    setTesting(null)
  }

  async function syncNow(plataforma: string) {
    setTesting(plataforma)
    try {
      const auth = 'Basic ' + btoa('premium:shine2026')
      const endpoint = plataforma === 'shopee' ? 'sync-shopee' : 'sync-orders-by-account'
      const r = await fetch(`/api/admin/${endpoint}?company_id=${company.id}&days=7&hours=168`, { headers: { Authorization: auth } })
      const j = await r.json()
      setTestResult({ ...testResult, [plataforma]: { ok: true, sync_result: j } })
      await load()
    } catch (e: any) {
      setTestResult({ ...testResult, [plataforma]: { ok: false, error: e.message } })
    }
    setTesting(null)
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <p>Carregando integrações...</p>
      </div>
    )
  }

  if (!company) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>⚠️ Nenhuma empresa logada</h2>
        <p>Faça login em uma empresa para ver as integrações disponíveis.</p>
        <Link href="/login-parceiro" style={{ color: '#3b82f6' }}>← Ir pro login</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: 'var(--psh-text, #0f172a)' }}>
          🔌 Integrações
        </h1>
        <p style={{ color: '#64748b', marginTop: 6 }}>
          Conecte marketplaces e plataformas de pagamento. Cada integração tem sua própria
          autorização OAuth e tokens independentes.
        </p>
        <div style={{
          marginTop: 12, padding: 12, background: 'var(--psh-bg-secondary, #f1f5f9)',
          borderRadius: 8, fontSize: 13, color: '#475569',
        }}>
          <b>Empresa:</b> {company.nome_fantasia} · <b>CNPJ:</b> {company.cnpj}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {integrations.map(int => {
          const tr = testResult[int.plataforma]
          return (
            <div key={int.plataforma} style={{
              background: 'var(--psh-bg-secondary, #fff)',
              border: '1px solid var(--psh-border, #e5e7eb)',
              borderRadius: 12, padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  background: int.cor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>{int.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text, #0f172a)' }}>
                    {int.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{int.plataforma}</div>
                </div>
                <div style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: int.ativa ? '#dcfce7' : '#fee2e2',
                  color: int.ativa ? '#166534' : '#991b1b',
                }}>
                  {int.ativa ? '✅ Conectado' : '❌ Desconectado'}
                </div>
              </div>

              {int.ativa && (
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
                  {int.user_id && <div>👤 User/Shop: <b>{String(int.user_id)}</b></div>}
                  {int.expires_at && (
                    <div>🔑 Token expira: <b>{new Date(int.expires_at).toLocaleString('pt-BR')}</b></div>
                  )}
                  {int.last_sync && (
                    <div>🔄 Última sync: <b>{new Date(int.last_sync).toLocaleString('pt-BR')}</b></div>
                  )}
                  {int.total_orders !== undefined && (
                    <div>📦 Vendas no DB: <b>{int.total_orders}</b></div>
                  )}
                </div>
              )}

              {int.error && (
                <div style={{
                  padding: 8, background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, color: '#991b1b', fontSize: 12, marginBottom: 12,
                }}>
                  ⚠️ {int.error}
                </div>
              )}

              {tr && (
                <div style={{
                  padding: 10, background: tr.ok ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${tr.ok ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: 6, fontSize: 12, marginBottom: 12,
                  color: tr.ok ? '#166534' : '#991b1b',
                  maxHeight: 200, overflow: 'auto',
                }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(tr.sync_result || tr.shop_info || tr, null, 2).substring(0, 500)}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {int.ativa ? (
                  <>
                    <button
                      onClick={() => testIntegration(int.plataforma)}
                      disabled={testing === int.plataforma}
                      style={btnSecondary}
                    >
                      {testing === int.plataforma ? '⏳' : '🔍'} Testar
                    </button>
                    <button
                      onClick={() => syncNow(int.plataforma)}
                      disabled={testing === int.plataforma}
                      style={btnSecondary}
                    >
                      {testing === int.plataforma ? '⏳' : '🔄'} Sincronizar
                    </button>
                    <Link
                      href={int.plataforma === 'shopee' ? '/admin/conectar-minha-conta-shopee' : '/admin/conectar-minha-conta-ml'}
                      style={btnSecondary}
                    >
                      🔌 Reconectar
                    </Link>
                  </>
                ) : (
                  <Link
                    href={int.plataforma === 'shopee' ? '/admin/conectar-minha-conta-shopee' : '/admin/conectar-minha-conta-ml'}
                    style={{ ...btnPrimary, background: int.cor, textDecoration: 'none' }}
                  >
                    🔌 Conectar agora
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b' }}>
        <b>💡 Próximas integrações (roadmap):</b> Mercado Pago, Bling, Tiny ERP, Shopify, Mercado Livre Envios Full.
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 6, border: 'none',
  color: 'var(--psh-bg-primary, #fff)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: '#3b82f6',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 6, border: '1px solid #d1d5db',
  background: 'var(--psh-bg-primary, #fff)', color: 'var(--psh-text-primary, #374151)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  textDecoration: 'none', display: 'inline-block',
}
