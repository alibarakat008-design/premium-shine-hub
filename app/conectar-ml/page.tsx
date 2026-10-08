'use client'

/**
 * /conectar-ml?company_id=X
 *
 * Página HTML pública (com Basic Auth via popup do navegador) que conecta
 * o Mercado Livre via OAuth. Funciona sem o user estar logado no painel —
 * só precisa estar logado na conta ML CORRETA no navegador.
 *
 * Fluxo:
 *  1) User abre o link
 *  2) Navegador pede Basic Auth (premium:shine2026)
 *  3) Após autenticar, vê uma página de aviso + botão "🚀 Continuar pro ML"
 *  4) Click redireciona pra /api/admin/ml-oauth/start?company_id=X
 *  5) ML reconhece a conta logada no navegador e mostra tela de autorização
 *  6) User confirma → volta pro painel conectado
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ConectarMLInner() {
  const sp = useSearchParams()
  const companyIdParam = sp.get('company_id') || ''
  const [companyId, setCompanyId] = useState(companyIdParam)
  const [company, setCompany] = useState<{ nome: string; cnpj: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Se não veio company_id na URL, tenta pegar da sessão
      if (!companyIdParam) {
        try {
          const auth = btoa('premium:shine2026')
          const r = await fetch('/api/admin/login-empresa', {
            credentials: 'include',
            headers: { Authorization: `Basic ${auth}` },
          })
          const d = await r.json()
          if (d.ok && d.session?.company_id) {
            // Redireciona para a mesma página com company_id
            window.location.href = `/conectar-ml?company_id=${d.session.company_id}`
            return
          }
        } catch {}
        setLoading(false)
        return
      }

      // Busca detalhes da empresa
      const res = await fetch(`/api/admin/empresas/${companyIdParam}/detalhes`, { credentials: 'include' })
      const j = await res.json()
      if (j.ok && j.company) {
        setCompany({ nome: j.company.nome_fantasia, cnpj: j.company.cnpj })
        setCompanyId(companyIdParam)
      }
      setLoading(false)
    }
    load()
  }, [companyIdParam])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', background: '#0f0f22', minHeight: '100vh', color: '#d0c0ff' }}>
        <h2>⏳ Carregando...</h2>
        <p style={{ color: '#7070a0' }}>Identificando empresa ativa</p>
      </div>
    )
  }

  if (!companyId) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', background: '#0f0f22', minHeight: '100vh', color: '#d0c0ff' }}>
        <h1>❌ company_id não informado</h1>
        <p style={{ color: '#7070a0' }}>Faça login no painel primeiro e tente novamente.</p>
        <a href="/admin/dashboard" style={{ color: '#a78bfa' }}>← Voltar ao Dashboard</a>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #eff6ff 50%, #fdf4ff 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 40, maxWidth: 520, width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 32, fontWeight: 800,
          }}>🔗</div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>
            Conectar Mercado Livre
          </h1>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Carregando dados da empresa...</p>
        ) : company ? (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: 14, marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              Empresa que será conectada
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{company.nome}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
              CNPJ {company.cnpj}
            </div>
          </div>
        ) : null}

        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
          padding: 14, marginBottom: 20, fontSize: 13, color: '#78350f',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ IMPORTANTE — Antes de continuar:</div>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Abra o Mercado Livre em <b>outra aba</b></li>
            <li><b>Deslogue</b> da conta errada (se tiver)</li>
            <li><b>Logue com a conta correta</b> da empresa acima</li>
            <li>Volte aqui e clique em "🚀 Continuar pro ML"</li>
          </ol>
          <div style={{ marginTop: 10, fontSize: 12, color: '#92400e' }}>
            💡 Dica: use <b>Ctrl+Shift+N</b> pra abrir aba anônima, faça login com a conta certa do ML, e use essa aba anônima pra clicar no botão.
          </div>
        </div>

        <button
          onClick={() => {
            window.location.href = `/api/admin/ml-oauth/start?company_id=${companyId}`
          }}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          🚀 Continuar pro Mercado Livre
        </button>

        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>
          Você será redirecionado pro ML autorizar. Após autorizar, voltará automaticamente pro painel.
        </p>
      </div>
    </div>
  )
}

export default function ConectarMLPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>}>
      <ConectarMLInner />
    </Suspense>
  )
}