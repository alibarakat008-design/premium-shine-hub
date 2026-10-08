'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Settings {
  id: string
  margem_minima: number
  margem_padrao: number
  alerta_estoque: number
  cobertura_dias: number
  comissao_ml: number
  comissao_shopee: number
  comissao_b2c: number
  comissao_b2b: number
  comissao_vend: number
  dolar_padrao: number
  margem_preco_min_pct: number
  email_nfe: string | null
  email_pedidos: string | null
  estoque_minimo_padrao: number
  dias_alerta_giro: number
}

export default function ConfiguracoesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(j => {
      if (j.success) setData(j.data)
      setLoading(false)
    })
  }, [])

  async function salvar() {
    if (!data) return
    setSalvando(true)
    setMsg('')
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const j = await res.json()
      if (j.success) {
        setMsg('✅ ' + j.message)
        setTimeout(() => setMsg(''), 3000)
      } else {
        setMsg('❌ ' + j.error)
      }
    } finally {
      setSalvando(false)
    }
  }

  function update(field: keyof Settings, value: any) {
    if (!data) return
    setData({ ...data, [field]: value })
  }

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>⚙️ Configurações da Empresa</h1>
          <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Margens padrão, comissões, alertas e regras do sistema</div>
        </div>

        {/* Margens e Compras */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>💰 Margens e Compras</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Field label="Margem Mínima (%)" help="Abaixo disso gera alerta">
              <input type="number" value={data.margem_minima} onChange={(e) => update('margem_minima', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Margem Padrão (%)" help="Usada em novos produtos">
              <input type="number" value={data.margem_padrao} onChange={(e) => update('margem_padrao', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Margem Mínima p/ Alerta Preço Fora (%)" help="Se margem < X% gera alerta">
              <input type="number" value={data.margem_preco_min_pct} onChange={(e) => update('margem_preco_min_pct', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Cobertura Padrão (dias)" help="Para sugestão de compra">
              <input type="number" value={data.cobertura_dias} onChange={(e) => update('cobertura_dias', parseInt(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Estoque Mínimo Padrão" help="Para novos produtos">
              <input type="number" value={data.estoque_minimo_padrao} onChange={(e) => update('estoque_minimo_padrao', parseInt(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Cotação do Dólar (R$)" help="Conversão de produtos importados">
              <input type="number" step="0.01" value={data.dolar_padrao} onChange={(e) => update('dolar_padrao', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Alertas */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>🔔 Alertas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Field label="Alerta de Estoque (un.)" help="Quando estoque < X gera alerta">
              <input type="number" value={data.alerta_estoque} onChange={(e) => update('alerta_estoque', parseInt(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Dias Alerta Giro Lento" help="Produto sem vendas há X dias = alerta">
              <input type="number" value={data.dias_alerta_giro} onChange={(e) => update('dias_alerta_giro', parseInt(e.target.value) || 0)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Comissões */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>💸 Comissões por Canal (%)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 12 }}>
            <Field label="🏪 ML" >
              <input type="number" step="0.1" value={data.comissao_ml} onChange={(e) => update('comissao_ml', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="🛒 Shopee" >
              <input type="number" step="0.1" value={data.comissao_shopee} onChange={(e) => update('comissao_shopee', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="🌐 B2C" >
              <input type="number" step="0.1" value={data.comissao_b2c} onChange={(e) => update('comissao_b2c', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="📋 B2B" >
              <input type="number" step="0.1" value={data.comissao_b2b} onChange={(e) => update('comissao_b2b', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="👩‍💼 Vend." >
              <input type="number" step="0.1" value={data.comissao_vend} onChange={(e) => update('comissao_vend', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* E-mails */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>📧 E-mails de Envio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Field label="E-mail para NF-e" >
              <input type="email" value={data.email_nfe || ''} onChange={(e) => update('email_nfe', e.target.value)} placeholder="nfe@empresa.com" style={inputStyle} />
            </Field>
            <Field label="E-mail para Pedidos" >
              <input type="email" value={data.email_pedidos || ''} onChange={(e) => update('email_pedidos', e.target.value)} placeholder="pedidos@empresa.com" style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Botão Salvar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, position: 'sticky', bottom: 16 }}>
          <button onClick={salvar} disabled={salvando} style={{ flex: 1, padding: '14px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '1em', opacity: salvando ? 0.6 : 1 }}>
            {salvando ? '⏳ Salvando...' : '💾 Salvar Configurações'}
          </button>
          {msg && <div style={{ color: msg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '0.9em' }}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
      {help && <div style={{ color: '#5a5a7a', fontSize: '0.7em', marginTop: 2 }}>{help}</div>}
    </div>
  )
}

const cardStyle: React.CSSProperties = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20, marginBottom: 16 }
const titleStyle: React.CSSProperties = { color: '#a78bfa', margin: 0 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }
