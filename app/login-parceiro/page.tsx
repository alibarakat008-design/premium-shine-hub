'use client'

/**
 * /login-parceiro — Login pra empresa parceira (email + senha)
 *
 * Responsivo: no mobile mostra SÓ o form (esconde o painel de pitch à esquerda).
 * Desktop mantém o split-side bonito.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginParceiroPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      router.push(data.redirect || '/admin/dashboard-parceiro')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #eff6ff 50%, #fdf4ff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? 16 : 24,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? 0 : 32,
        maxWidth: 880,
        width: '100%',
      }}>
        {/* Lado esquerdo: mensagem de boas-vindas — ESCONDIDO no mobile */}
        {!isMobile && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
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
              Bem-vindo de volta!
            </h1>

            <p style={{
              fontSize: 15, color: '#475569',
              lineHeight: 1.6, marginBottom: 24,
            }}>
              Entre pra acessar seu dashboard, importar vendas do Mercado Livre
              e acompanhar seus KPIs em tempo real.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                href="/cadastro"
                style={{
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: '1.5px solid #7c3aed',
                  background: 'transparent',
                  color: '#7c3aed',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                ✨ Criar conta grátis
              </a>
              <a
                href="/admin/login-empresa"
                style={{
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                🔐 LOGIN
              </a>
            </div>
          </div>
        )}

        {/* Lado direito: form */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: isMobile ? 24 : 32,
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}>
          {/* Logo pequeno no topo do card (só mobile) */}
          {isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 20, justifyContent: 'center',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 16,
              }}>PS</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>Premium Shine</div>
            </div>
          )}

          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
            Entrar
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
            Use o email e senha que você cadastrou
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

          <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, color: '#475569',
                textTransform: 'uppercase',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '11px 14px',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#f8fafc',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, color: '#475569',
                textTransform: 'uppercase',
              }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '11px 14px',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#f8fafc',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
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
              {loading ? '⏳ Entrando...' : '🔓 Entrar'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Ainda não tem conta?{' '}
              <a href="/cadastro" style={{ color: '#7c3aed', fontWeight: 700, textDecoration: 'none' }}>
                Cadastre-se grátis →
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}