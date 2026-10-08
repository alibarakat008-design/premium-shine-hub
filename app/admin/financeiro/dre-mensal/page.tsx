'use client'

/**
 * DRE MENSAL ESTILO METRIFY
 *
 * Layout:
 * - Coluna esquerda: navegação de meses + cadastro de custos (CRUD)
 * - Coluna direita: tabela DRE com colunas por mês
 *
 * Linhas:
 * - Receita Bruta
 * - (-) Cancelamentos
 * - Receita Líquida
 * - (-) CMV
 * - = Lucro Bruto
 * - (-) Comissões
 * - (-) Frete
 * - (-) Custos Fixos (cadastráveis)
 * - (-) Custos Variáveis
 * - = Lucro Operacional
 * - (-) Impostos
 * - = Lucro Líquido
 * - Margem %
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Categoria = {
  id: string
  nome: string
  tipo: string
  icone?: string
  cor?: string
  ordem?: number
  ativa?: boolean
}

type Custo = {
  id: string
  category_id: string
  categoria_nome?: string
  descricao?: string
  valor: number
  ano: number
  mes: number
  pago_em?: string | null
  observacoes?: string
}

type DadosMes = {
  key: string
  label: string
  receita_bruta: number
  cancelamentos: number
  receita_liquida: number
  cmv: number
  comissoes: number
  frete: number
  custos_fixos: number
  custos_variaveis: number
  impostos: number
  investimentos: number
  total_custos: number
  lucro_bruto: number
  lucro_operacional: number
  lucro_liquido: number
  margem_bruta_pct: number
  margem_operacional_pct: number
  margem_liquida_pct: number
  pedidos: number
  ticket_medio: number
  detalhes_custos: Record<string, number>
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function DREMensalPage() {
  const [dados, setDados] = useState<DadosMes[]>([])
  const [periodos, setPeriodos] = useState<string[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [totais, setTotais] = useState<any>(null)
  const [comparativo, setComparativo] = useState<any[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [custos, setCustos] = useState<Custo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Seletor de período: quantos meses mostrar
  const [meses, setMeses] = useState(6)
  // Seletor de mês/ano inicial: a partir de qual mês mostrar
  const [mesInicio, setMesInicio] = useState(new Date().getMonth() + 1)
  const [anoInicio, setAnoInicio] = useState(new Date().getFullYear())

  // Form de novo custo
  const [showAddCost, setShowAddCost] = useState(false)
  const [newCost, setNewCost] = useState({
    category_id: '',
    descricao: '',
    valor: 0,
    pago_em: '',
  })

  // Form de nova categoria
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCat, setNewCat] = useState({
    nome: '',
    tipo: 'fixo',
    icone: '📦',
    cor: 'var(--psh-text-secondary, #6b7280)',
  })

  const fetchDRE = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/dre-mensal?meses=${meses}&mes=${mesInicio}&ano=${anoInicio}`, {
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setDados(j.dados)
      setPeriodos(j.periodos)
      setLabels(j.labels)
      setTotais(j.totais)
      setComparativo(j.comparativo || [])
    } catch (err: any) {
      setError(err.message)
    }
  }, [meses, mesInicio, anoInicio])


  const fetchCategorias = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/cost-categories', {
      })
      const j = await r.json()
      if (j.ok) setCategorias(j.data)
    } catch (err: any) {
      console.error(err)
    }
  }, [])


  const fetchCustos = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/monthly-costs', {
      })
      const j = await r.json()
      if (j.ok) setCustos(j.data)
    } catch (err: any) {
      console.error(err)
    }
  }, [])


  useEffect(() => {
    setLoading(true)
    Promise.all([fetchDRE(), fetchCategorias(), fetchCustos()]).finally(() => setLoading(false))
  }, [fetchDRE, fetchCategorias, fetchCustos])

  const seedCategorias = async () => {
    const defaults = [
      { nome: 'Aluguel', tipo: 'fixo', icone: '🏢', cor: '#3b82f6' },
      { nome: 'Internet', tipo: 'fixo', icone: '🌐', cor: '#06b6d4' },
      { nome: 'Contador', tipo: 'fixo', icone: '📊', cor: '#8b5cf6' },
      { nome: 'Energia', tipo: 'fixo', icone: '⚡', cor: '#f59e0b' },
      { nome: 'Marketing / Ads', tipo: 'variavel', icone: '📢', cor: '#ec4899' },
      { nome: 'Embalagem', tipo: 'variavel', icone: '📦', cor: '#84cc16' },
      { nome: 'Frete (saída)', tipo: 'variavel', icone: '🚚', cor: '#f97316' },
      { nome: 'Simples Nacional', tipo: 'imposto', icone: '🏛️', cor: '#ef4444' },
      { nome: 'ICMS / ST', tipo: 'imposto', icone: '💰', cor: '#dc2626' },
      { nome: 'Investimento / Estoque', tipo: 'investimento', icone: '🚀', cor: '#10b981' },
    ]
    for (const c of defaults) {
      await apiFetch('/api/admin/cost-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(c),
      })
    }
    fetchCategorias()
  }
  const addCategoria = async () => {
    if (!newCat.nome) return
    await apiFetch('/api/admin/cost-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify(newCat),
    })
    setNewCat({ nome: '', tipo: 'fixo', icone: '📦', cor: 'var(--psh-text-secondary, #6b7280)' })
    setShowAddCat(false)
    fetchCategorias()
  }
  const addCusto = async () => {
    if (!newCost.category_id || !newCost.valor) return
    const now = new Date()
    await apiFetch('/api/admin/monthly-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({
        category_id: newCost.category_id,
        descricao: newCost.descricao,
        valor: newCost.valor,
        ano: now.getFullYear(),
        mes: now.getMonth() + 1,
        pago_em: newCost.pago_em || null,
      }),
    })
    setNewCost({ category_id: '', descricao: '', valor: 0, pago_em: '' })
    setShowAddCost(false)
    fetchCustos()
    fetchDRE()
  }
  const deleteCusto = async (id: string) => {
    if (!confirm('Excluir este custo?')) return
    await apiFetch(`/api/admin/monthly-costs?id=${id}`, {
      method: 'DELETE',
    })
    fetchCustos()
    fetchDRE()
  }
  // Custos do mês atual
  const now = new Date()
  const custosMesAtual = custos.filter((c) => c.ano === now.getFullYear() && c.mes === now.getMonth() + 1)
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto', fontFamily: 'system-ui, sans-serif', color: 'var(--psh-text-primary, #111827)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📊 DRE — Demonstrativo de Resultado</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Visão mensal estilo Metrify — cadastre seus custos e veja o lucro real</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Período: a partir de qual mês */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--psh-bg-primary, white)', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600 }}>A partir de:</span>
            <select
              value={mesInicio}
              onChange={(e) => setMesInicio(Number(e.target.value))}
              style={{ padding: '4px 6px', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--psh-text-primary, #111827)' }}
            >
              {MESES_NOMES.map((m, i) => (
                <option key={i} value={i + 1}>{m.slice(0, 3)}</option>
              ))}
            </select>
            <select
              value={anoInicio}
              onChange={(e) => setAnoInicio(Number(e.target.value))}
              style={{ padding: '4px 6px', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--psh-text-primary, #111827)' }}
            >
              {[2024, 2025, 2026, 2027].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          {/* Quantos meses mostrar */}
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 6, fontSize: 13, fontWeight: 500, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
          >
            <option value={1}>1 mês</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={9}>9 meses</option>
            <option value="12">12 meses</option>
          </select>
          <Link href="/admin/financeiro" style={{ padding: '8px 14px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Financeiro</Link>
        </div>
      </div>
      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>
      )}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando DRE...</div>}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* DRE Table */}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 8, padding: 16, overflowX: 'auto' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📋 DRE Mensal — últimos {meses} meses</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-text-primary, #111827)' }}>
                  <th style={{ padding: '8px', textAlign: 'left', color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, fontSize: 11, minWidth: 220 }}>CONTA</th>
                  {labels.map((l, i) => (
                    <th key={i} style={{ padding: '8px', textAlign: 'right', color: 'var(--psh-text-primary, #111827)', fontWeight: 700, fontSize: 12, minWidth: 100 }}>{l}</th>
                  ))}
                  <th style={{ padding: '8px', textAlign: 'right', color: 'var(--psh-text-primary, #111827)', fontWeight: 700, fontSize: 12, minWidth: 110, background: 'var(--psh-bg-secondary, #f9fafb)' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <LinhaDRENomeado label="📈 Receita Bruta" dados={dados} keyName="receita_bruta" totais={totais} bold />
                <LinhaDRENomeado label="(-) Cancelamentos" dados={dados} keyName="cancelamentos" totais={totais} />
                <LinhaDRENomeado label="= Receita Líquida" dados={dados} keyName="receita_liquida" totais={totais} subtotal />
                <LinhaDRENomeado label="(-) CMV (Custo Produto)" dados={dados} keyName="cmv" totais={totais} />
                <LinhaDRENomeado label="= Lucro Bruto" dados={dados} keyName="lucro_bruto" totais={totais} subtotal />
                <LinhaDRENomeado label="(-) Comissões ML" dados={dados} keyName="comissoes" totais={totais} />
                <LinhaDRENomeado label="(-) Frete" dados={dados} keyName="frete" totais={totais} />
                <LinhaDRENomeado label="(-) Custos Fixos" dados={dados} keyName="custos_fixos" totais={totais} />
                <LinhaDRENomeado label="(-) Custos Variáveis" dados={dados} keyName="custos_variaveis" totais={totais} />
                <LinhaDRENomeado label="= Lucro Operacional" dados={dados} keyName="lucro_operacional" totais={totais} subtotal />
                <LinhaDRENomeado label="(-) Impostos" dados={dados} keyName="impostos" totais={totais} />
                <LinhaDRENomeado label="= Lucro Líquido" dados={dados} keyName="lucro_liquido" totais={totais} bold blue />
                {/* Margens */}
                <tr style={{ borderTop: '1px solid #e5e7eb', background: 'var(--psh-bg-secondary, #fafbfc)' }}>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>% Margem Bruta</td>
                  {dados.map((d, i) => (
                    <td key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: d.margem_bruta_pct >= 30 ? '#10b981' : d.margem_bruta_pct >= 15 ? '#f59e0b' : '#ef4444' }}>
                      {fmtPct(d.margem_bruta_pct)}
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, background: 'var(--psh-bg-secondary, #f3f4f6)' }}></td>
                </tr>
                <tr style={{ background: 'var(--psh-bg-secondary, #fafbfc)' }}>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>% Margem Líquida</td>
                  {dados.map((d, i) => (
                    <td key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: d.margem_liquida_pct >= 20 ? '#10b981' : d.margem_liquida_pct >= 10 ? '#f59e0b' : '#ef4444' }}>
                      {fmtPct(d.margem_liquida_pct)}
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, background: 'var(--psh-bg-secondary, #f3f4f6)' }}>
                    {totais && fmtPct(totais.margem_liquida_pct)}
                  </td>
                </tr>
                {/* Métricas operacionais */}
                <tr style={{ borderTop: '1px solid var(--psh-border, #e5e7eb)' }}>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>📦 Pedidos</td>
                  {dados.map((d, i) => (
                    <td key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--psh-text-primary, #111827)' }}>{d.pedidos}</td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, background: 'var(--psh-bg-secondary, #f9fafb)' }}>{totais?.pedidos || 0}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>🎯 Ticket Médio</td>
                  {dados.map((d, i) => (
                    <td key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--psh-text-primary, #111827)' }}>{fmtBRL(d.ticket_medio)}</td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, background: 'var(--psh-bg-secondary, #f9fafb)' }}>{totais && fmtBRL(totais.ticket_medio)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>📈 Variação Receita MoM</td>
                  {comparativo.map((c, i) => (
                    <td key={i} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: c.receita_var >= 0 ? '#10b981' : '#ef4444' }}>
                      {i === 0 ? '—' : (c.receita_var >= 0 ? '+' : '') + c.receita_var.toFixed(1) + '%'}
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, background: 'var(--psh-bg-secondary, #f9fafb)' }}>—</td>
                </tr>
              </tbody>
            </table>
            {/* Detalhes custos do mês atual */}
            {dados.length > 0 && dados[dados.length - 1]?.detalhes_custos && Object.keys(dados[dados.length - 1].detalhes_custos).length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--psh-bg-secondary, #f9fafb)', borderRadius: 6 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 8px 0' }}>
                  💸 Custos detalhados — {labels[labels.length - 1]}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {Object.entries(dados[dados.length - 1].detalhes_custos).map(([cat, valor]) => (
                    <div key={cat} style={{ background: 'var(--psh-bg-primary, white)', padding: 8, borderRadius: 4, border: '1px solid var(--psh-border, #e5e7eb)' }}>
                      <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>{cat}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmtBRL(valor as number)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Sidebar: cadastro de custos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Card: Custos do mês */}
            <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>
                  💸 Custos — {MESES_ABREV[now.getMonth()]}/{now.getFullYear()}
                </h3>
                <button
                  onClick={() => setShowAddCost(!showAddCost)}
                  style={{ padding: '4px 10px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                >
                  {showAddCost ? 'Cancelar' : '+ Novo'}
                </button>
              </div>
              {showAddCost && (
                <div style={{ background: 'var(--psh-bg-secondary, #f9fafb)', padding: 10, borderRadius: 6, marginBottom: 10, border: '1px solid var(--psh-border, #e5e7eb)' }}>
                  <select
                    value={newCost.category_id}
                    onChange={(e) => setNewCost({ ...newCost, category_id: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
                  >
                    <option value="">Selecione categoria...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.icone} {c.nome} ({c.tipo})</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Descrição (ex: Aluguel loja matriz)"
                    value={newCost.descricao}
                    onChange={(e) => setNewCost({ ...newCost, descricao: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor R$"
                    value={newCost.valor || ''}
                    onChange={(e) => setNewCost({ ...newCost, valor: Number(e.target.value) })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
                  />
                  <input
                    type="date"
                    value={newCost.pago_em}
                    onChange={(e) => setNewCost({ ...newCost, pago_em: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
                  />
                  <button
                    onClick={addCusto}
                    style={{ width: '100%', padding: '6px', background: '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
                  >
                    Salvar
                  </button>
                </div>
              )}
              {custosMesAtual.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 12 }}>
                  Nenhum custo cadastrado neste mês
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {custosMesAtual.map((c) => {
                    const cat = categorias.find((x) => x.id === c.category_id)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--psh-bg-secondary, #fafbfc)', borderRadius: 4, border: '1px solid var(--psh-border, #f3f4f6)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 4, background: cat?.cor || 'var(--psh-text-secondary, #6b7280)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--psh-bg-primary, white)' }}>
                          {cat?.icone || '💰'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--psh-text-primary, #111827)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.descricao || cat?.nome || c.categoria_nome || 'Custo'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)' }}>
                            {cat?.nome}
                            {c.pago_em && ` • Pago em ${new Date(c.pago_em).toLocaleDateString('pt-BR')}`}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{fmtBRL(c.valor)}</div>
                        <button
                          onClick={() => deleteCusto(c.id)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--psh-text-secondary, #9ca3af)', cursor: 'pointer', fontSize: 14 }}
                          title="Excluir"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Card: Categorias */}
            <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid var(--psh-border, #e5e7eb)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>🏷️ Categorias</h3>
                <button
                  onClick={() => setShowAddCat(!showAddCat)}
                  style={{ padding: '4px 10px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                >
                  {showAddCat ? '✕' : '+'}
                </button>
              </div>
              {showAddCat && (
                <div style={{ background: 'var(--psh-bg-secondary, #f9fafb)', padding: 10, borderRadius: 6, marginBottom: 10, border: '1px solid var(--psh-border, #e5e7eb)' }}>
                  <input
                    type="text"
                    placeholder="Nome (ex: Aluguel)"
                    value={newCat.nome}
                    onChange={(e) => setNewCat({ ...newCat, nome: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}
                  />
                  <select value={newCat.tipo} onChange={(e) => setNewCat({ ...newCat, tipo: e.target.value })} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, marginBottom: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }}>
                    <option value="fixo">Fixo</option>
                    <option value="variavel">Variável</option>
                    <option value="imposto">Imposto</option>
                    <option value="investimento">Investimento</option>
                  </select>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input type="text" placeholder="📦" value={newCat.icone} onChange={(e) => setNewCat({ ...newCat, icone: e.target.value })} style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4, fontSize: 12, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #111827)' }} />
                    <input type="color" value={newCat.cor} onChange={(e) => setNewCat({ ...newCat, cor: e.target.value })} style={{ width: 40, padding: 2, border: '1px solid var(--psh-border, #d1d5db)', borderRadius: 4 }} />
                  </div>
                  <button onClick={addCategoria} style={{ width: '100%', marginTop: 6, padding: '6px', background: '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Salvar</button>
                </div>
              )}
              {categorias.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 11 }}>
                  <p style={{ margin: '0 0 8px 0' }}>Nenhuma categoria ainda.</p>
                  <button
                    onClick={seedCategorias}
                    style={{ padding: '4px 10px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                  >
                    🌱 Criar padrões Metrify
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['fixo', 'variavel', 'imposto', 'investimento'] as const).map((tipo) => {
                    const catsTipo = categorias.filter((c) => c.tipo === tipo)
                    if (catsTipo.length === 0) return null
                    const labelTipo = { fixo: '🔒 Fixos', variavel: '📊 Variáveis', imposto: '🏛️ Impostos', investimento: '🚀 Investimentos' }[tipo]
                    return (
                      <div key={tipo} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--psh-text-secondary, #6b7280)', fontWeight: 600, marginBottom: 4 }}>{labelTipo}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {catsTipo.map((c) => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, fontSize: 11 }}>
                              <div style={{ width: 18, height: 18, borderRadius: 3, background: c.cor || 'var(--psh-text-secondary, #6b7280)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--psh-bg-primary, white)' }}>{c.icone}</div>
                              <span style={{ color: 'var(--psh-text-primary, #111827)' }}>{c.nome}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function LinhaDRENomeado({
  label,
  dados,
  keyName,
  totais,
  bold,
  subtotal,
  blue,
}: {
  label: string
  dados: DadosMes[]
  keyName: keyof DadosMes
  totais: any
  bold?: boolean
  subtotal?: boolean
  blue?: boolean
}) {
  return (
    <tr style={{
      background: subtotal ? 'var(--psh-bg-secondary, #f9fafb)' : 'transparent',
      borderTop: subtotal ? '1px solid #e5e7eb' : 'none',
      fontWeight: bold || subtotal ? 600 : 400,
    }}>
      <td style={{ padding: '8px', fontSize: 12, color: blue ? '#3b82f6' : 'var(--psh-text-primary, #111827)', fontWeight: bold || subtotal ? 700 : 500 }}>{label}</td>
      {dados.map((d, i) => {
        const v = Number(d[keyName] || 0)
        const color = v < 0 ? '#dc2626' : blue ? '#3b82f6' : 'var(--psh-text-primary, #111827)'
        return (
          <td key={i} style={{ padding: '8px', textAlign: 'right', fontSize: 12, color, fontWeight: bold || subtotal ? 700 : 500 }}>
            {fmtBRL(v)}
          </td>
        )
      })}
      <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, fontWeight: 700, background: 'var(--psh-bg-secondary, #f9fafb)', color: blue ? '#3b82f6' : 'var(--psh-text-primary, #111827)' }}>
        {fmtBRL(Number(totais?.[keyName] || 0))}
      </td>
    </tr>
  )
}
