'use client'

/**
 * /admin/top-produtos
 *
 * Multi-tenant: parceiro vê SÓ os top produtos da empresa dele.
 * Substituiu useSession (next-auth removido) por /api/auth/me.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface P {
  product_id: string
  sku: string
  nome: string
  foto: string | null
  qtd: number
  receita: number
  custo: number
  lucro: number
  margem_pct: number
}

type Tab = 'margem' | 'quantidade' | 'receita'

const medals = ['🥇', '🥈', '🥉']

export default function TopProdutosPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [companyName, setCompanyName] = useState<string>('')
  const [data, setData] = useState<{ top_margem: P[]; top_quantidade: P[]; top_receita: P[] } | null>(null)
  const [tab, setTab] = useState<Tab>('margem')
  const [dias, setDias] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auth check via /api/auth/me (substitui useSession do next-auth removido)
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (!j.ok || !j.user) {
          router.push('/login-parceiro')
          return
        }
        setCompanyName(j.company?.nome || '')
        setAuthChecked(true)
      })
      .catch(() => {
        if (!cancelled) router.push('/login-parceiro')
      })
    return () => { cancelled = true }
  }, [router])

  // Carrega dados
  useEffect(() => {
    if (!authChecked) return
    setLoading(true)
    setError(null)
    fetch(`/api/relatorios/top-produtos?dias=${dias}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'Erro desconhecido')
        setData(j.data)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(e.message || 'Erro ao carregar')
        setLoading(false)
      })
  }, [dias, authChecked])

  if (!authChecked || loading || !data) {
    return (
      <div style={{ padding: 40, color: 'var(--psh-text-secondary)' }}>
        ⏳ Carregando top produtos...
      </div>
    )
  }

  const isEmpty = data.top_margem.length === 0 && data.top_quantidade.length === 0 && data.top_receita.length === 0
  if (isEmpty) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--psh-text-primary)' }}>
          🏆 Top Produtos
        </h1>
        {companyName && (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
            <b>{companyName}</b> · últimos {dias} dias
          </p>
        )}
        <div style={{
          background: 'var(--psh-bg-secondary)',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📊</div>
          <p style={{ margin: 0, color: 'var(--psh-text-secondary)', fontSize: 14 }}>
            Nenhuma venda registrada nos últimos {dias} dias
            {companyName ? ` para ${companyName}` : ''}.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--psh-text-muted)' }}>
            Importe vendas do Mercado Livre ou sincronize pra começar.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          background: '#fee2e2', color: '#991b1b',
          padding: 16, borderRadius: 8, fontSize: 14,
        }}>
          ❌ {error}
        </div>
      </div>
    )
  }

  const list = tab === 'margem' ? data.top_margem : tab === 'quantidade' ? data.top_quantidade : data.top_receita

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: 'var(--psh-text-primary)', margin: 0 }}>
            🏆 Top Produtos
          </h1>
          <div style={{ color: 'var(--psh-text-secondary)', fontSize: '0.85em', marginTop: 2 }}>
            {companyName && <><b>{companyName}</b> · </>}
            Ranqueamento por margem, quantidade ou receita · últimos {dias} dias
          </div>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{
          padding: '8px 12px', border: '1px solid var(--psh-border-primary)',
          borderRadius: 6, fontSize: '0.85em',
          background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)',
        }}>
          <option value={7}>Últimos 7 dias</option>
          <option value={15}>Últimos 15 dias</option>
          <option value={30}>Último mês</option>
          <option value={90}>Últimos 3 meses</option>
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <TabBtn active={tab === 'margem'} onClick={() => setTab('margem')}>📊 Por Margem</TabBtn>
        <TabBtn active={tab === 'quantidade'} onClick={() => setTab('quantidade')}>📦 Por Quantidade</TabBtn>
        <TabBtn active={tab === 'receita'} onClick={() => setTab('receita')}>💰 Por Receita</TabBtn>
      </div>

      {/* Top 3 com medalhas */}
      {list.length >= 3 && (
        <div style={{
          background: 'var(--psh-bg-secondary)',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 12, padding: 20, marginBottom: 16,
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: 'var(--psh-text-primary)', fontSize: '1.05em' }}>
            {tab === 'margem' && '🏆 Top Margem (R$ média por SKU)'}
            {tab === 'quantidade' && '🏆 Top Quantidade (mais vendidos)'}
            {tab === 'receita' && '🏆 Top Receita (faturamento)'}
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {list.slice(0, 3).map((p, i) => (
              <div key={p.product_id} style={{
                textAlign: 'center', padding: 16,
                background: 'var(--psh-bg-primary)',
                borderRadius: 10,
                border: `2px solid ${i === 0 ? '#f59e0b' : i === 1 ? 'var(--psh-text-secondary, #9ca3af)' : '#cd7f32'}30`,
              }}>
                <div style={{ fontSize: '2em', marginBottom: 8 }}>{medals[i]}</div>
                {p.foto
                  ? <img src={p.foto} style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', margin: '0 auto 8px' }} />
                  : <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--psh-bg-secondary)', margin: '0 auto 8px' }} />}
                <div style={{
                  color: 'var(--psh-text-primary)', fontWeight: 600, fontSize: '0.9em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.nome}</div>
                <div style={{ color: 'var(--psh-text-muted)', fontSize: '0.75em', marginBottom: 8 }}>{p.sku}</div>
                {tab === 'margem' && <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1.1em' }}>{p.margem_pct.toFixed(0)}%</div>}
                {tab === 'quantidade' && <div style={{ color: '#7c3aed', fontWeight: 700, fontSize: '1.1em' }}>{p.qtd} un.</div>}
                {tab === 'receita' && <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1.1em' }}>R$ {p.receita.toFixed(0)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista completa */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-primary)', borderBottom: '1px solid var(--psh-border-primary)' }}>
              <th style={th}>#</th>
              <th style={th}>Produto</th>
              <th style={th}>Quantidade</th>
              <th style={th}>Receita</th>
              <th style={th}>Custo</th>
              <th style={th}>Lucro</th>
              <th style={th}>Margem</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.product_id} style={{ borderBottom: '1px solid var(--psh-border-secondary)' }}>
                <td style={td}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 4,
                    background: i < 3 ? ['#f59e0b', 'var(--psh-text-secondary, #9ca3af)', '#cd7f32'][i] : 'var(--psh-bg-primary)',
                    color: i < 3 ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.8em',
                  }}>
                    {i + 1}
                  </div>
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.foto
                      ? <img src={p.foto} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--psh-bg-primary)' }} />}
                    <div>
                      <div style={{ color: 'var(--psh-text-primary)', fontSize: '0.85em', fontWeight: 500 }}>{p.nome}</div>
                      <div style={{ color: 'var(--psh-text-muted)', fontSize: '0.7em' }}>{p.sku}</div>
                    </div>
                  </div>
                </td>
                <td style={td}><strong style={{ color: 'var(--psh-text-primary)' }}>{p.qtd}</strong></td>
                <td style={td}><span style={{ color: '#10b981' }}>R$ {p.receita.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></td>
                <td style={td}><span style={{ color: '#ef4444' }}>R$ {p.custo.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></td>
                <td style={td}><strong style={{ color: '#7c3aed' }}>R$ {p.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</strong></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 50, height: 6, background: 'var(--psh-bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(p.margem_pct, 100)}%`, height: '100%',
                        background: p.margem_pct > 40 ? '#10b981' : p.margem_pct > 20 ? '#f59e0b' : '#ef4444',
                      }} />
                    </div>
                    <span style={{
                      color: p.margem_pct > 40 ? '#10b981' : p.margem_pct > 20 ? '#f59e0b' : '#ef4444',
                      fontWeight: 600, fontSize: '0.85em',
                    }}>{p.margem_pct.toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px',
      background: active ? '#7c3aed' : 'var(--psh-bg-secondary)',
      color: active ? 'var(--psh-bg-primary, #fff)' : 'var(--psh-text-primary)',
      border: `1px solid ${active ? '#7c3aed' : 'var(--psh-border-primary)'}`,
      borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85em',
    }}>{children}</button>
  )
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  color: 'var(--psh-text-secondary)', fontSize: '0.75em', fontWeight: 600,
}
const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: '0.85em',
}