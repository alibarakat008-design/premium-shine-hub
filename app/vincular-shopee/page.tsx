'use client'

/**
 * /vincular-shopee?company_id=X
 *
 * Página PÚBLICA pro vendor vincular Shopee (similar a /vincular-ml).
 *
 * Fluxo:
 * 1. Vendor abre esta página
 * 2. Clica em "Conectar Shopee"
 * 3. Vai pra partner.shopeemobile.com (autorização Shopee)
 * 4. Faz login na Shopee e autoriza
 * 5. Shopee redireciona pro callback que salva o token
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function VincularShopeeInner() {
  const sp = useSearchParams()
  const companyId = sp.get('company_id') || ''
  const [company, setCompany] = useState<{ nome: string; cnpj: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    fetch(`/api/public/get-ml-company?company_id=${companyId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.company) setCompany({ nome: j.company.nome_fantasia, cnpj: j.company.cnpj })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [companyId])

  if (!companyId) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1>❌ Link inválido</h1>
        <p>Use: <code>/vincular-shopee?company_id=SEU-UUID</code></p>
      </div>
    )
  }

  const oauthUrl = `/api/admin/shopee-oauth/start?company_id=${companyId}`

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #fde68a 0%, #fb923c 50%, #f97316 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 40, maxWidth: 540, width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #ee4d2d, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, color: '#fff', fontWeight: 'bold',
          }}>S</div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>
            Vincular Shopee
          </h1>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14 }}>
            Shopee Open Platform BR
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Carregando...</p>
        ) : company ? (
          <div style={{
            background: '#fff7ed', border: '1px solid #fed7aa',
            borderRadius: 10, padding: 14, marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, color: '#9a3412', textTransform: 'uppercase', marginBottom: 4 }}>
              Sua empresa
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7c2d12' }}>{company.nome}</div>
            <div style={{ fontSize: 12, color: '#c2410c', fontFamily: 'monospace', marginTop: 2 }}>
              CNPJ {company.cnpj}
            </div>
          </div>
        ) : null}

        <ol style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 14, color: '#475569', marginBottom: 24 }}>
          <li>Clique no botão abaixo</li>
          <li>Faça login com a <b>sua conta de vendedor</b> da Shopee</li>
          <li>Autorize a conexão com nosso sistema</li>
          <li>Pronto! Suas vendas começam a ser sincronizadas</li>
        </ol>

        <a
          href={oauthUrl}
          style={{
            display: 'block', width: '100%', padding: '16px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            color: '#fff', fontSize: 16, fontWeight: 700, textAlign: 'center',
            textDecoration: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
          }}
        >
          🛍️ Conectar Shopee
        </a>

        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>
          🔒 Suas credenciais são processadas direto pela Shopee Open Platform
        </p>
      </div>
    </div>
  )
}

export default function VincularShopeePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>}>
      <VincularShopeeInner />
    </Suspense>
  )
}
