'use client'

import { useEffect, useState } from 'react'
import OrigemBadge from './OrigemBadge'

/**
 * Banner no topo do admin pra lembrar o user de pegar/copiar o token da Extensão Shopee.
 * Aparece quando:
 *  - User é parceiro OU matriz
 *  - Tem pelo menos 1 conta Shopee cadastrada
 */
export default function ShopeeExtensionBanner() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    // Verifica se foi dismissed nesta sessão
    try {
      if (sessionStorage.getItem('psh-shopee-banner-dismissed') === '1') {
        setDismissed(true)
        setLoading(false)
        return
      }
    } catch {}

    fetch('/api/admin/shopee-accounts', {
      headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      credentials: 'include',
    })
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.accounts) setAccounts(j.accounts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || dismissed || accounts.length === 0) return null

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const dismiss = () => {
    try { sessionStorage.setItem('psh-shopee-banner-dismissed', '1') } catch {}
    setDismissed(true)
  }

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(238,77,45,0.12), rgba(238,77,45,0.06))',
      border: '1px solid rgba(238,77,45,0.3)',
      borderLeft: '4px solid #ee4d2d',
      borderRadius: 8,
      padding: '12px 16px',
      margin: '12px 16px 0',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <OrigemBadge origem="shopee" size="sm" />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#7c2d12', marginBottom: 2 }}>
          🧩 Extensão Shopee instalada?
        </div>
        <div style={{ fontSize: 12, color: '#7c2d12', opacity: 0.85 }}>
          {accounts.length === 1 ? (
            <>Sua conta <strong>{accounts[0].nickname}</strong> tem token pronto pra usar na extensão Chrome.</>
          ) : (
            <>Você tem {accounts.length} contas Shopee com token pronto.</>
          )}
        </div>
      </div>
      {accounts.slice(0, 1).map((a) => (
        a.extension_token ? (
          <button
            key={a.id}
            onClick={() => copy(a.extension_token, a.id)}
            style={{
              padding: '6px 12px',
              background: copied === a.id ? '#22c55e' : '#ee4d2d',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {copied === a.id ? '✓ Copiado!' : '📋 Copiar Token'}
          </button>
        ) : null
      ))}
      <a
        href="/admin/extension-shopee"
        style={{
          padding: '6px 12px',
          background: 'transparent',
          color: '#7c2d12',
          border: '1px solid #7c2d12',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Ver mais →
      </a>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#7c2d12',
          cursor: 'pointer',
          fontSize: 18,
          padding: 4,
          lineHeight: 1,
        }}
        title="Fechar banner (fica dismissed nesta sessão)"
      >
        ✕
      </button>
    </div>
  )
}
