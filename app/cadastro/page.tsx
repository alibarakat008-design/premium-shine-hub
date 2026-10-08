'use client'

/**
 * /cadastro — Página pública de cadastro pra empresa parceira
 *
 * Fluxo:
 *   1) Empresa preenche CNPJ, razão, nome fantasia, email, telefone, senha
 *   2) Sistema cria companies + users automaticamente
 *   3) Login automático (seta cookie)
 *   4) Redireciona pro dashboard dele
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CadastroPage() {
  const router = useRouter()

  const [cnpj, setCnpj] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [createdCompany, setCreatedCompany] = useState<any>(null)

  const formatCNPJ = (v: string) => {
    v = v.replace(/\D/g, '').slice(0, 14)
    return v
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  const formatPhone = (v: string) => {
    v = v.replace(/\D/g, '').slice(0, 11)
    return v
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
  }

  const submit = async () => {
    setError(null)
    if (!cnpj || !razaoSocial || !email || !password) {
      setError('Preencha: CNPJ, Razão Social, Email e Senha')
      return
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      setError('CNPJ inválido')
      return
    }
    if (!email.includes('@')) {
      setError('Email inválido')
      return
    }
    if (password.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return
    }
    if (password !== passwordConfirm) {
      setError('Senhas não conferem')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj,
          razao_social: razaoSocial,
          nome_fantasia: nomeFantasia,
          email,
          telefone,
          password,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setCreatedCompany(data.company)
      setStep('success')
      // Redireciona após 2s
      setTimeout(() => router.push('/admin/dashboard-parceiro'), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'success' && createdCompany) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--psh-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 500,
          textAlign: 'center',
          padding: 40,
          background: 'var(--psh-bg-secondary)',
          border: '1px solid #86efac',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 700, color: '#065f46' }}>
            Bem-vindo!
          </h1>
          <p style={{ fontSize: 14, color: 'var(--psh-text-primary)', lineHeight: 1.6 }}>
            <b>{createdCompany.nome}</b> foi cadastrada com sucesso.
          </p>
          <p style={{ fontSize: 13, color: 'var(--psh-text-secondary)', marginTop: 8 }}>
            CNPJ: {createdCompany.cnpj}
          </p>
          <div style={{
            marginTop: 24,
            padding: 16,
            background: '#fef3c7',
            borderRadius: 10,
            fontSize: 12,
            color: '#92400e',
          }}>
            ⏳ Redirecionando pro seu dashboard...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #eff6ff 50%, #fdf4ff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 32,
        maxWidth: 980,
        width: '100%',
      }}>
        {/* Lado esquerdo: pitch */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 20,
            }}>PS</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Premium Shine</div>
          </div>

          <h1 style={{
            margin: '0 0 12px',
            fontSize: 36,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1.2,
          }}>
            Comece a controlar<br />suas vendas ML hoje
          </h1>

          <p style={{
            fontSize: 15, color: '#475569',
            lineHeight: 1.6, marginBottom: 24,
          }}>
            Plataforma completa pra você acompanhar <b>suas próprias vendas</b> do Mercado Livre:
            importar pedidos, ver KPIs, controlar custos e tomar decisões.
          </p>

          <ul style={{ paddingLeft: 0, listStyle: 'none', fontSize: 14, color: '#334155' }}>
            {[
              { emoji: '🔗', text: 'Conecte sua conta ML com 1 clique (OAuth)' },
              { emoji: '📊', text: 'Dashboard com receita, CMV, margem e ticket médio' },
              { emoji: '📦', text: 'Importação automática de vendas novas todo dia' },
              { emoji: '🏆', text: 'Top produtos, status das vendas, gráficos' },
              { emoji: '💰', text: 'Controle seus custos e calcule margem real' },
              { emoji: '🔒', text: 'Você vê SÓ suas próprias vendas (isolamento total)' },
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{item.emoji}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>

          <div style={{
            marginTop: 24, padding: 14,
            background: 'rgba(124, 58, 237, 0.08)',
            borderRadius: 10,
            fontSize: 12, color: '#5b21b6',
          }}>
            💡 Já tem conta?{' '}
            <a href="/login-parceiro" style={{ color: '#7c3aed', fontWeight: 700 }}>
              Entrar →
            </a>
          </div>
        </div>

        {/* Lado direito: form */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            Cadastre sua empresa
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
            Gratuito · Sem cartão · Setup em 2 minutos
          </p>

          {error && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: '#fee2e2', color: '#991b1b',
              fontSize: 12, marginBottom: 12,
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <Field
              label="CNPJ *"
              value={cnpj}
              onChange={(v) => setCnpj(formatCNPJ(v))}
              placeholder="11.222.333/0001-81"
              mono
            />
            <Field
              label="Razão Social *"
              value={razaoSocial}
              onChange={setRazaoSocial}
              placeholder="SUA EMPRESA LTDA"
              upper
            />
            <Field
              label="Nome Fantasia"
              value={nomeFantasia}
              onChange={setNomeFantasia}
              placeholder="Nome curto (opcional)"
            />
            <Field
              label="Email *"
              value={email}
              onChange={setEmail}
              placeholder="contato@empresa.com"
              type="email"
            />
            <Field
              label="Telefone"
              value={telefone}
              onChange={(v) => setTelefone(formatPhone(v))}
              placeholder="(11) 99999-9999"
            />
            <Field
              label="Senha * (mínimo 6 caracteres)"
              value={password}
              onChange={setPassword}
              placeholder="••••••"
              type="password"
            />
            <Field
              label="Confirmar Senha *"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              placeholder="••••••"
              type="password"
            />

            <button
              onClick={submit}
              disabled={loading}
              style={{
                marginTop: 8,
                padding: '14px 20px',
                borderRadius: 10,
                border: 'none',
                background: loading
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '⏳ Criando conta...' : '🚀 Criar minha conta'}
            </button>

            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
              Ao cadastrar, você concorda com nossos termos. Seus dados são isolados e privados.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type, mono, upper }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
  upper?: boolean
}) {
  return (
    <div>
      <label style={{
        fontSize: 11, fontWeight: 600, color: '#475569',
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          marginTop: 4,
          padding: '11px 14px',
          border: '1.5px solid #e2e8f0',
          borderRadius: 8,
          background: '#f8fafc',
          color: '#0f172a',
          fontSize: 13,
          fontFamily: mono ? 'monospace' : 'inherit',
          textTransform: upper ? 'uppercase' : 'none',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
        onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
      />
    </div>
  )
}