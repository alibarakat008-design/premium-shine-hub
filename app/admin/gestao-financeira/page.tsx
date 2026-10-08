'use client'

/**
 * GESTÃO FINANCEIRA — abas: DREs | Gastos
 * Estilo Metrify (light theme)
 */
import { useEffect, useState } from 'react'

const AUTH = 'Basic ' + btoa('premium:shine2026')
const fmt = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Tab = 'dres' | 'gastos'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Expense {
  id: string; description: string; amount: string; category_type: string
  category: string; due_date: string; paid_date: string | null
  status: string; recurrence: string; notes: string | null; created_at: string
}
interface DREItem {
  mes: number; ano: number; faturamento: number; cmv: number
  lucro_bruto: number; despesas: number; lucro_liquido: number; num_pedidos: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CAT_ICONS: Record<string, string> = {
  aluguel:'🏠',salário:'👤',luz:'💡',água:'🚿',internet:'📶',
  telefone:'📱',software:'💻',contabilidade:'📊',seguros:'🛡️',
  empréstimo:'🏦',outro_fixo:'📌',
  marketing:'📢',fretes:'🚚',insumos:'📦',embalagens:'📦',
  impostos:'🏛️',comissões:'💸',vale:'💵',bonificação:'🎁',
  insumos_loja:'🏪',manutenção:'🔧',outro_var:'📌',
}
const FIXED_CATS = ['aluguel','salário','luz','água','internet','telefone','software','contabilidade','seguros','empréstimo','outro_fixo']
const VARIABLE_CATS = ['marketing','fretes','insumos','embalagens','impostos','comissões','vale','bonificação','insumos_loja','manutenção','outro_var']

// ─── Page ────────────────────────────────────────────────────────────────────
export default function GestaoFinanceiraPage() {
  const [tab, setTab] = useState<Tab>('dres')
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6em', fontWeight: 700, color: '#1f2937', margin: 0 }}>💰 Gestão Financeira</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85em', margin: '4px 0 0' }}>Visão completa de custos, DREs e gastos recorrentes</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {([['dres','📊 Gerador de DRE'],['gastos','💳 Gastos']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 24px', background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
              color: tab === t ? '#7c3aed' : '#6b7280', cursor: 'pointer', fontWeight: 700, fontSize: 14,
              marginBottom: -2,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'dres' ? <DRETab /> : <GastosTab />}
    </div>
  )
}

