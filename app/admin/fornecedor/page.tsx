'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')
const DataBR = (s: string) => s ? new Date(s).toLocaleDateString('pt-BR') : '-'

interface B2BParceiro {
  company_id: string
  parceiro: string
  vendas: number
  receita_b2b: string
  custo_vendedor: string
  lucro_b2b: string
}

interface CompraDeMim {
  id: string
  buyer_company_id: string
  parceiro: string
  data_compra: string
  numero_pedido: string
  total: string
  status: string
  qtd_items: number
}

interface FinanceiroData {
  periodo_dias: number
  b2c: {
    vendas: number
    receita: number
    cmv: number
    cmv_pct: number
    comissao: number
    frete: number
    custo_flex: number
    lucro: number
    margem_pct: number
  }
  b2b: {
    vendas: number
    receita: number
    custo_vendedor: number
    lucro: number
    margem_pct: number
  }
  compras: {
    total: number
    total_gasto: number
  }
  lucro_total: number
  margem_total_pct: number
  b2b_por_parceiro: B2BParceiro[]
  compras_de_mim: CompraDeMim[]
}

export default function FornecedorPage() {
  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/fornecedor/financeiro-completo?days=${days}`, { credentials: 'include' })
      const j = await r.json()
      if (j.ok) setData(j)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            Fornecedor (LIURA ESSENCE)
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Vendas B2C + B2B (parceiros) = seu lucro real consolidado
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button onClick={load} disabled={loading}
            style={{ padding: '8px 16px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
            {loading ? 'Carregando' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* LUCRO TOTAL (destaque) */}
      {data && (
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          borderRadius: 12, padding: 24, marginBottom: 24, color: '#fff',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
        }}>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 4 }}>LUCRO REAL CONSOLIDADO ({data.periodo_dias} dias)</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{fmtBRL(data.lucro_total)}</div>
          <div style={{ fontSize: 16, marginTop: 8, opacity: 0.95 }}>
            Margem: {data.margem_total_pct.toFixed(1)}% | B2C: {fmtBRL(data.b2c.lucro)} | B2B: {fmtBRL(data.b2b.lucro)}
          </div>
        </div>
      )}

      {/* B2C vs B2B */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--psh-text-primary)' }}>
              Vendas B2C (cliente final)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <Row label="Vendas" value={K(data.b2c.vendas)} />
              <Row label="Receita" value={fmtBRL(data.b2c.receita)} />
              <Row label="CMV" value={fmtBRL(data.b2c.cmv)} pct={data.b2c.cmv_pct} />
              <Row label="Comissão ML" value={fmtBRL(data.b2c.comissao)} />
              <Row label="Frete" value={fmtBRL(data.b2c.frete)} />
              <Row label="Custo FLEX" value={fmtBRL(data.b2c.custo_flex)} />
              <div style={{ borderTop: '2px solid var(--psh-border)', paddingTop: 8, marginTop: 8 }}>
                <Row label="Lucro B2C" value={fmtBRL(data.b2c.lucro)} pct={data.b2c.margem_pct} highlight />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--psh-text-primary)' }}>
              Vendas B2B (parceiros)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <Row label="Vendas" value={K(data.b2b.vendas)} />
              <Row label="Receita B2B" value={fmtBRL(data.b2b.receita)} />
              <Row label="Custo do produto (CMV)" value={fmtBRL(data.b2b.custo_vendedor)} />
              <div style={{ borderTop: '2px solid var(--psh-border)', paddingTop: 8, marginTop: 8 }}>
                <Row label="Lucro B2B" value={fmtBRL(data.b2b.lucro)} pct={data.b2b.margem_pct} highlight />
              </div>
              <p style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 12 }}>
                Vendas que LIURA fez pra parceiros (GH SHOP, ALAMEDA, etc).<br/>
                Custo = custo que LIURA pagou pra ter o produto (custo_fornecedor).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* B2B por parceiro */}
      {data && data.b2b_por_parceiro?.length > 0 && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
            Vendas B2B por Parceiro
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Parceiro</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Receita B2B</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Custo</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Lucro</th>
                  <th style={{ textAlign: 'right', padding: 10, color: 'var(--psh-text-secondary)' }}>Margem</th>
                </tr>
              </thead>
              <tbody>
                {data.b2b_por_parceiro.map((p) => {
                  const receita = Number(p.receita_b2b)
                  const custo = Number(p.custo_vendedor)
                  const lucro = Number(p.lucro_b2b)
                  const margem = receita > 0 ? (lucro / receita * 100) : 0
                  return (
                    <tr key={p.company_id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                      <td style={{ padding: 10, color: 'var(--psh-text-primary)', fontWeight: 500 }}>{p.parceiro}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>{K(p.vendas)}</td>
                      <td style={{ padding: 10, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(receita)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(custo)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: lucro > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtBRL(lucro)}</td>
                      <td style={{ padding: 10, textAlign: 'right', color: margem > 30 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{margem.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compras de mim (parceiros comprando) */}
      {data && data.compras_de_mim?.length > 0 && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
            Compras que parceiros fizeram de mim
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Data</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Parceiro</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Pedido</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Itens</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.compras_de_mim.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                    <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>{DataBR(c.data_compra)}</td>
                    <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>{c.parceiro}</td>
                    <td style={{ padding: 8, color: 'var(--psh-text-secondary)' }}>{c.numero_pedido || '-'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{K(c.qtd_items)}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 500 }}>{fmtBRL(Number(c.total))}</td>
                    <td style={{ padding: 8, color: c.status === 'recebida' ? '#10b981' : '#f59e0b' }}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.b2b.vendas === 0 && data.compras_de_mim.length === 0 && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
          <p style={{ marginBottom: 8 }}>Ainda nao ha vendas B2B registradas.</p>
          <p style={{ fontSize: 13 }}>Quando os parceiros (GH SHOP, ALAMEDA, etc) registrarem compras via /admin/parceiro/minhas-compras, aparecerao aqui.</p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, pct, highlight }: { label: string, value: string, pct?: number, highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--psh-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--psh-text-primary)', fontWeight: highlight ? 700 : 500 }}>
        {value}
        {pct !== undefined && <span style={{ color: 'var(--psh-text-secondary)', fontWeight: 400, marginLeft: 4, fontSize: 12 }}>({pct.toFixed(1)}%)</span>}
      </span>
    </div>
  )
}
