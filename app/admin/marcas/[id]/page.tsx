'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

// Esta página foi descontinuada — agora os produtos abrem como painel na mesma página /admin/marcas
// Redireciona de volta pro painel principal
export default function MarcaIdPage() {
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    // Redireciona de volta para /admin/marcas — o painel abre automaticamente
    router.replace('/admin/marcas')
  }, [router, params])

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a1a', color: '#d0c0ff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16,
    }}>
      ↩️ Redirecionando...
    </div>
  )
}
