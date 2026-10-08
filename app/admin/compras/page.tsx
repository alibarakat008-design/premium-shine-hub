'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Sugestao {
  product_id: string
  sku: string
  nome: string
  marca: string
  categoria: string
  estoque_atual: number
  estoque_minimo: number
  velocidade_venda_diaria: number
  dias_restantes: number
  qtd_sugerida: number
  custo_unitario: number
  custo_total: number
  urgencia: 'critica' | 'alta' | 'media' | 'baixa'
  fornecedor_sugerido: { id: string; nome: string; prazo_entrega_dias: number } | null
}

interface Resumo {
  total_produtos: number
  critica: number
  alta: number
  media: number
  baixa: number
  custo_total_estimado: number
}

interface Fornecedor {
  id: string
  nome: string
  prazo_entrega_dias: number
}

interface Purchase {
  id: string
  data_pedido: string
  status: string
  valor_total: number
  previsao_entrega: string
  suppliers: { nome: string }
  _count: { supplier_purchase_items: number }
}

const URGENCIA_COLORS: Record<string, { bg: string; border: string; text: string; emoji: string }> = {
  critica: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444', emoji: '🚨' },
  alta: { bg: 'rgba(249,115,22,0.15)', border: '#f97316', text: '#f97316', emoji: '⚠️' },
  media: { bg: 'rgba(234,179,8,0.15)', border: '#eab308', text: '#eab308', emoji: '🟡' },
  baixa: { bg: 'rgba(96,165,250,0.15)', border: '#60a5fa', text: '#60a5fa', emoji: '🟢' },
}

