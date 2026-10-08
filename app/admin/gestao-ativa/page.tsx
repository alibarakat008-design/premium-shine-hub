'use client'

/**
 * PAINEL - versão super defensiva
 * Sem imports externos
 * Sem SVG pesado
 * Sem nada que possa quebrar no client
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Data {
  resumo: {
    receita_30d: number
    vendas_30d: number
    ticket_medio: number
    lucro_30d: number
    margem_pct: number
    cancelamentos_30d: number
  }
  meses_6: { key: string; mes: string; ano: number; receita: number; vendas: number }[]
  top_produtos: { id: string; sku: string; nome: string; foto_principal_url: string | null; qtd: number; receita: number }[]
}

function fmt(v: any): string {
  const n = Number(v || 0)
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function GestaoAtivaPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (status === 'loading') return

    // Carregar
    let cancelled = false
    const ac = new AbortController()

    const carregar = async () => {
      try {
        const r = await apiFetch('/api/admin/dashboard-leve', { signal: ac.signal })
        const j = await r.json()
        if (cancelled) return
        if (j && j.success) {
          setData(j.data)
        } else {
          setError(j?.error || 'Erro ao carregar')
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError(err?.message || 'Erro')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    carregar()
    return () => { cancelled = true; ac.abort() }
  }, [status, router])

  if (status === 'loading') {
    return <div style={{ padding: 40, color: 'var(--psh-text-secondary, #6b7280)' }}>Autenticando...</div>
  }

  if (loading) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>📊 Painel</h1>
        <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em', marginTop: 4 }}>Carregando dados...</div>
        <div style={{ marginTop: 16, padding: 16, background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.85em' }}>
          ⏳ Buscando resumo financeiro e histórico de 6 meses...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)' }}>📊 Painel</h1>
        <div style={{ marginTop: 16, padding: 16, background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 10, color: '#991b1b', fontSize: '0.85em' }}>
          ❌ Erro: {error}
        </div>
        <button
          onClick={() => { setLoading(true); setError(''); setData(null); location.reload() }}
          style={{ marginTop: 12, padding: '10px 20px', background: '#7c3aed', color: 'var(--psh-bg-primary, #fff)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          🔄 Recarregar
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)' }}>📊 Painel</h1>
        <div style={{ marginTop: 16, padding: 16, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, color: '#92400e', fontSize: '0.85em' }}>
          ⚠️ Sem dados disponíveis
        </div>
      </div>
    )
  }

  const maxReceita = Math.max(...data.meses_6.map(m => m.receita), 1)
  const maxVendas = Math.max(...data.meses_6.map(m => m.vendas), 1)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary, #1f2937)', margin: 0 }}>📊 Painel</h1>
        <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.85em', marginTop: 2 }}>Resumo dos últimos 30 dias + histórico de 6 meses</div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Card label="💰 Receita 30d" value={fmt(data.resumo.receita_30d)} sub={`${data.resumo.vendas_30d} vendas`} color="#10b981" />
        <Card label="🎯 Ticket Médio" value={fmt(data.resumo.ticket_medio)} sub="30 dias" color="#7c3aed" />
        <Card label="💵 Lucro Est." value={fmt(data.resumo.lucro_30d)} sub={`${data.resumo.margem_pct.toFixed(0)}% margem`} color="#22c55e" />
        <Card label="❌ Cancelamentos" value={String(data.resumo.cancelamentos_30d)} sub="últimos 30 dias" color="#ef4444" />
      </div>

      {/* Tabela 6 meses */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>📅 Faturamento e Vendas — Últimos 6 meses</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Mês</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Faturamento</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600, width: '40%' }}>Visual</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600 }}>Pedidos</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', fontWeight: 600, width: '40%' }}>Visual</th>
            </tr>
          </thead>
          <tbody>
            {data.meses_6.map(m => (
              <tr key={m.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <strong style={{ color: 'var(--psh-text-primary, #1f2937)' }}>{m.mes}/{String(m.ano).slice(2)}</strong>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em', textAlign: 'right' }}>
                  <span style={{ color: m.receita > 0 ? '#10b981' : 'var(--psh-text-secondary, #9ca3af)', fontWeight: 600 }}>{fmt(m.receita)}</span>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <div style={{ height: 8, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.receita / maxReceita) * 100}%`, height: '100%', background: m.receita > 0 ? '#10b981' : 'var(--psh-border, #e5e7eb)' }} />
                  </div>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em', textAlign: 'right' }}>
                  <span style={{ color: m.vendas > 0 ? '#3b82f6' : 'var(--psh-text-secondary, #9ca3af)', fontWeight: 600 }}>{m.vendas}</span>
                </td>
                <td style={{ padding: '8px 10px', fontSize: '0.85em' }}>
                  <div style={{ height: 8, background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.vendas / maxVendas) * 100}%`, height: '100%', background: m.vendas > 0 ? '#3b82f6' : 'var(--psh-border, #e5e7eb)' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top 5 */}
      <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: '1em', color: 'var(--psh-text-primary, #1f2937)', margin: '0 0 12px 0' }}>🏆 Top 5 Produtos (últimos 30 dias)</h2>
        {data.top_produtos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Sem vendas no período</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.top_produtos.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 4, background: i < 3 ? ['#f59e0b', 'var(--psh-text-secondary, #9ca3af)', '#cd7f32'][i] : 'var(--psh-border, #e5e7eb)', color: i < 3 ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary, #6b7280)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8em' }}>
                  {i + 1}
                </div>
                {p.foto_principal_url ? <img src={p.foto_principal_url} style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }} alt="" /> : <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--psh-border, #e5e7eb)' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '0.85em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  <div style={{ color: 'var(--psh-text-secondary, #9ca3af)', fontSize: '0.7em' }}>{p.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#7c3aed', fontWeight: 600, fontSize: '0.9em' }}>{p.qtd} un.</div>
                  <div style={{ color: '#10b981', fontSize: '0.75em' }}>{fmt(p.receita)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary, #fff)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
      <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--psh-text-primary, #1f2937)', fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
      <div style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: '0.7em', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
