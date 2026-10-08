'use client'

/**
 * PARTE 1: Página de Detalhe do Pedido — Estrutura + Header + Itens
 * Caminho: app/admin/pedidos/[id]/page.tsx
 */

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Order {
  id: string
  order_number: string
  origem: string
  status: string
  subtotal: number
  desconto: number
  frete: number
  embalagem: number
  total: number
  custo_total: number | null
  lucro_bruto: number | null
  lucro_liquido: number | null
  created_at: string
  pago_em: string | null
  data_envio: string | null
  data_entrega: string | null
  previsao_entrega: string | null
  codigo_rastreio: string | null
  transportadora: string | null
  forma_pagamento: string | null
  payment_id: string | null
  endereco_entrega: any
  customer: { id: string; nome: string; email: string; telefone: string } | null
  vendedor: { id: string; nome: string; role: string } | null
  afiliado: { id: string; nome: string } | null
  company: { id: string; cnpj: string; nome_fantasia: string } | null
  marketplace_account: { id: string; nickname: string; plataforma: string } | null
  items: {
    id: string
    sku: string
    nome_produto: string
    foto_url: string | null
    quantidade: number
    preco_unitario: number
    preco_total: number
    custo_unitario: number
    product: { id: string; sku: string; marca: { nome: string } } | null
  }[]
}

const ORIGEM_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  mercado_livre: { label: 'Mercado Livre', emoji: '🏪', color: '#ffe600' },
  shopee: { label: 'Shopee', emoji: '🛒', color: '#ee4d2d' },
  site_b2c: { label: 'Site B2C', emoji: '🌐', color: '#a78bfa' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#22c55e' },
  b2b: { label: 'B2B', emoji: '📋', color: '#60a5fa' },
  vendedora: { label: 'Vendedora', emoji: '👩‍💼', color: '#f472b6' },
}

