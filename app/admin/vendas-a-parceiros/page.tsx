'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')
const DataBR = (s: string) => {
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleDateString('pt-BR')
}

interface ResumoParceiro {
  company_id: string
  parceiro_nome: string
  account_type: string
  vendas: number
  etiquetas_impressas: number
  receita_total: string
  cmv_total: string
}

interface EtiquetaHoje {
  venda_id: string
  order_number: string
  company_id: string
  parceiro_nome: string
  total: string
  custo_total: string
  etiqueta_impressa_em: string
  created_at: string
  tipo_envio: string
}

interface DataContabil {
  data: string
  vendas: number
  receita: string
  vendas_ate_14h: number
  vendas_pos_14h: number
}

export default function VendasAParceirosPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [companyId, setCompanyId] = useState<string>('')

  useEffect(() => {
    // Pega company_id do user logado via cookie de sessao
    fetch('/api/admin/company-active', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        // Se nao tem company_id (sem cookie), usa LIURA como default
        const cid = j.company_id || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
        setCompanyId(cid)
      })
      .catch(() => {
        // Fallback LIURA
        setCompanyId('e2633570-74da-4b14-9ca1-ba7b0670e612')
      })
  }, [])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/fornecedor/vendas-a-parceiros?days=${days}&seller_company_id=${companyId}`, { credentials: 'include' })
      const j = await r.json()
      setData(j)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [companyId, days])

  useEffect(() => { load() }, [load])

  if (!companyId) return <div style={{ padding: 32, color: 'var(--psh-text-secondary)' }}>Carregando empresa...</div>

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            Vendas a Parceiros
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            O que cada parceiro pegou de voce (proxy: etiquetas impressas)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-secondary)', color: 'var(--psh-text-primary)' }}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={60}>Ultimos 60 dias</option>
            <option value={90}>Ultimos 90 dias</option>
          </select>
          <button onClick={load} disabled={loading}
            style={{ padding: '8px 16px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
            {loading ? 'Aguarde' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Resumo por parceiro */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
          Resumo por Parceiro ({days} dias)
        </h2>
        {data?.resumo_por_parceiro?.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 12, color: 'var(--psh-text-secondary)' }}>Parceiro</th>
                  <th style={{ textAlign: 'left', padding: 12, color: 'var(--psh-text-secondary)' }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: 12, color: 'var(--psh-text-secondary)' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: 12, color: 'var(--psh-text-secondary)' }}>Etiquetas</th>
                  <th style={{ textAlign: 'right', padding: 12, color: 'var(--psh-text-secondary)' }}>Receita</th>
                  <th style={{ textAlign: 'right', padding: 12, color: 'var(--psh-text-secondary)' }}>CMV</th>
                  <th style={{ textAlign: 'right', padding: 12, color: 'var(--psh-text-secondary)' }}>Margem</th>
                </tr>
              </thead>
              <tbody>
                {data.resumo_por_parceiro.map((r: ResumoParceiro) => {
                  const receita = Number(r.receita_total)
                  const cmv = Number(r.cmv_total)
                  const margem = receita > 0 ? ((receita - cmv) / receita * 100) : 0
                  return (
                    <tr key={r.company_id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                      <td style={{ padding: 12, color: 'var(--psh-text-primary)', fontWeight: 500 }}>{r.parceiro_nome}</td>
                      <td style={{ padding: 12, color: 'var(--psh-text-secondary)' }}>{r.account_type}</td>
                      <td style={{ padding: 12, textAlign: 'right', color: 'var(--psh-text-primary)' }}>{K(r.vendas)}</td>
                      <td style={{ padding: 12, textAlign: 'right', color: 'var(--psh-text-primary)' }}>{K(r.etiquetas_impressas)}</td>
                      <td style={{ padding: 12, textAlign: 'right', color: 'var(--psh-text-primary)', fontWeight: 500 }}>{fmtBRL(receita)}</td>
                      <td style={{ padding: 12, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(cmv)}</td>
                      <td style={{ padding: 12, textAlign: 'right', color: margem > 30 ? '#10b981' : margem > 15 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                        {margem.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhum dado encontrado</p>
        )}
      </div>

      {/* Etiquetas impressas HOJE */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
          Etiquetas Impressas Hoje (BRT)
        </h2>
        {data?.etiquetas_impressas_hoje?.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Pedido</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Parceiro</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>CMV</th>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Impressa</th>
                </tr>
              </thead>
              <tbody>
                {data.etiquetas_impressas_hoje.map((e: EtiquetaHoje) => (
                  <tr key={e.venda_id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                    <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>#{e.order_number}</td>
                    <td style={{ padding: 8, color: 'var(--psh-text-secondary)' }}>{e.parceiro_nome}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-primary)' }}>{fmtBRL(Number(e.total))}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(Number(e.custo_total))}</td>
                    <td style={{ padding: 8, color: 'var(--psh-text-secondary)' }}>
                      {new Date(e.etiqueta_impressa_em).toLocaleTimeString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhuma etiqueta impressa hoje</p>
        )}
      </div>

      {/* Data contábil */}
      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--psh-text-primary)' }}>
          Analise Corte 14h (Data Contabil)
        </h2>
        <p style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginBottom: 16 }}>
          Vendas apos 14h BRT sao contabilizadas para o dia seguinte (regra dos parceiros)
        </p>
        {data?.data_contabil?.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Data Contabil</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Receita</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Ate 14h</th>
                  <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Apos 14h</th>
                </tr>
              </thead>
              <tbody>
                {data.data_contabil.map((d: DataContabil) => (
                  <tr key={d.data} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                    <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>{DataBR(d.data)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-primary)' }}>{K(d.vendas)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-primary)' }}>{fmtBRL(Number(d.receita))}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: '#10b981' }}>{K(d.vendas_ate_14h)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: '#f59e0b' }}>{K(d.vendas_pos_14h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhum dado encontrado</p>
        )}
      </div>
    </div>
  )
}