export default function ComprasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ sugestoes: Sugestao[]; resumo: Resumo; fornecedores: Fornecedor[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cobertura, setCobertura] = useState(45)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [gerando, setGerando] = useState(false)
  const [pedidos, setPedidos] = useState<Purchase[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch(`/api/purchases/sugerir?cobertura=${cobertura}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setData(j.data)
          // Auto-selecionar todos críticos e altos
          const auto = new Set(j.data.sugestoes.filter((s: Sugestao) => s.urgencia === 'critica' || s.urgencia === 'alta').map((s: Sugestao) => s.product_id))
          setSelecionados(auto as Set<string>)
          // Auto-selecionar primeiro fornecedor
          if (j.data.fornecedores?.[0]) setFornecedorId(j.data.fornecedores[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [cobertura])

  useEffect(() => {
    fetch('/api/purchases/listar').then(r => r.json()).then(j => {
      if (j.success) setPedidos(j.data)
    })
  }, [gerando])

  function toggle(id: string) {
    const s = new Set(selecionados)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSelecionados(s)
  }

  function toggleAll() {
    if (!data) return
    if (selecionados.size === data.sugestoes.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(data.sugestoes.map(s => s.product_id)))
    }
  }

  async function gerarPedido() {
    if (selecionados.size === 0) return alert('Selecione ao menos 1 produto')
    if (!fornecedorId) return alert('Selecione um fornecedor')

    setGerando(true)
    const items = Array.from(selecionados).map(id => {
      const s = data!.sugestoes.find(x => x.product_id === id)!
      return { product_id: id, quantidade: s.qtd_sugerida }
    })

    try {
      const res = await apiFetch('/api/purchases/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, supplier_id: fornecedorId }),
      })
      const j = await res.json()
      if (j.success) {
        alert(`✅ ${j.message}\n\nPrevisão de entrega: ${new Date(j.data.previsao_entrega).toLocaleDateString('pt-BR')}`)
        setSelecionados(new Set())
        load()
      } else {
        alert('❌ ' + j.error)
      }
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setGerando(false)
    }
  }

  if (status === 'loading' || (loading && !data)) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando...
      </div>
    )
  }

  const totalSelecionados = data?.sugestoes
    .filter(s => selecionados.has(s.product_id))
    .reduce((acc, s) => acc + s.custo_total, 0) || 0

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>
              📦 Pedido de Compra Automático
            </h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>
              Sugestões baseadas na velocidade de vendas + estoque mínimo
            </div>
          </div>
          <select value={cobertura} onChange={(e) => setCobertura(Number(e.target.value))} style={{ padding: '10px 16px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 8, fontSize: '0.9em' }}>
            <option value={15}>Cobrir 15 dias</option>
            <option value={30}>Cobrir 30 dias</option>
            <option value={45}>Cobrir 45 dias (recomendado)</option>
            <option value={60}>Cobrir 60 dias</option>
            <option value={90}>Cobrir 90 dias</option>
          </select>
        </div>

        {/* Resumo */}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            <ResumoCard label="Total" value={data.resumo.total_produtos} color="#a78bfa" />
            <ResumoCard label="🚨 Crítica" value={data.resumo.critica} color="#ef4444" />
            <ResumoCard label="⚠️ Alta" value={data.resumo.alta} color="#f97316" />
            <ResumoCard label="🟡 Média" value={data.resumo.media} color="#eab308" />
            <ResumoCard label="💰 Custo Total" value={`R$ ${data.resumo.custo_total_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#22c55e" />
          </div>
        )}

        {/* Lista de Sugestões */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ color: '#a78bfa', margin: 0 }}>📋 Sugestões de Compra</h3>
            {data && data.sugestoes.length > 0 && (
              <button onClick={toggleAll} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 4, cursor: 'pointer', fontSize: '0.8em' }}>
                {selecionados.size === data.sugestoes.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            )}
          </div>

          {!data || data.sugestoes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#22c55e' }}>
              ✅ Nenhum produto com estoque baixo no momento!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.sugestoes.map((s) => {
                const u = URGENCIA_COLORS[s.urgencia]
                const checked = selecionados.has(s.product_id)
                return (
                  <div key={s.product_id} onClick={() => toggle(s.product_id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 14, background: checked ? 'rgba(167,139,250,0.08)' : '#0d0d25',
                    borderRadius: 8,
                    borderLeft: `3px solid ${u.border}`,
                    flexWrap: 'wrap', gap: 10, cursor: 'pointer',
                    border: checked ? '1px solid #a78bfa' : '1px solid transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(s.product_id)} style={{ cursor: 'pointer' }} />
                      <div>
                        <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '0.9em' }}>
                          {u.emoji} {s.nome}
                        </div>
                        <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
                          {s.sku} • {s.marca}
                          {s.fornecedor_sugerido && ` • 🏭 ${s.fornecedor_sugerido.nome}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.8em', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Estoque</div>
                        <div style={{ color: u.text, fontWeight: 600 }}>{s.estoque_atual} (mín {s.estoque_minimo})</div>
                      </div>
                      <div>
                        <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Velocidade</div>
                        <div style={{ color: '#a78bfa', fontWeight: 600 }}>{s.velocidade_venda_diaria}/dia</div>
                      </div>
                      <div>
                        <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Dias restantes</div>
                        <div style={{ color: u.text, fontWeight: 600 }}>{s.dias_restantes} dias</div>
                      </div>
                      <div>
                        <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Sugestão</div>
                        <div style={{ color: '#22c55e', fontWeight: 700 }}>{s.qtd_sugerida} un.</div>
                      </div>
                      <div>
                        <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Custo</div>
                        <div style={{ color: '#22c55e', fontWeight: 700 }}>R$ {s.custo_total.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Ações de Compra */}
        {data && data.sugestoes.length > 0 && (
          <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa', borderRadius: 12, padding: 16, marginBottom: 24, position: 'sticky', bottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ color: '#7070a0', fontSize: '0.7em' }}>Total Selecionado</div>
                <div style={{ color: '#22c55e', fontSize: '1.4em', fontWeight: 700 }}>
                  R$ {totalSelecionados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ color: '#b0b0cc', fontSize: '0.8em' }}>{selecionados.size} produto(s)</div>
              </div>
              <div>
                <label style={{ color: '#7070a0', fontSize: '0.75em', display: 'block', marginBottom: 4 }}>Fornecedor</label>
                <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }}>
                  <option value="">Selecione um fornecedor</option>
                  {data.fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome} ({f.prazo_entrega_dias} dias)</option>
                  ))}
                </select>
              </div>
              <button
                onClick={gerarPedido}
                disabled={gerando || selecionados.size === 0 || !fornecedorId}
                style={{
                  padding: '14px 24px', background: '#22c55e', border: 'none', color: '#000',
                  borderRadius: 8, cursor: gerando ? 'wait' : 'pointer',
                  fontWeight: 700, fontSize: '1em',
                  opacity: (gerando || selecionados.size === 0 || !fornecedorId) ? 0.5 : 1,
                }}
              >
                {gerando ? '⏳ Gerando...' : '🛒 Gerar Pedido de Compra'}
              </button>
            </div>
          </div>
        )}

        {/* Pedidos Gerados */}
        {pedidos.length > 0 && (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
            <h3 style={{ color: '#a78bfa', marginBottom: 16 }}>📋 Pedidos de Compra Recentes</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pedidos.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#0d0d25', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ color: '#d0c0ff', fontWeight: 600 }}>
                        🛒 Pedido #{p.id.slice(0, 8)} • {p.suppliers.nome}
                      </div>
                    <div style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 2 }}>
                      {new Date(p.data_pedido).toLocaleDateString('pt-BR')} • {p._count.supplier_purchase_items} itens • Previsão: {new Date(p.previsao_entrega).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ color: '#22c55e', fontWeight: 700 }}>R$ {Number(p.valor_total).toFixed(2)}</div>
                    <div style={{ padding: '4px 10px', background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: 4, fontSize: '0.75em' }}>
                      {p.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ResumoCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.5em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
