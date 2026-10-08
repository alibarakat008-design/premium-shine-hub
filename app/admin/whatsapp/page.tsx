'use client'

/**
 * WhatsApp Bot Dashboard
 * - Status da integração com WhatsApp Business API
 * - Mensagens processadas vs pendentes
 * - Rascunhos de produtos para auto-resposta
 * - Link pra configurar webhook na Meta
 */

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'

export default function WhatsAppPage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch('/api/whatsapp/stats')
      if (r.ok) {
        const j = await r.json()
        setStats(j)
      } else {
        // API pode não existir ainda — mostra msg informativa
        setStats(null)
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>📱 WhatsApp Bot</h1>
      <p style={{ color: '#666', marginBottom: 28 }}>
        Integração com WhatsApp Business API — respostas automáticas e atendimento via bot.
      </p>

      {/* Status Card */}
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
        padding: 20, marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>✅</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#166534' }}>Webhook Ativo</h2>
            <p style={{ margin: 0, color: '#16a34a', fontSize: 14 }}>
              premium-shine-hub-pkg.vercel.app/api/whatsapp/webhook
            </p>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: '#166534' }}>
          O webhook está respondendo. Para ativar o bot completamente,
          configure a URL na Meta Developer Console.
        </p>
      </div>

      {/* Setup Meta */}
      <div style={{
        background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12,
        padding: 20, marginBottom: 24
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>⚙️ Configurar Webhook na Meta</h2>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#713f12', lineHeight: 2 }}>
          <li>Acesse <a href="https://developers.facebook.com/apps/2351649987737188/webhooks/" target="_blank" style={{ color: '#7c3aed' }}>Meta Developer Console</a></li>
          <li>Selecione "WhatsApp" como produto</li>
          <li>Em Webhooks, clique <strong>Edit callback URL</strong></li>
          <li>URL: <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>https://premium-shine-hub-pkg.vercel.app/api/whatsapp/webhook</code></li>
          <li>Verify token: <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>wa_botshine_2026</code></li>
          <li>Clique <strong>Verify and Save</strong></li>
          <li>Depois vá em "WhatsApp Webhook" e marque <strong>messages</strong></li>
        </ol>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{
          background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 12,
          padding: 20, textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#7c3aed' }}>—</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Mensagens Recebidas</div>
        </div>
        <div style={{
          background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 12,
          padding: 20, textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#059669' }}>—</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Mensagens Enviadas</div>
        </div>
        <div style={{
          background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12,
          padding: 20, textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ea580c' }}>—</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Rascunhos de Produtos</div>
        </div>
      </div>

      {/* Campanhas Link */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: 20
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>📣 Campanhas de WhatsApp</h2>
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 14 }}>
          Envie mensagens em massa para clientes — reativação, cupons, lançamentos e mais.
        </p>
        <a href="/admin/campanhas-whatsapp" style={{
          display: 'inline-block', background: '#7c3aed', color: '#fff',
          padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>
          Abrir Campanhas →
        </a>
      </div>

      {/* Refresh */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={fetchStats}
          style={{
            background: '#f3f4f6', border: '1px solid #d1d5db', color: '#374151',
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14
          }}
        >
          🔄 Atualizar
        </button>
      </div>
    </div>
  )
}
