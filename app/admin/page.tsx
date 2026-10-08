'use client'

/**
 * /admin → redireciona para /admin/gestao-ativa (Painel)
 */

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/gestao-ativa')
  }, [router])

  return (
    <div style={{ padding: 40, color: 'var(--psh-text-secondary, #6b7280)' }}>
      Redirecionando...
    </div>
  )
}
