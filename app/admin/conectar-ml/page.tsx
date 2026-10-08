'use client'

/**
 * /admin/conectar-ml
 *
 * Página para conectar conta Mercado Livre
 * Redireciona para a página pública de conexão ML
 */
import { useEffect } from 'react'

export default function ConectarMLPage() {
  useEffect(() => {
    // Redireciona para a página pública que já existe
    window.location.href = '/conectar-ml'
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f22',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ color: '#7070a0', fontSize: 14 }}>🔗 Redirecionando para o Mercado Livre...</div>
    </div>
  )
}
