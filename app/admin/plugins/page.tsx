'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'

export default function PluginsPage() {
  const [shopee, setShopee] = useState<any>(null)
  const [partnerId, setPartnerId] = useState('')
  const [partnerKey, setPartnerKey] = useState('')
  const [shopId, setShopId] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const r = await apiFetch('/api/plugins/shopee/install?company_id=e2633570-74da-4b14-9ca1-ba7b0670e612', { cache: 'no-store' })
    const j = await r.json()
    setShopee(j)
  }
  useEffect(() => { load() }, [])

  const install = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const r = await apiFetch('/api/plugins/shopee/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: 'e2633570-74da-4b14-9ca1-ba7b0670e612',
          partner_id: Number(partnerId),
          partner_key: partnerKey,
          shop_id: Number(shopId),
          mode: 'api',
        }),
      })
      const j = await r.json()
      if (j.ok) {
        setMsg('✅ Plugin instalado! Prossiga com o OAuth.')
        await load()
      } else {
        setMsg('❌ ' + (j.error || 'Erro'))
      }
    } finally {
      setSaving(false)
    }
  }

  const startOAuth = () => {
    if (!partnerId) {
      setMsg('❌ Preencha partner_id primeiro')
      return
    }
    const url = `/api/plugins/shopee/oauth?action=start&partner_id=${partnerId}&partner_key=${encodeURIComponent(partnerKey)}&redirect=/admin/plugins&company_id=e2633570-74da-4b14-9ca1-ba7b0670e612`
    window.open(url, '_blank')
  }

  const isDark = false

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: 'var(--psh-text-primary)' }}>
        🧩 Plugins
      </h1>
      <p style={{ color: 'var(--psh-text-secondary)', marginTop: 8, marginBottom: 32 }}>
        Conecte marketplaces externos e estenda as funcionalidades do seu app
      </p>

      {/* Shopee */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>🛍️</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--psh-text-primary)' }}>
              Shopee Integration
            </h2>
            <p style={{ color: 'var(--psh-text-tertiary)', fontSize: 13, margin: '4px 0 0 0' }}>
              Sincroniza vendas do Shopee (Open API ou CSV)
            </p>
          </div>
          {shopee?.installed && (
            <span style={{
              padding: '4px 12px', background: '#10b981', color: 'white',
              borderRadius: 6, fontSize: 12, fontWeight: 600,
            }}>
              ✓ Instalado
            </span>
          )}
        </div>

        {shopee?.stats && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--psh-text-tertiary)' }}>Vendas Shopee</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                {shopee.stats.total}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--psh-text-tertiary)' }}>Receita</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
                R$ {Number(shopee.stats.receita || 0).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--psh-text-secondary)', fontSize: 13, fontWeight: 600 }}>
            🔐 Configurar credenciais Shopee Open API
          </summary>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', display: 'block', marginBottom: 4 }}>
                Partner ID
              </label>
              <input
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                placeholder="Ex: 1001234"
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 14,
                  background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)',
                  border: '1px solid var(--psh-border)', borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', display: 'block', marginBottom: 4 }}>
                Shop ID
              </label>
              <input
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                placeholder="Ex: 12345"
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 14,
                  background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)',
                  border: '1px solid var(--psh-border)', borderRadius: 6,
                }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', display: 'block', marginBottom: 4 }}>
                Partner Key
              </label>
              <input
                type="password"
                value={partnerKey}
                onChange={(e) => setPartnerKey(e.target.value)}
                placeholder="Chave secreta do app Shopee"
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 14,
                  background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)',
                  border: '1px solid var(--psh-border)', borderRadius: 6,
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={install}
              disabled={saving || !partnerId || !partnerKey}
              style={{
                padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none',
                borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              💾 Salvar
            </button>
            <button
              onClick={startOAuth}
              disabled={!shopee?.installed}
              style={{
                padding: '8px 16px', background: '#ee4d2d', color: 'white', border: 'none',
                borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: shopee?.installed ? 1 : 0.5,
              }}
            >
              🔗 Autorizar Shopee
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--psh-text-tertiary)', marginTop: 8 }}>
            💡 Alternativa: <a href="/admin/importar-shopee" style={{ color: 'var(--psh-accent)' }}>importar planilha CSV do Seller Center</a> (não precisa de OAuth)
          </p>
        </details>

        {msg && (
          <div style={{
            padding: 12, background: msg.startsWith('✅') ? '#10b98120' : '#ef444420',
            border: msg.startsWith('✅') ? '1px solid #10b981' : '1px solid #ef4444',
            borderRadius: 8, color: 'var(--psh-text-primary)', fontSize: 13, marginTop: 12,
          }}>
            {msg}
          </div>
        )}
      </div>

      {/* Outros plugins (em breve) */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px dashed var(--psh-border)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
        color: 'var(--psh-text-tertiary)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🚧</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Mais plugins em breve</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Magalu, Americanas, AliExpress, TikTok Shop, WhatsApp Business
        </div>
      </div>
    </div>
  )
}
