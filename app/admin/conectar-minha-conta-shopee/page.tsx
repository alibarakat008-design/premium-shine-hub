'use client'

/**
 * /admin/conectar-minha-conta-shopee
 *
 * Detecta a company do parceiro logado e redireciona pro fluxo OAuth Shopee.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ConectarMinhaContaShopee() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'no_company' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function detect() {
      try {
        // Tenta /api/auth/me primeiro
        const r1 = await fetch('/api/auth/me', { credentials: 'include' })
        const d1 = await r1.json()
        if (d1.ok && d1.user?.company_id) {
          router.replace(`/vincular-shopee?company_id=${d1.user.company_id}`)
          setStatus('redirecting')
          return
        }
        if (d1.ok && d1.company?.id) {
          router.replace(`/vincular-shopee?company_id=${d1.company.id}`)
          setStatus('redirecting')
          return
        }

        // Fallback
        const auth = btoa('premium:shine2026')
        const r2 = await fetch('/api/admin/login-empresa', {
          credentials: 'include',
          headers: { Authorization: `Basic ${auth}` },
        })
        const d2 = await r2.json()
        if (d2.ok && d2.session?.company_id) {
          router.replace(`/vincular-shopee?company_id=${d2.session.company_id}`)
          setStatus('redirecting')
          return
        }
        if (d2.ok && d2.company?.id) {
          router.replace(`/vincular-shopee?company_id=${d2.company.id}`)
          setStatus('redirecting')
          return
        }

        setStatus('no_company')
        setMessage('Não consegui detectar sua empresa logada. Faça login novamente.')
      } catch (e: any) {
        setStatus('error')
        setMessage(e?.message || 'Erro desconhecido')
      }
    }
    detect()
  }, [router])

  if (status === 'loading' || status === 'redirecting') {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>🛍️ Conectando sua conta da Shopee...</h2>
        <p style={{ color: '#666' }}>Detectando sua empresa e redirecionando pro Shopee Open Platform.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#c00' }}>⚠️ Erro</h2>
      <p>{message || 'Não foi possível conectar.'}</p>
      <p style={{ marginTop: 20 }}>
        <a href="/login-parceiro" style={{ color: '#3b82f6' }}>← Voltar pro login</a>
      </p>
    </div>
  )
}
