'use client'

/**
 * /vincular-ml?company_id=X
 *
 * Página PÚBLICA pro vendor:
 *  1) Preencher/editar dados cadastrais da empresa (CNPJ, razão social, etc)
 *  2) Vincular conta do Mercado Livre (OAuth)
 *
 * Fluxo:
 *  1. Vendor abre esta página (com company_id na URL OU logado)
 *  2. Preenche/edita dados da empresa
 *  3. Salva (PUT /api/public/update-company)
 *  4. Clica em "Conectar Mercado Livre" (OAuth via proxy)
 *  5. Faz login no ML e autoriza
 *  6. ML redireciona pro callback que salva o token
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type Company = {
  id: string
  nome_fantasia: string
  razao_social: string
  cnpj: string
  email: string
  telefone: string
  endereco: string
  inscricao_estadual: string
  cnae: string
}

const EMPTY: Omit<Company, 'id'> = {
  nome_fantasia: '',
  razao_social: '',
  cnpj: '',
  email: '',
  telefone: '',
  endereco: '',
  inscricao_estadual: '',
  cnae: '',
}

function maskCNPJ(v: string) {
  v = v.replace(/\D/g, '').slice(0, 14)
  if (v.length <= 11) {
    // CPF
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  } else {
    v = v.replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return v
}

function maskPhone(v: string) {
  v = v.replace(/\D/g, '').slice(0, 11)
  if (v.length <= 10) {
    v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  } else {
    v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
  }
  return v
}

function VincularMLInner() {
  const sp = useSearchParams()
  const [companyId, setCompanyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoDetectError, setAutoDetectError] = useState<string | null>(null)
  const [showError, setShowError] = useState(false)
  const [form, setForm] = useState<Omit<Company, 'id'>>(EMPTY)

  // 1) Detecta company_id
  useEffect(() => {
    let fromUrl = sp.get('company_id') || ''
    if (!fromUrl && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      fromUrl = params.get('company_id') || ''
    }
    if (fromUrl) {
      setCompanyId(fromUrl)
      return
    }
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.company?.id) {
          setCompanyId(j.company.id)
        } else {
          setAutoDetectError('Você não está logado. Faça login primeiro ou use o link com company_id.')
          setShowError(true)
          setLoading(false)
        }
      })
      .catch(() => {
        setAutoDetectError('Erro ao detectar sessão.')
        setShowError(true)
        setLoading(false)
      })
  }, [sp])

  // 2) Carrega dados da company
  useEffect(() => {
    if (!companyId) return
    fetch(`/api/public/get-ml-company?company_id=${companyId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.company) {
          const c = j.company
          setForm({
            nome_fantasia: c.nome_fantasia || '',
            razao_social: c.razao_social || '',
            cnpj: c.cnpj || '',
            email: c.email || '',
            telefone: c.telefone || '',
            endereco: c.endereco || '',
            inscricao_estadual: c.inscricao_estadual || '',
            cnae: c.cnae || '',
          })
        } else {
          setError(j.error || 'Erro ao carregar dados da empresa')
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Erro ao carregar dados')
        setLoading(false)
      })
  }, [companyId])

  // 3) Salva dados editados
  async function saveData(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/public/update-company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ company_id: companyId, ...form }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Erro ao salvar')
      setSavedAt(Date.now())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (showError && !companyId) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fde68a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: 40, maxWidth: 540, width: '100%',
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb',
          textAlign: 'center',
        }}>
          <h1 style={{ margin: '0 0 16px', fontSize: 24, color: '#dc2626' }}>❌ Link inválido</h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            {autoDetectError || 'Não foi possível detectar sua empresa.'}
          </p>
          <div style={{
            background: '#f1f5f9', borderRadius: 8, padding: 12, fontSize: 12,
            color: '#475569', fontFamily: 'monospace', textAlign: 'left',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Como usar:</div>
            <div>• Faça login em <a href="/login" style={{ color: '#0369a1' }}>/login</a></div>
            <div>• Volte aqui: <a href="/vincular-ml" style={{ color: '#0369a1' }}>/vincular-ml</a></div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p style={{ color: '#64748b' }}>Carregando...</p>
      </div>
    )
  }

  const oauthUrl = `https://auth.mercadolibre.com/authorization?response_type=code&client_id=2351649987737188&redirect_uri=https%3A%2F%2Fpremium-shine-hub.vercel.app%2Fapi%2Fadmin%2Fml-oauth%2Fcallback&state=${companyId}`
  const savedRecently = savedAt && (Date.now() - savedAt < 3000)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fde68a 100%)',
      padding: '40px 20px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 40, maxWidth: 720, margin: '0 auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
          }}>🛒</div>
          <h1 style={{ margin: 0, fontSize: 26, color: '#0f172a' }}>
            Vincular Mercado Livre
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#64748b' }}>
            Confirme os dados da sua empresa e depois conecte sua conta ML
          </p>
        </div>

        {/* FORMULÁRIO DE DADOS CADASTRAIS */}
        <form onSubmit={saveData} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
            📋 Dados da Empresa
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field
              label="Nome Fantasia *"
              value={form.nome_fantasia}
              onChange={v => setForm({ ...form, nome_fantasia: v })}
              placeholder="Nome da sua loja"
            />
            <Field
              label="CNPJ *"
              value={form.cnpj}
              onChange={v => setForm({ ...form, cnpj: maskCNPJ(v) })}
              placeholder="00.000.000/0001-00"
            />
          </div>

          <Field
            label="Razão Social *"
            value={form.razao_social}
            onChange={v => setForm({ ...form, razao_social: v })}
            placeholder="Razão social completa (LTDA, ME, EIRELI, etc)"
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={v => setForm({ ...form, email: v })}
              placeholder="contato@suaempresa.com"
            />
            <Field
              label="Telefone"
              value={form.telefone}
              onChange={v => setForm({ ...form, telefone: maskPhone(v) })}
              placeholder="(11) 99999-9999"
            />
          </div>

          <Field
            label="Endereço"
            value={form.endereco}
            onChange={v => setForm({ ...form, endereco: v })}
            placeholder="Rua, número, bairro, cidade - UF"
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field
              label="Inscrição Estadual"
              value={form.inscricao_estadual}
              onChange={v => setForm({ ...form, inscricao_estadual: v })}
              placeholder="(opcional, se tiver)"
            />
            <Field
              label="CNAE"
              value={form.cnae}
              onChange={v => setForm({ ...form, cnae: v })}
              placeholder="(opcional)"
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: 10, marginBottom: 12, color: '#b91c1c', fontSize: 13,
            }}>
              ❌ {error}
            </div>
          )}

          {savedRecently && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: 10, marginBottom: 12, color: '#15803d', fontSize: 13,
            }}>
              ✅ Dados salvos! Agora conecte sua conta ML abaixo.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '12px 20px', borderRadius: 10, border: 'none',
              background: saving ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {saving ? '⏳ Salvando...' : '💾 Salvar Dados da Empresa'}
          </button>
        </form>

        {/* DIVISOR */}
        <div style={{
          borderTop: '1px solid #e5e7eb', margin: '24px 0', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
            background: '#fff', padding: '0 12px', color: '#94a3b8', fontSize: 12, fontWeight: 600,
          }}>
            EM SEGUIDA
          </div>
        </div>

        {/* VINCULAR ML */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
          🔗 Conectar Mercado Livre
        </h2>
        <ol style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 14, color: '#475569', marginBottom: 16 }}>
          <li>Clique no botão abaixo</li>
          <li>Faça login com a <b>sua conta de vendedor</b> do Mercado Livre</li>
          <li>Autorize a conexão com nosso sistema</li>
          <li>Pronto! Suas vendas começam a ser sincronizadas</li>
        </ol>
        <a
          href={oauthUrl}
          target="_blank"
          rel="noopener"
          style={{
            display: 'block', width: '100%', padding: '16px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            color: '#fff', fontSize: 16, fontWeight: 700, textAlign: 'center',
            textDecoration: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
          }}
        >
          🚀 Conectar Mercado Livre
        </a>

        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>
          🔒 Suas credenciais são processadas direto pelo Mercado Livre
        </p>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', style }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={style}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4,
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1px solid #cbd5e1', fontSize: 14, color: '#0f172a',
          background: '#fff', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

export default function VincularMLPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>}>
      <VincularMLInner />
    </Suspense>
  )
}
