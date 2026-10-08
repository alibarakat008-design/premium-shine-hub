'use client'

/**
 * B2B ACEITAR CONVITE
 * Cliente clica no link recebido por email/WhatsApp
 * - Valida token
 * - Pede nome + senha (se não tiver)
 * - Cria conta + seta sessão
 */

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type InviteData = {
  email: string
  nome: string | null
  empresa: string | null
  plano: string
  mensagem: string | null
  expira_em: string
}

export default function AceitarConvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [valido, setValido] = useState<boolean | null>(null)
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/b2b/accept-invite?token=${token}`)
      .then((r) => r.json())
      .then((j) => {
        setValido(j.valid)
        if (j.valid && j.invite) {
          setInvite(j.invite)
          setNome(j.invite.nome || '')
          setEmpresa(j.invite.empresa || '')
        }
        setLoading(false)
      })
      .catch(() => {
        setValido(false)
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nome || !password) { setError('Nome e senha são obrigatórios'); return }
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres'); return }
    if (password !== confirmPassword) { setError('As senhas não conferem'); return }

    setSubmitting(true)
    try {
      const r = await fetch('/api/b2b/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nome, empresa, password }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      router.push('/b2b/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
        <div style={{ background: 'white', padding: 30, borderRadius: 12 }}>Validando convite...</div>
      </div>
    )
  }

  if (valido === false) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafbfc', padding: 20 }}>
        <div style={{ background: 'white', padding: 40, borderRadius: 12, maxWidth: 480, textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 48 }}>❌</div>
          <h1 style={{ fontSize: 20, color: '#111827', margin: '12px 0' }}>Convite inválido ou expirado</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Este convite não está mais válido. Entre em contato com quem te convidou.</p>
          <Link href="/b2b/login" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', background: '#3b82f6', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Voltar pro login</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #3b82f6)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28 }}>✉️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>Você foi convidado!</h1>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Crie sua conta pra acessar o portal</p>
        </div>

        {invite?.mensagem && (
          <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#1e40af', fontStyle: 'italic' }}>
            💬 "{invite.mensagem}"
          </div>
        )}

        <div style={{ padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#6b7280' }}>Email:</span>
            <strong style={{ color: '#111827' }}>{invite?.email}</strong>
          </div>
          {invite?.empresa && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#6b7280' }}>Empresa:</span>
              <strong style={{ color: '#111827' }}>{invite.empresa}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Plano:</span>
            <strong style={{ color: '#8b5cf6', textTransform: 'uppercase' }}>{invite?.plano}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Seu nome *" value={nome} onChange={setNome} required />
          <Field label="Nome da empresa" value={empresa} onChange={setEmpresa} />
          <Field label="Senha (mínimo 6 caracteres) *" value={password} onChange={setPassword} type="password" required minLength={6} />
          <Field label="Confirme a senha *" value={confirmPassword} onChange={setConfirmPassword} type="password" required minLength={6} />

          {error && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>⚠️ {error}</div>}

          <button type="submit" disabled={submitting} style={{ padding: 12, background: 'linear-gradient(135deg, #10b981, #3b82f6)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {submitting ? 'Criando conta...' : '✨ Aceitar convite e entrar'}
          </button>
        </form>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>
          🎁 <strong>14 dias de trial grátis</strong> inclusos
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, minLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; minLength?: number }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, color: '#111827', boxSizing: 'border-box' }}
      />
    </div>
  )
}