export default function PedidoDetalhePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated' && id) fetchOrder()
  }, [status, id])

  async function fetchOrder() {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Pedido não encontrado')
        return
      }
      setOrder(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(newStatus: string) {
    if (!order) return
    setUpdating(true)
    try {
      const res = await apiFetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        await fetchOrder()
      } else {
        const json = await res.json()
        alert('Erro: ' + (json.error || 'desconhecido'))
      }
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  if (loading || status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando...
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 40, textAlign: 'center' }}>
        <h1>Erro</h1>
        <p>{error || 'Pedido não encontrado'}</p>
        <button onClick={() => router.push('/admin/pedidos')} style={{ marginTop: 20, padding: '10px 20px', background: '#a78bfa', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Voltar
        </button>
      </div>
    )
  }

  const origem = ORIGEM_LABELS[order.origem] || { label: order.origem, emoji: '📦', color: '#888' }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ marginBottom: 16, fontSize: '0.85em' }}>
          <a href="/admin/pedidos" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Pedidos</a>
          <span style={{ color: '#7070a0', margin: '0 8px' }}>/</span>
          <span style={{ color: '#b0b0cc' }}>{order.order_number}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>{order.order_number}</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ background: `${origem.color}22`, color: origem.color, padding: '4px 12px', borderRadius: 12, fontSize: '0.85em', fontWeight: 600 }}>
                {origem.emoji} {origem.label}
              </span>
              {order.marketplace_account && (
                <span style={{ color: '#7070a0', fontSize: '0.85em' }}>Conta: {order.marketplace_account.nickname}</span>
              )}
              <span style={{ color: '#7070a0', fontSize: '0.85em' }}>· {new Date(order.created_at).toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {order.status === 'pendente' && <button onClick={() => updateStatus('confirmado')} disabled={updating} style={btnPrimary}>Confirmar</button>}
            {order.status === 'confirmado' && <button onClick={() => updateStatus('separado')} disabled={updating} style={btnPrimary}>Marcar como Separado</button>}
            {order.status === 'separado' && <button onClick={() => updateStatus('enviado')} disabled={updating} style={btnPrimary}>Marcar como Enviado</button>}
            {order.status === 'enviado' && <button onClick={() => updateStatus('entregue')} disabled={updating} style={btnPrimary}>Marcar como Entregue</button>}
            {(order.status === 'pendente' || order.status === 'confirmado') && <button onClick={() => updateStatus('cancelado')} disabled={updating} style={btnDanger}>Cancelar</button>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 20 }}>

          {/* Coluna esquerda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={cardStyle}>
              <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Itens do Pedido</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {order.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 12, padding: 12, background: '#0d0d25', borderRadius: 8, alignItems: 'center' }}>
                    <div style={{ width: 60, height: 60, background: '#1a1a35', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em', flexShrink: 0, overflow: 'hidden' }}>
                      {item.foto_url ? <img src={item.foto_url} alt={item.nome_produto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🌸'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0c0ff', fontSize: '0.95em', fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.nome_produto}>{item.nome_produto}</div>
                      <div style={{ color: '#7070a0', fontSize: '0.8em' }}>SKU: {item.sku} · Qtd: {item.quantidade}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#a78bfa', fontWeight: 600 }}>R$ {item.preco_total.toFixed(2)}</div>
                      {item.custo_unitario > 0 && <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Custo: R$ {(item.custo_unitario * item.quantidade).toFixed(2)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Logistica</h2>
              {order.codigo_rastreio ? (
                <div>
                  <InfoRow label="Transportadora" valor={order.transportadora || 'Não definida'} />
                  <InfoRow label="Código de Rastreio" valor={order.codigo_rastreio} />
                  <InfoRow label="Previsão de Entrega" valor={order.previsao_entrega ? new Date(order.previsao_entrega).toLocaleDateString('pt-BR') : 'Não definida'} />
                  <InfoRow label="Data de Envio" valor={order.data_envio ? new Date(order.data_envio).toLocaleDateString('pt-BR') : 'Não enviado'} />
                  <InfoRow label="Data de Entrega" valor={order.data_entrega ? new Date(order.data_entrega).toLocaleDateString('pt-BR') : 'Não entregue'} />
                </div>
              ) : (
                <div style={{ padding: 16, background: 'rgba(234,179,8,0.1)', borderRadius: 8, color: '#eab308', fontSize: '0.9em' }}>
                  Pedido sem código de rastreio. Adicione quando postar.
                </div>
              )}
            </div>

            {order.endereco_entrega && Object.keys(order.endereco_entrega).length > 0 && (
              <div style={cardStyle}>
                <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Endereço de Entrega</h2>
                <pre style={{ color: '#b0b0cc', fontSize: '0.85em', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                  {JSON.stringify(order.endereco_entrega, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={cardStyle}>
              <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Resumo</h2>
              <SummaryRow label="Subtotal" value={order.subtotal} />
              {order.desconto > 0 && <SummaryRow label="Desconto" value={-order.desconto} color="#ef4444" />}
              {order.embalagem > 0 && <SummaryRow label="Embalagem Premium" value={order.embalagem} />}
              <SummaryRow label="Frete" value={order.frete} />
              <div style={{ borderTop: '2px solid #a78bfa', marginTop: 8, paddingTop: 12 }}>
                <SummaryRow label="TOTAL" value={order.total} highlight />
              </div>
              {order.custo_total !== null && (
                <>
                  <div style={{ borderTop: '1px solid #2a2a4a', marginTop: 12, paddingTop: 12 }}>
                    <SummaryRow label="Custo Total" value={order.custo_total} color="#eab308" />
                    {order.lucro_bruto !== null && <SummaryRow label="Lucro Bruto" value={order.lucro_bruto} color="#22c55e" />}
                    {order.lucro_liquido !== null && <SummaryRow label="Lucro Líquido" value={order.lucro_liquido} color="#22c55e" highlight />}
                  </div>
                </>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Cliente</h2>
              {order.customer ? (
                <>
                  <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '1em', marginBottom: 8 }}>{order.customer.nome}</div>
                  <InfoRow label="Email" valor={order.customer.email} />
                  <InfoRow label="Telefone" valor={order.customer.telefone || 'Não informado'} />
                </>
              ) : (
                <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Cliente não vinculado</div>
              )}
              {(order.vendedor || order.afiliado) && (
                <>
                  <div style={{ borderTop: '1px solid #2a2a4a', marginTop: 12, paddingTop: 12 }}>
                    {order.vendedor && <InfoRow label="Vendedor(a)" valor={order.vendedor.nome} />}
                    {order.afiliado && <InfoRow label="Afiliado" valor={order.afiliado.nome} />}
                  </div>
                </>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Status</h2>
              <StatusStep label="Criado" date={order.created_at} completed />
              <StatusStep label="Pago" date={order.pago_em} completed={!!order.pago_em} />
              <StatusStep label="Enviado" date={order.data_envio} completed={!!order.data_envio} />
              <StatusStep label="Entregue" date={order.data_entrega} completed={!!order.data_entrega} />
            </div>

            {order.company && (
              <div style={cardStyle}>
                <h2 style={{ color: '#d0c0ff', fontSize: '1.1em', marginBottom: 16 }}>Empresa</h2>
                <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{order.company.nome_fantasia}</div>
                <div style={{ color: '#7070a0', fontSize: '0.85em' }}>CNPJ: {order.company.cnpj}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, color, highlight }: { label: string; value: number; color?: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: highlight ? '1.1em' : '0.9em' }}>
      <span style={{ color: highlight ? '#a78bfa' : '#b0b0cc', fontWeight: highlight ? 700 : 400 }}>{label}</span>
      <span style={{ color: color || (highlight ? '#a78bfa' : '#d0c0ff'), fontWeight: highlight ? 700 : 600 }}>R$ {value.toFixed(2)}</span>
    </div>
  )
}

function InfoRow({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.85em' }}>
      <span style={{ color: '#7070a0' }}>{label}</span>
      <span style={{ color: '#d0c0ff', textAlign: 'right', maxWidth: '60%' }}>{valor}</span>
    </div>
  )
}

function StatusStep({ label, date, completed }: { label: string; date: string | null; completed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: '0.85em' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: completed ? '#22c55e' : '#2a2a4a' }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: completed ? '#d0c0ff' : '#7070a0' }}>{label}</div>
        {date && <div style={{ color: '#7070a0', fontSize: '0.85em' }}>{new Date(date).toLocaleString('pt-BR')}</div>}
      </div>
    </div>
  )
}

const cardStyle = { background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 20 } as const
const btnPrimary = { background: 'linear-gradient(90deg,#a78bfa,#f472b6)', color: 'var(--psh-bg-primary, #fff)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 600 } as const
const btnDanger = { background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85em' } as const
