'use client'

/**
 * B2B LOGIN / CADASTRO
 * - Login com email + senha
 * - Cadastro com 14 dias de trial
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function B2bLoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const url = tab === 'login' ? '/api/b2b/auth/login' : '/api/b2b/auth/register'
      const body: any = { email, password }
      if (tab === 'register') { body.nome = nome; body.empresa = empresa; body.cnpj = cnpj; body.telefone = telefone }
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      router.push('/b2b/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #ec4899)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700 }}>PS</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>Premium Shine Hub</h1>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Portal B2B • Suas vendas, seus números</p>
        </div>

        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 4, marginBottom: 20 }}>
          <button onClick={() => setTab('login')} type="button" style={{ flex: 1, padding: 8, background: tab === 'login' ? 'white' : 'transparent', color: tab === 'login' ? '#111827' : '#6b7280', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Entrar</button>
          <button onClick={() => setTab('register')} type="button" style={{ flex: 1, padding: 8, background: tab === 'register' ? 'white' : 'transparent', color: tab === 'register' ? '#111827' : '#6b7280', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Criar conta</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'register' && (
            <>
              <Field label="Seu nome *" value={nome} onChange={setNome} required />
              <Field label="Empresa" value={empresa} onChange={setEmpresa} />
              <Field label="CNPJ" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
              <Field label="Telefone (WhatsApp)" value={telefone} onChange={setTelefone} placeholder="(11) 99999-9999" />
            </>
          )}
          <Field label="Email *" value={email} onChange={setEmail} type="email" required />
          <Field label="Senha *" value={password} onChange={setPassword} type="password" required minLength={6} />

          {error && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>⚠️ {error}</div>}

          <button type="submit" disabled={loading} style={{ padding: 12, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {loading ? 'Carregando...' : tab === 'login' ? '🔓 Entrar' : '✨ Criar conta (14 dias grátis)'}
          </button>
        </form>

        {tab === 'register' && (
          <div style={{ marginTop: 16, padding: 10, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, fontSize: 11, color: '#065f46', textAlign: 'center' }}>
            🎁 <strong>14 dias de trial grátis.</strong> Sem cartão. Cancela quando quiser.
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
          <Link href="/" style={{ color: '#3b82f6', fontSize: 12, textDecoration: 'none' }}>← Voltar ao site</Link>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, minLength, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; minLength?: number; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, color: '#111827', boxSizing: 'border-box' }}
      />
    </div>
  )
}