// ─── Tab: DRE Generator ──────────────────────────────────────────────────────
function DRETab() {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [dreData, setDreData] = useState<Record<number, DREItem>>({})
  const [loading, setLoading] = useState(true)
  const [selectedMes, setSelectedMes] = useState<number | null>(null)
  const [updating, setUpdating] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    // Busca DRE de cada mês do ano selecionado
    Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(mes =>
        fetch(`/api/financeiro/dre?year=${ano}&month=${mes}`, { headers: { Authorization: AUTH } })
          .then(r => r.json())
          .then(d => {
            if (d.success && d.data) {
              const dre = d.data.dre || {}
              return {
                mes,
                faturamento: dre.receita_liquida || dre.receita_bruta || 0,
                cmv: dre['cm v'] || dre.cmv || 0,
                lucro_bruto: dre.lucro_bruto || 0,
                despesas: dre.despesas_operacionais || 0,
                lucro_liquido: dre.lucro_liquido || 0,
                num_pedidos: d.data.kpis?.total_pedidos || 0,
              } as DREItem
            }
            return { mes, faturamento: 0, cmv: 0, lucro_bruto: 0, despesas: 0, lucro_liquido: 0, num_pedidos: 0 } as DREItem
          })
          .catch(() => ({ mes, faturamento: 0, cmv: 0, lucro_bruto: 0, despesas: 0, lucro_liquido: 0, num_pedidos: 0 } as DREItem))
      )
    ).then(results => {
      const map: Record<number, DREItem> = {}
      for (const r of results) map[r.mes] = r
      setDreData(map)
      setLoading(false)
    })
  }, [ano])

  const handleRefresh = async (mes: number) => {
    setUpdating(mes)
    // Trigger recalc do DRE via API
    await fetch(`/api/financeiro/dre?year=${ano}&month=${mes}&refresh=1`, {
      headers: { Authorization: AUTH }
    })
    // Recarrega só esse mês
    const r = await fetch(`/api/financeiro/dre?year=${ano}&month=${mes}`, { headers: { Authorization: AUTH } }).then(x => x.json())
    if (r.success && r.data) {
      const dre = r.data.dre || {}
      setDreData((prev: Record<number, DREItem>) => {
        const n: Record<number, DREItem> = { ...prev }
        n[mes] = {
          mes,
          ano,
          faturamento: dre.receita_liquida || dre.receita_bruta || 0,
          cmv: dre['cm v'] || dre.cmv || 0,
          lucro_bruto: dre.lucro_bruto || 0,
          despesas: dre.despesas_operacionais || 0,
          lucro_liquido: dre.lucro_liquido || 0,
          num_pedidos: r.data.kpis?.total_pedidos || 0,
        }
        return n
      })
    }
    setUpdating(null)
  }

  const selectedDRE = selectedMes != null ? dreData[selectedMes] : null

  return (
    <div>
      {/* Header: ano + meses */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Seletor de ano + blocos de meses */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1em', color: '#374151', fontWeight: 700 }}>Gerador de DRE</h2>
            <select value={ano} onChange={e => setAno(parseInt(e.target.value))}
              style={{ padding: '6px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#374151', fontSize: 13, fontWeight: 600 }}>
              {[2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {/* Blocos de meses */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {MESES_PT.map((nome, i) => {
              const mes = i + 1
              const data = dreData[mes]
              const hasData = data && (data.faturamento > 0 || data.num_pedidos > 0)
              const selected = selectedMes === mes
              return (
                <button key={mes} onClick={() => setSelectedMes(selected ? null : mes)}
                  style={{
                    padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                    background: selected ? '#7c3aed' : hasData ? '#f3e8ff' : '#f9fafb',
                    color: selected ? '#fff' : hasData ? '#7c3aed' : '#9ca3af',
                    fontWeight: 700, fontSize: 12, textAlign: 'center', transition: 'all 0.15s',
                    boxShadow: selected ? '0 2px 8px #7c3aed44' : 'none',
                  }}>
                  <div style={{ fontSize: '0.75em', opacity: 0.7 }}>{ano.toString().slice(2)}</div>
                  <div>{nome}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* DRE detalhado do mês selecionado */}
        <div style={{ minWidth: 280, background: selectedDRE ? '#fff' : 'transparent', border: selectedDRE ? '1px solid #e5e7eb' : 'none', borderRadius: 12, padding: selectedDRE ? 20 : 0 }}>
          {selectedDRE ? (
            <div>
              <div style={{ fontSize: '0.8em', color: '#9ca3af', marginBottom: 4 }}>{MESES_PT[selectedDRE.mes - 1]}/{ano}</div>
              <div style={{ fontSize: '1.4em', fontWeight: 800, color: selectedDRE.lucro_liquido >= 0 ? '#059669' : '#dc2626', marginBottom: 16 }}>
                {fmt(selectedDRE.lucro_liquido)}
              </div>
              <DRERow label="Faturamento" value={fmt(selectedDRE.faturamento)} />
              <DRERow label="CMV" value={fmt(selectedDRE.cmv)} color="#dc2626" />
              <DRERow label="Lucro Bruto" value={fmt(selectedDRE.lucro_bruto)} />
              <DRERow label="Despesas" value={fmt(selectedDRE.despesas)} color="#dc2626" />
              <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#374151', fontWeight: 700, fontSize: 13 }}>Lucro Líquido</span>
                <span style={{ color: selectedDRE.lucro_liquido >= 0 ? '#059669' : '#dc2626', fontWeight: 800, fontSize: 13 }}>{fmt(selectedDRE.lucro_liquido)}</span>
              </div>
              <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 6 }}>{selectedDRE.num_pedidos} pedidos</div>
            </div>
          ) : (
            <div style={{ color: '#d1d5db', fontSize: 13, padding: '40px 20px', textAlign: 'center' }}>
              Clique em um mês para ver o DRE detalhado
            </div>
          )}
        </div>
      </div>

      {/* Lista de DREs gerados */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          DREs Gerados — {ano}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>⏳ Carregando...</div>
        ) : (
          <div>
            {MESES_PT.map((nome, i) => {
              const mes = i + 1
              const data = dreData[mes]
              const hasData = data && (data.faturamento > 0 || data.num_pedidos > 0)
              if (!hasData) return null
              return (
                <div key={mes} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid #f9fafb' }}>
                  <span style={{ fontSize: '1.1em', color: '#374151' }}>▾</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>
                      {String(mes).padStart(2,'0')}/{ano}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>
                      Última atualização em {new Date().toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: data.lucro_liquido >= 0 ? '#059669' : '#dc2626' }}>
                      {fmt(data.lucro_liquido)}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>{data.num_pedidos} pedidos</div>
                  </div>
                  <button
                    onClick={() => handleRefresh(mes)}
                    disabled={updating === mes}
                    style={{
                      padding: '6px 14px', background: updating === mes ? '#e5e7eb' : '#f9fafb',
                      border: '1px solid #e5e7eb', borderRadius: 6, cursor: updating === mes ? 'default' : 'pointer',
                      color: '#374151', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                    {updating === mes ? '⏳' : '🔄'} Atualizar
                  </button>
                </div>
              )
            })}
            {Object.values(dreData).filter(d => d.faturamento > 0 || d.num_pedidos > 0).length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Nenhum DRE gerado para {ano}. Selecione um mês na lista acima.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DRERow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9fafb' }}>
      <span style={{ color: '#6b7280', fontSize: 12 }}>{label}</span>
      <span style={{ color: color || '#374151', fontWeight: 600, fontSize: 12 }}>{value}</span>
    </div>
  )
}

// ─── Tab: Gastos ─────────────────────────────────────────────────────────────
function GastosTab() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totais, setTotais] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({
    description: '', amount: '', category_type: 'fixed' as 'fixed' | 'variable',
    category: 'aluguel', due_date: '', recurrence: 'monthly' as string, notes: '',
  })

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({ mes: String(mes), ano: String(ano) })
    if (filtroTipo) params.set('category_type', filtroTipo)
    if (filtroStatus) params.set('status', filtroStatus)
    fetch(`/api/admin/expenses?${params}`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(d => { if (d.ok) { setExpenses(d.expenses || []); setTotais(d.totais) } setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [mes, ano, filtroTipo, filtroStatus])

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  const openEdit = (e: Expense) => {
    setEditing(e)
    setForm({ description: e.description, amount: String(e.amount), category_type: e.category_type as 'fixed' | 'variable', category: e.category, due_date: e.due_date ? new Date(e.due_date).toISOString().slice(0,10) : '', recurrence: e.recurrence, notes: e.notes || '' })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null); setForm({ description:'', amount:'', category_type:'fixed', category:'aluguel', due_date:'', recurrence:'monthly', notes:'' }) }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setSaving(true)
    try {
      const url = editing ? `/api/admin/expenses/${editing.id}` : '/api/admin/expenses'
      const method = editing ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: AUTH }, body: JSON.stringify(form) })
      const d = await r.json()
      if (d.ok || d.expense) { showMsg('ok', editing ? '✅ Atualizado!' : '✅ Criado!'); closeForm(); load() }
      else showMsg('err', d.error || 'Erro')
    } catch { showMsg('err', 'Erro de conexão') }
    setSaving(false)
  }

  const togglePaid = async (e: Expense) => {
    const r = await fetch(`/api/admin/expenses/${e.id}/pay`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:AUTH}, body:JSON.stringify({ paid: e.status !== 'paid', paid_date: e.due_date }) })
    const d = await r.json()
    if (d.ok) load()
    else showMsg('err', d.error || 'Erro')
  }

  const deleteExp = async (id: string) => {
    if (!confirm('Excluir esta despesa?')) return
    setDeleting(id)
    const r = await fetch(`/api/admin/expenses/${id}`, { method:'DELETE', headers:{Authorization:AUTH} })
    const d = await r.json()
    if (d.ok) { load(); showMsg('ok', '🗑️ Excluída!') }
    else showMsg('err', d.error || 'Erro')
    setDeleting(null)
  }

  const allCats = [...new Set(expenses.map(e => e.category))].sort()
  const catOpts = filtroTipo === 'fixed' ? FIXED_CATS : filtroTipo === 'variable' ? VARIABLE_CATS : [...new Set([...FIXED_CATS, ...VARIABLE_CATS, ...allCats])].sort()
  const filtradas = expenses.filter(e => {
    if (filtroCat && e.category !== filtroCat) return false
    if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const COR_STATUS: Record<string,string> = { pending: '#d97706', paid: '#059669', cancelled: '#dc2626' }
  const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  // Custos recorrentes do mês
  const recorrentes = expenses.filter(e => e.recurrence !== 'one_time')
  const recorrentesPorNome: Record<string, number> = {}
  for (const e of recorrentes) {
    recorrentesPorNome[e.description] = (recorrentesPorNome[e.description] || 0) + parseFloat(String(e.amount))
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        {/* Lado esquerdo: cadastrar custos */}
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <KPICard label="Total Pendente" value={fmt(totais?.total_pendente || 0)} color="#d97706" sub={`${totais?.count_pendente || 0} despesas`} />
            <KPICard label="Total Pago" value={fmt(totais?.total_pago || 0)} color="#059669" sub={`${totais?.count_pago || 0} pagas`} />
            <KPICard label="Fixos" value={fmt(totais?.total_fixo || 0)} color="#7c3aed" sub="mensais" />
            <KPICard label="Variáveis" value={fmt(totais?.total_variavel || 0)} color="#2563eb" sub="marketing/fretes" />
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <select value={mes} onChange={e => setMes(parseInt(e.target.value))}
              style={{ padding:'8px 12px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13 }}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{(i+1+'').padStart(2,'0')}/{ano}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(parseInt(e.target.value))}
              style={{ padding:'8px 12px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13 }}>
              {[2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              style={{ padding:'8px 12px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13 }}>
              <option value="">Todos status</option><option value="pending">⏳ Pendentes</option><option value="paid">✅ Pagas</option>
            </select>
            <input type="text" placeholder="🔍 Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding:'8px 14px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, flex:1, minWidth:150 }} />
            <button onClick={() => setShowForm(true)} style={{
              padding:'8px 18px', background:'#7c3aed', border:'none', borderRadius:8, color:'#fff',
              fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap',
            }}>+ Nova Despesa</button>
          </div>

          {/* Msg */}
          {msg && (
            <div style={{ background: msg.type==='ok'?'#ecfdf5':'#fef2f2', border:`1px solid ${msg.type==='ok'?'#059669':'#dc2626'}`, borderRadius:8, padding:'10px 16px', color:msg.type==='ok'?'#059669':'#dc2626', fontSize:13, marginBottom:14 }}>
              {msg.text}
            </div>
          )}

          {/* Tabela */}
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>⏳ Carregando...</div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#d1d5db', fontSize:14 }}>
              Nenhuma despesa.{' '}<button onClick={()=>setShowForm(true)} style={{ background:'none', border:'none', color:'#7c3aed', cursor:'pointer', fontWeight:600 }}>Cadastrar a primeira →</button>
            </div>
          ) : (
            <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', borderBottom:'1px solid #f3f4f6', color:'#6b7280', fontSize:12, fontWeight:600 }}>
                {filtradas.length} despesa(s)
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ color:'#9ca3af', borderBottom:'1px solid #f3f4f6' }}>
                      <th style={{ textAlign:'left', padding:'9px 14px' }}>Descrição</th>
                      <th style={{ textAlign:'center', padding:'9px 14px' }}>Categoria</th>
                      <th style={{ textAlign:'center', padding:'9px 14px' }}>Vencimento</th>
                      <th style={{ textAlign:'center', padding:'9px 14px' }}>Recorrência</th>
                      <th style={{ textAlign:'right', padding:'9px 14px' }}>Valor</th>
                      <th style={{ textAlign:'center', padding:'9px 14px' }}>Status</th>
                      <th style={{ textAlign:'center', padding:'9px 14px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(e => (
                      <tr key={e.id} style={{ borderBottom:'1px solid #f9fafb', background: e.status==='paid'?'#f0fdf4':'transparent' }}>
                        <td style={{ padding:'9px 14px' }}>
                          <div style={{ color:'#1f2937', fontWeight:600 }}>{e.description}</div>
                          {e.notes && <div style={{ color:'#9ca3af', fontSize:10 }}>{e.notes}</div>}
                        </td>
                        <td style={{ textAlign:'center', color:'#6b7280', fontSize:12 }}>
                          <span style={{ color: e.category_type==='fixed'?'#7c3aed':'#2563eb', fontWeight:600 }}>{CAT_ICONS[e.category]||'📌'} {e.category}</span>
                        </td>
                        <td style={{ textAlign:'center', color:'#6b7280', fontSize:12 }}>{fmtD(e.due_date)}</td>
                        <td style={{ textAlign:'center' }}>
                          <span style={{ background:'#f3f4f6', color:'#6b7280', borderRadius:4, padding:'2px 6px', fontSize:10 }}>
                            {e.recurrence==='monthly'?'↺ Mensal':e.recurrence==='yearly'?'📅 Anual':'⚡ Única'}
                          </span>
                        </td>
                        <td style={{ textAlign:'right', color:'#7c3aed', fontWeight:700 }}>{fmt(parseFloat(String(e.amount)))}</td>
                        <td style={{ textAlign:'center' }}>
                          <span onClick={() => togglePaid(e)} style={{ background: COR_STATUS[e.status]+'22', color: COR_STATUS[e.status], borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            {e.status==='paid'?'✅ Paga':e.status==='cancelled'?'❌ Canc.':'⏳ Pend.'}
                          </span>
                        </td>
                        <td style={{ textAlign:'center' }}>
                          <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                            <button onClick={()=>openEdit(e)} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:5, color:'#2563eb', cursor:'pointer', padding:'3px 8px', fontSize:11 }}>✏️</button>
                            <button onClick={()=>deleteExp(e.id)} disabled={deleting===e.id} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:5, color:'#dc2626', cursor:'pointer', padding:'3px 8px', fontSize:11 }}>{deleting===e.id?'...':'🗑️'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Lado direito: Custos Recorrentes */}
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden', position:'sticky', top:0 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f3f4f6', fontSize:13, fontWeight:700, color:'#374151' }}>🏭 Custos Recorrentes</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ color:'#9ca3af', borderBottom:'1px solid #f3f4f6' }}>
                <th style={{ textAlign:'left', padding:'8px 14px' }}>Nome</th>
                <th style={{ textAlign:'right', padding:'8px 14px' }}>Parcela</th>
                <th style={{ textAlign:'center', padding:'8px 6px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(recorrentesPorNome).map(([nome, total]) => (
                <tr key={nome} style={{ borderBottom:'1px solid #f9fafb' }}>
                  <td style={{ padding:'9px 14px', color:'#374151', fontSize:12 }}>{nome}</td>
                  <td style={{ textAlign:'right', padding:'9px 14px', color:'#7c3aed', fontWeight:700, fontSize:12 }}>{fmt(total)}</td>
                  <td style={{ textAlign:'center', padding:'9px 6px' }}>
                    <button style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:5, color:'#6b7280', cursor:'pointer', padding:'3px 6px', fontSize:10 }}>⋮</button>
                  </td>
                </tr>
              ))}
              {Object.keys(recorrentesPorNome).length === 0 && (
                <tr><td colSpan={3} style={{ padding:'30px 14px', textAlign:'center', color:'#d1d5db', fontSize:12 }}>Nenhum custo recorrente</td></tr>
              )}
            </tbody>
            {Object.keys(recorrentesPorNome).length > 0 && (
              <tfoot>
                <tr style={{ background:'#f9fafb' }}>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#374151', fontSize:12 }}>Total</td>
                  <td style={{ textAlign:'right', padding:'10px 14px', fontWeight:800, color:'#7c3aed', fontSize:13 }}>
                    {fmt(Object.values(recorrentesPorNome).reduce((a,b)=>a+b,0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={e=>{ if(e.target===e.currentTarget)closeForm() }}>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:28, width:'100%', maxWidth:480, color:'#1f2937', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:'1.2em', color:'#374151' }}>{editing ? '✏️ Editar' : '➕ Nova Despesa'}</h2>
              <button onClick={closeForm} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Descrição *</label>
                <input type="text" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} required placeholder="Ex: Aluguel warehouse"
                  style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Valor (R$) *</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required
                    style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Vencimento *</label>
                  <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} required
                    style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Tipo</label>
                  <select value={form.category_type} onChange={e=>{ const ct=e.target.value as 'fixed'|'variable'; setForm(f=>({...f,category_type:ct,category:ct==='fixed'?'aluguel':'marketing'})) }}
                    style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }}>
                    <option value="fixed">📌 Fixo</option><option value="variable">📊 Variável</option>
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Recorrência</label>
                  <select value={form.recurrence} onChange={e=>setForm(f=>({...f,recurrence:e.target.value}))}
                    style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }}>
                    <option value="monthly">↺ Mensal</option><option value="yearly">📅 Anual</option><option value="one_time">⚡ Única</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', color:'#6b7280', fontSize:12, marginBottom:5 }}>Categoria</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                  style={{ width:'100%', padding:'9px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#374151', fontSize:13, boxSizing:'border-box' }}>
                  {(form.category_type==='fixed'?FIXED_CATS:VARIABLE_CATS).map(c=><option key={c} value={c}>{CAT_ICONS[c]||'📌'} {c}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" onClick={closeForm} style={{ padding:'9px 20px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, color:'#6b7280', cursor:'pointer', fontSize:13 }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ padding:'9px 24px', background:'#7c3aed', border:'none', borderRadius:8, color:'#fff', fontWeight:700, fontSize:13, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
                  {saving?'Salvando...':editing?'💾 Atualizar':'✅ Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:16 }}>
      <div style={{ color:'#9ca3af', fontSize:'0.8em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:'1.3em', fontWeight:700, color }}>{value}</div>
      {sub && <div style={{ color:'#d1d5db', fontSize:'0.75em', marginTop:2 }}>{sub}</div>}
    </div>
  )
}
