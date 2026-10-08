'use client'

/**
 * CAMPANHA WHATSAPP EM MASSA
 * - 6 templates de mensagem (reativação, novoproduto, cupom, personalizado, carrinho, aniversário)
 * - Filtra por segmento
 * - Gera link wa.me com mensagem personalizada
 * - Cupom baseado no segmento
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Dest = {
  id: string; nome: string; email: string | null; telefone: string | null
  whatsapp_link: string
  mensagem: string
  total_pedidos: number
  receita_total: number
  ultimo_produto: string
  ultima_compra: string
  dias_desde_ultima: number
}

const TEMPLATES_LIST = [
  { key: 'reativacao', emoji: '🔄', label: 'Reativação (sumidos)' },
  { key: 'cupom', emoji: '🎁', label: 'Cupom genérico' },
  { key: 'personalizado', emoji: '🎯', label: 'Recomendação personalizada' },
  { key: 'novoproduto', emoji: '✨', label: 'Lançamento' },
  { key: 'carrinho_abandonado', emoji: '🛒', label: 'Carrinho abandonado' },
  { key: 'aniversario', emoji: '🎂', label: 'Aniversário' },
]

export default function CampanhasWhatsappPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('risco')
  const [template, setTemplate] = useState('reativacao')
  const [max, setMax] = useState(100)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/admin/relatorios/campanha-whatsapp?segment=${segment}&template=${template}&max=${max}')
      const j = await r.json()
      if (j.ok) setData(j)
    } finally { setLoading(false) }
  }, [segment, template, max])

  useEffect(() => { fetchData() }, [fetchData])

  const exportarCSV = () => {
    if (!data?.destinatarios?.length) return
    const rows = [['Nome', 'Telefone', 'Email', 'Total Pedidos', 'Receita Total', 'Dias sem comprar', 'Mensagem']]
    for (const d of data.destinatarios) {
      rows.push([d.nome, d.telefone || '', d.email || '', String(d.total_pedidos), String(d.receita_total), String(d.dias_desde_ultima), d.mensagem])
    }
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campanha-${template}-${segment}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>💬 Campanha WhatsApp em Massa</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Gere mensagens personalizadas e dispare via WhatsApp Web</p>
        </div>
        <Link href="/admin/churn" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Churn</Link>
      </div>

      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>Segmento</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              <option value="ativo">🟢 Ativos (&lt;30d)</option>
              <option value="risco">⚠️ Em risco (30-60d)</option>
              <option value="churn">🔴 Churn (60-90d)</option>
              <option value="dormindo">😴 Dormindo (90-180d)</option>
              <option value="vip">💎 VIP (3+ pedidos)</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>Template</label>
            <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              {TEMPLATES_LIST.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>Limite</label>
            <select value={max} onChange={(e) => setMax(Number(e.target.value))} style={{ ...selectStyle, width: '100%' }}>
              <option value={50}>50 destinatários</option>
              <option value={100}>100 destinatários</option>
              <option value={200}>200 destinatários</option>
              <option value={500}>500 destinatários</option>
            </select>
          </div>
        </div>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="Destinatários" value={data.total_destinatarios.toLocaleString('pt-BR')} color="#3b82f6" />
          <Kpi label="Receita total" value={`R$ ${data.destinatarios.reduce((s: number, d: any) => s + d.receita_total, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} color="#10b981" />
          <Kpi label="Template" value={`${data.template.emoji} ${data.template.label}`} color="#8b5cf6" />
        </div>
      )}

      {data && data.destinatarios.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={exportarCSV} style={{ padding: '8px 16px', background: '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📥 Exportar CSV</button>
          <button
            onClick={() => {
              if (data.destinatarios[0]?.whatsapp_link) window.open(data.destinatarios[0].whatsapp_link, '_blank')
            }}
            style={{ padding: '8px 16px', background: '#25D366', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            💬 Abrir 1ª mensagem
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Gerando campanha...</div>
      ) : data && data.destinatarios.length > 0 ? (
        <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {data.destinatarios.map((d: Dest) => (
              <div key={d.id} style={{ padding: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{d.nome}</div>
                    <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{d.telefone}</span>
                    <span style={{ fontSize: 10, color: d.dias_desde_ultima > 60 ? '#ef4444' : d.dias_desde_ultima > 30 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{d.dias_desde_ultima}d sem comprar</span>
                    <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>• R$ {d.receita_total.toFixed(0)} histórico</span>
                  </div>
                  <pre style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 8, fontSize: 11, color: 'var(--psh-text-primary, #111827)', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'system-ui, sans-serif' }}>{d.mensagem}</pre>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <a href={d.whatsapp_link} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', background: '#25D366', color: 'var(--psh-bg-primary, white)', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>💬 Enviar</a>
                  <button onClick={() => { navigator.clipboard.writeText(d.mensagem); alert('Copiado!') }} style={{ padding: '6px 12px', background: 'var(--psh-bg-primary, white)', border: '1px solid #d1d5db', color: 'var(--psh-text-primary, #374151)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>📋 Copiar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, color: 'var(--psh-text-secondary, #9ca3af)' }}>Nenhum destinatário neste segmento</div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{value}</div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: 'var(--psh-text-primary, #111827)', background: 'var(--psh-bg-primary, white)' }
