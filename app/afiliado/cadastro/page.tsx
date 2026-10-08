'use client'

/**
 * =====================================================
 * PÁGINA DE CADASTRO PÚBLICO DE AFILIADO
 * =====================================================
 * Caminho: app/afiliado/cadastro/page.tsx
 *
 * Pessoa preenche e vira afiliada
 * Recebe link único pra divulgar
 * =====================================================
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CadastroAfiliadoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ slug: string; link: string } | null>(null)

  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    password: '',
    passwordConfirm: '',
    slug: '',
    pix_key: '',
    comissao_pct: 10,
    origem: '',
  })

  function gerarSlug(nome: string) {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 20)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.passwordConfirm) {
      setError('As senhas não coincidem')
      return
    }

    if (form.slug.length < 3) {
      setError('Slug muito curto (mínimo 3 caracteres)')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/afiliados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          email: form.email,
          telefone: form.telefone,
          cpf: form.cpf,
          password: form.password,
          slug: form.slug,
          pix_key: form.pix_key,
          comissao_pct: form.comissao_pct,
          origem: form.origem,
        }),
      })
      const json = await res.json()

      if (!json.success) {
        setError(json.error || 'Erro ao cadastrar')
        return
      }

      setSuccess({
        slug: json.data.slug,
        link: json.data.link_padrao,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16, padding: 40, maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '4em', marginBottom: 16 }}>🎉</div>
          <h1 style={{ color: '#22c55e', fontSize: '1.8em', marginBottom: 8 }}>Cadastro realizado!</h1>
          <p style={{ color: '#b0b0cc', marginBottom: 20 }}>
            Bem-vindo, afiliado <strong style={{ color: '#f472b6' }}>{form.nome}</strong>!
          </p>

          <div style={{ background: '#0d0d25', borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'left' }}>
            <div style={{ color: '#a78bfa', fontSize: '0.9em', marginBottom: 8 }}>Seu link único de indicação:</div>
            <code style={{ color: '#22c55e', fontSize: '0.95em', wordBreak: 'break-all' }}>{success.link}</code>
          </div>

          <p style={{ color: '#7070a0', fontSize: '0.9em', marginBottom: 24 }}>
            Compartilhe esse link nas suas redes sociais, WhatsApp, blog. Você ganha {form.comissao_pct}% de comissão em cada venda!
          </p>

          <button onClick={() => router.push(`/login?callbackUrl=/afiliado`)} style={{ background: 'linear-gradient(90deg,#a78bfa,#f472b6)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.95em' }}>
            Fazer Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16, padding: 40, maxWidth: 600, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h1 style={{ color: '#f472b6', fontSize: '2em', marginBottom: 8 }}>🔗 Vire Afiliado</h1>
          <p style={{ color: '#b0b0cc', fontSize: '0.95em' }}>Indique os melhores perfumes árabes e ganhe comissão em cada venda</p>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9em' }}>❌ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Input label="Nome Completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v, slug: form.slug || gerarSlug(v) })} required fullWidth />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" required />
            <Input label="Telefone (WhatsApp)" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} placeholder="(11) 99999-9999" required />
            <Input label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" required />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#b0b0cc', fontSize: '0.85em', marginBottom: 6 }}>Como quer ser chamado (slug) *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="joana123"
              required
              style={inputStyle}
            />
            <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>
              Seu link será: premiumshine.com.br/?ref=<strong style={{ color: '#a78bfa' }}>{form.slug || 'seu-slug'}</strong>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#b0b0cc', fontSize: '0.85em', marginBottom: 6 }}>Chave PIX (pra receber pagamentos) *</label>
            <input type="text" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} placeholder="CPF, email, telefone ou chave aleatória" required style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Input label="Senha" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" required />
            <Input label="Confirmar Senha" value={form.passwordConfirm} onChange={(v) => setForm({ ...form, passwordConfirm: v })} type="password" required />
          </div>

          <div style={{ marginBottom: 20 }}>
            <Input label="Sua comissão (% sobre cada venda)" value={String(form.comissao_pct)} onChange={(v) => setForm({ ...form, comissao_pct: Number(v) })} type="number" />
            <div style={{ color: '#7070a0', fontSize: '0.75em', marginTop: 4 }}>Padrão: 10%. Pode ajustar entre 5-20%.</div>
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, background: loading ? '#666' : 'linear-gradient(90deg,#a78bfa,#f472b6)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.95em', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Cadastrando...' : '✓ Quero ser afiliado'}
          </button>

          <div style={{ marginTop: 20, textAlign: 'center', color: '#7070a0', fontSize: '0.85em' }}>
            Já é afiliado? <a href="/login" style={{ color: '#a78bfa' }}>Fazer login</a>
          </div>
        </form>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required, placeholder, fullWidth }: any) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : {}}>
      <label style={{ display: 'block', color: '#b0b0cc', fontSize: '0.85em', marginBottom: 6 }}>{label}{required && ' *'}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

const inputStyle = { width: '100%', padding: 10, background: '#0d0d25', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: '0.9em' } as const
