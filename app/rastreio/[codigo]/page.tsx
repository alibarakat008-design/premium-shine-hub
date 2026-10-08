'use client'

/**
 * =====================================================
 * PÁGINA DE RASTREAMENTO PÚBLICA
 * =====================================================
 * Cliente acessa pelo link /rastreio/[codigo]
 * Sem login, vê status do pedido
 * =====================================================
 */

// app/rastreio/[codigo]/page.tsx

import { Suspense } from 'react'

interface TrackingEvent {
  date: string
  status: string
  local: string
  description: string
}

interface TrackingData {
  order_number: string
  status: string
  customer_name: string
  transportadora: string
  previsao_entrega: string
  events: TrackingEvent[]
}

async function fetchTracking(codigo: string): Promise<TrackingData | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/public/rastreio/${codigo}`, {
    next: { revalidate: 60 }, // cache 1min
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.success ? json.data : null
}

function RastreioContent({ codigo }: { codigo: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <RastreioPage codigo={codigo} />
    </div>
  )
}

async function RastreioPage({ codigo }: { codigo: string }) {
  const data = await fetchTracking(codigo)

  if (!data) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: 40 }}>
        <h1 style={{ color: '#ef4444', fontSize: '2em', marginBottom: 16 }}>❌ Código não encontrado</h1>
        <p style={{ color: '#7070a0' }}>Verifique o código de rastreio e tente novamente.</p>
        <p style={{ color: '#7070a0', fontSize: '0.85em', marginTop: 16 }}>Código: {codigo}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16, padding: 32 }}>
        <h1 style={{ color: '#a78bfa', fontSize: '1.5em', marginBottom: 8 }}>📦 Rastreamento do Pedido</h1>
        <div style={{ color: '#7070a0', fontSize: '0.9em', marginBottom: 24 }}>
          Pedido <strong style={{ color: '#d0c0ff' }}>{data.order_number}</strong> · {data.customer_name}
        </div>

        <div style={{ background: '#0d0d25', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#7070a0' }}>Status:</span>
            <strong style={{ color: '#22c55e' }}>{data.status}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#7070a0' }}>Transportadora:</span>
            <strong>{data.transportadora}</strong>
          </div>
          {data.previsao_entrega && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#7070a0' }}>Previsão de entrega:</span>
              <strong>{new Date(data.previsao_entrega).toLocaleDateString('pt-BR')}</strong>
            </div>
          )}
        </div>

        <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Histórico de Movimentação</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.events.map((evt, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 12, background: '#0d0d25', borderRadius: 8, borderLeft: '3px solid #a78bfa' }}>
              <div style={{ color: '#a78bfa', fontSize: '1.5em' }}>📍</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{evt.status}</div>
                <div style={{ color: '#b0b0cc', fontSize: '0.9em', marginTop: 4 }}>{evt.description}</div>
                <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 4 }}>
                  {new Date(evt.date).toLocaleString('pt-BR')} · {evt.local}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: 16, background: 'rgba(96,165,250,0.1)', borderRadius: 8, fontSize: '0.9em', color: '#60a5fa' }}>
          💡 Dúvidas? Entre em contato: WhatsApp (11) 99999-9999
        </div>
      </div>
    </div>
  )
}

export default function RastreioPageWrapper({ params }: { params: { codigo: string } }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#b0b0cc' }}>Carregando...</div>}>
      <RastreioContent codigo={params.codigo} />
    </Suspense>
  )
}
