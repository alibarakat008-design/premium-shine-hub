'use client'

/**
 * /login - Página de login (redireciona pro novo sistema multi-tenant)
 * Compat com URL antiga /login. Agora usa /api/auth/signin em vez de next-auth.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Se já tá logado, redireciona
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.user) {
          router.push(data.company?.account_type === 'matriz' ? '/admin/vendas-ao-vivo' : '/admin/dashboard-parceiro')
        }
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Email ou senha incorretos')
        setLoading(false)
        return
      }
      router.push(data.redirect || callbackUrl)
    } catch (err: any) {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

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
        background: 'var(--psh-bg-secondary)',
        borderRadius: 16,
        padding: 32,
        maxWidth: 400,
        width: '100%',
        border: '1px solid var(--psh-border-primary)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          🔐 Entrar
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
          Use o email e senha cadastrados
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

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%', marginTop: 4, padding: '11px 14px',
                border: '1.5px solid var(--psh-border-primary)',
                borderRadius: 8, background: 'var(--psh-bg-primary)',
                color: 'var(--psh-text-primary)', fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%', marginTop: 4, padding: '11px 14px',
                border: '1.5px solid var(--psh-border-primary)',
                borderRadius: 8, background: 'var(--psh-bg-primary)',
                color: 'var(--psh-text-primary)', fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, padding: '12px 20px', borderRadius: 10,
              border: 'none',
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ Entrando...' : '🔓 Entrar'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--psh-text-secondary)' }}>
            Não tem conta?{' '}
            <a href="/cadastro" style={{ color: '#7c3aed', fontWeight: 700, textDecoration: 'none' }}>
              Cadastre-se grátis →
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}