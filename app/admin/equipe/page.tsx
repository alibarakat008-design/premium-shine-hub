'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Membro {
  id: string; nome: string; cargo: string | null; foto_url: string | null
  telefone: string | null; email: string | null; data_nascimento: string | null
  data_admissao: string | null; salario_base: string | null; ativo: boolean; observacao: string | null
}

interface Ponto {
  id: string; equipe_id: string; tipo: string; data_hora: string
  foto_url: string | null; observacao: string | null
  equipe: { id: string; nome: string; foto_url: string | null }
}

interface Pagamento {
  id: string; equipe_id: string; tipo: string; valor: string
  data_pagamento: string; referencia_mes: number | null; referencia_ano: number | null
  observacao: string | null; equipe: { id: string; nome: string; foto_url: string | null }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const AUTH = 'Basic ' + btoa('premium:shine2026')
const fmt = (v: string | number) => parseFloat(String(v) || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const fmtH = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const hoje = () => new Date().toISOString().split('T')[0]
const ANOS = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

const TIPO_PAG = [
  { value: 'salario', label: '💰 Salário', cor: '#22c55e' },
  { value: 'vale', label: '🏧 Vale', cor: '#60a5fa' },
  { value: 'bonus', label: '🎁 Bônus', cor: '#f59e0b' },
  { value: 'decimo_terceiro', label: '13º', cor: '#a78bfa' },
  { value: 'ferias', label: '🏖️ Férias', cor: '#06b6d4' },
  { value: 'outro', label: '📋 Outro', cor: '#7070a0' },
]

// ─── UI Primitives ───────────────────────────────────────────────────────────
function Badge({ txt, cor }: { txt: string; cor: string }) {
  return (
    <span style={{ background: cor + '22', color: cor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {txt}
    </span>
  )
}

function Toast({ msg, cor = '#22c55e' }: { msg: string; cor?: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: cor, color: '#000', padding: '10px 24px', borderRadius: 10,
      fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>{msg}</div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 900 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 16,
        width: '95vw', maxWidth: 560, maxHeight: '88vh', zIndex: 901,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#d0c0ff' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>
      </div>
    </>
  )
}

function inp(label: string, value: string, onChange: (v: string) => void, type = 'text', ph = '') {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
      />
    </label>
  )
}

function sel(label: string, value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Btn({ label, onClick, cor = '#6366f1', loading = false }: { label: string; onClick: () => void; cor?: string; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ padding: '9px 20px', background: cor, border: 'none', borderRadius: 8, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: loading ? 0.7 : 1 }}>
      {loading ? '⏳' : label}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EquipePage() {
  const [tab, setTab] = useState<'equipe' | 'ponto' | 'pagamentos'>('equipe')
  const [authOk, setAuthOk] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastCor, setToastCor] = useState('#22c55e')

  // Equipe
  const [membros, setMembros] = useState<Membro[]>([])
  const [equipeLoading, setEquipeLoading] = useState(false)
  const [modalMembro, setModalMembro] = useState<Membro | null>(null)
  const [form, setForm] = useState({
    nome: '', cargo: '', foto_url: '', telefone: '', email: '',
    data_nascimento: '', data_admissao: '', salario_base: '', ativo: true, observacao: '',
  })
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')

  // Pagamentos
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [pgtoLoading, setPgtoLoading] = useState(false)
  const [filtroMes, setFiltroMes] = useState(String(new Date().getMonth() + 1))
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()))
  const [modalNovoPagto, setModalNovoPagto] = useState(false)
  const [pgtoForm, setPgtoForm] = useState({
    equipe_id: '', tipo: 'vale', valor: '', data_pagamento: hoje(),
    referencia_mes: Number(filtroMes), referencia_ano: Number(filtroAno), observacao: '',
  })
  const [pgtoSaving, setPgtoSaving] = useState(false)
  const [pagtoSelecionado, setPagtoSelecionado] = useState<Membro | null>(null)
  const [resumo, setResumo] = useState<Record<string, { total_pago: number; count: number }>>({})

  // Ponto
  const [modalPonto, setModalPonto] = useState(false)
  const [pontoForm, setPontoForm] = useState({ equipe_id: '', tipo: 'entrada', observacao: '' })
  const [regLoading, setRegLoading] = useState(false)
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [pontosLoading, setPontosLoading] = useState(false)

  function showToast(msg: string, cor = '#22c55e') {
    setToastCor(cor)
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const loadEquipe = useCallback(async () => {
    setEquipeLoading(true)
    try {
      const r = await fetch('/api/admin/equipe?ativo=true', { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) setMembros(d.data)
    } catch (e) { console.error(e) } finally { setEquipeLoading(false) }
  }, [])

  const loadPagamentos = useCallback(async () => {
    setPgtoLoading(true)
    try {
      const r = await fetch(`/api/admin/equipe/pagamentos?mes=${filtroMes}&ano=${filtroAno}`, { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) setPagamentos(d.data)
    } catch (e) { console.error(e) } finally { setPgtoLoading(false) }
  }, [filtroMes, filtroAno])

  const loadResumo = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/equipe/pagamentos?mes=${filtroMes}&ano=${filtroAno}`, { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) {
        const map: Record<string, { total_pago: number; count: number }> = {}
        for (const p of d.data) {
          if (!map[p.equipe_id]) map[p.equipe_id] = { total_pago: 0, count: 0 }
          map[p.equipe_id].total_pago += parseFloat(p.valor)
          map[p.equipe_id].count++
        }
        setResumo(map)
      }
    } catch (e) { console.error(e) }
  }, [filtroMes, filtroAno])

  const loadPontos = useCallback(async () => {
    setPontosLoading(true)
    try {
      const r = await fetch(`/api/admin/equipe/ponto?data=${hoje()}`, { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) setPontos(d.data)
    } catch (e) { console.error(e) } finally { setPontosLoading(false) }
  }, [])

  useEffect(() => {
    fetch('/api/admin/login-empresa', { headers: { Authorization: 'Basic ' + btoa('premium:shine2026') }, credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.ok) setAuthOk(true) })
  }, [])

  useEffect(() => { if (authOk) loadEquipe() }, [authOk, loadEquipe])

  useEffect(() => {
    if (tab === 'pagamentos') { loadPagamentos(); loadResumo() }
    if (tab === 'ponto') loadPontos()
  }, [tab, authOk, loadPagamentos, loadResumo, loadPontos])

  // CRUD
  function abrirNovo() {
    setModalMembro(null)
    setForm({ nome: '', cargo: '', foto_url: '', telefone: '', email: '', data_nascimento: '', data_admissao: '', salario_base: '', ativo: true, observacao: '' })
  }

  function abrirEdit(m: Membro) {
    setModalMembro(m)
    setForm({
      nome: m.nome, cargo: m.cargo || '', foto_url: m.foto_url || '', telefone: m.telefone || '', email: m.email || '',
      data_nascimento: m.data_nascimento ? m.data_nascimento.split('T')[0] : '',
      data_admissao: m.data_admissao ? m.data_admissao.split('T')[0] : '',
      salario_base: m.salario_base || '', ativo: m.ativo, observacao: m.observacao || '',
    })
  }

  async function salvarMembro() {
    if (!form.nome.trim()) { showToast('❌ Nome obrigatório', '#ef4444'); return }
    setSaving(true)
    try {
      const method = modalMembro ? 'PUT' : 'POST'
      let url = '/api/admin/equipe'
      if (modalMembro) url += '?id=' + modalMembro.id
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify(form) })
      const d = await r.json()
      if (d.ok) { showToast('✅ Salvo!'); setModalMembro(null); loadEquipe() }
      else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') } finally { setSaving(false) }
  }

  async function deletarMembro(id: string) {
    if (!confirm('Remover este colaborador?')) return
    const r = await fetch('/api/admin/equipe?id=' + id, { method: 'DELETE', headers: { Authorization: AUTH } })
    const d = await r.json()
    if (d.ok) { showToast('🗑️ Removido'); loadEquipe() } else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
  }

  // Pagamentos
  function abrirNovoPagto(membro?: Membro) {
    if (membro) setPagtoSelecionado(membro)
    else setPagtoSelecionado(null)
    setPgtoForm({ equipe_id: membro ? membro.id : '', tipo: 'vale', valor: '', data_pagamento: hoje(), referencia_mes: Number(filtroMes), referencia_ano: Number(filtroAno), observacao: '' })
    setModalNovoPagto(true)
  }

  async function salvarPagto() {
    if (!pgtoForm.equipe_id) { showToast('❌ Selecione alguém', '#ef4444'); return }
    if (!pgtoForm.valor || Number(pgtoForm.valor) <= 0) { showToast('❌ Valor inválido', '#ef4444'); return }
    setPgtoSaving(true)
    try {
      const r = await fetch('/api/admin/equipe/pagamentos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify(pgtoForm) })
      const d = await r.json()
      if (d.ok) { showToast('✅ ' + fmt(pgtoForm.valor) + ' registrado!'); setModalNovoPagto(false); loadPagamentos(); loadResumo() }
      else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') } finally { setPgtoSaving(false) }
  }

  async function deletarPagto(id: string) {
    if (!confirm('Remover este pagamento?')) return
    const r = await fetch('/api/admin/equipe/pagamentos?id=' + id, { method: 'DELETE', headers: { Authorization: AUTH } })
    const d = await r.json()
    if (d.ok) { showToast('🗑️ Removido'); loadPagamentos(); loadResumo() } else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
  }

  // Ponto
  function abrirPonto() {
    setPontoForm({ equipe_id: '', tipo: 'entrada', observacao: '' })
    setModalPonto(true)
  }

  async function registrarPonto() {
    if (!pontoForm.equipe_id) { showToast('❌ Selecione alguém', '#ef4444'); return }
    setRegLoading(true)
    try {
      const r = await fetch('/api/admin/equipe/ponto', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify(pontoForm) })
      const d = await r.json()
      if (d.ok) { showToast('✅ Ponto registrado!'); setModalPonto(false); loadPontos() } else showToast('❌ ' + (d.error || 'Erro'), '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') } finally { setRegLoading(false) }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!authOk) {
    return (
      <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        ⏳ Carregando...
      </div>
    )
  }

  const filtrados = membros.filter(function(m: Membro) {
    return !busca || m.nome.toLowerCase().includes(busca.toLowerCase()) || (m.cargo || '').toLowerCase().includes(busca.toLowerCase())
  })

  const totalMes = pagamentos.reduce(function(a, p) { return a + parseFloat(p.valor) }, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>👥 Equipe</h1>
            <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>{membros.length} colaboradores ativos</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'equipe' && <Btn label="➕ Novo Membro" onClick={abrirNovo} />}
            {tab === 'pagamentos' && <Btn label="💰 Novo Pagamento" onClick={function() { abrirNovoPagto() }} cor="#22c55e" />}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1400, margin: '0 auto', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2a2a4a', paddingBottom: 0 }}>
          {([['equipe','👥 Equipe'], ['pagamentos','💰 Pagamentos'], ['ponto','🕐 Ponto']] as [string, string][]).map(function(item: [string, string]) {
            return (
              <button key={item[0]} onClick={function() { setTab(item[0] as 'equipe' | 'ponto' | 'pagamentos') }}
                style={{
                  padding: '10px 20px', background: 'transparent', border: 'none',
                  borderBottom: tab === item[0] ? '2px solid #a78bfa' : '2px solid transparent',
                  color: tab === item[0] ? '#d0c0ff' : '#7070a0', cursor: 'pointer',
                  fontWeight: tab === item[0] ? 700 : 400, fontSize: 13, marginBottom: -1,
                }}>
                {item[1]}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ── TAB EQUIPE ─────────────────────────────────── */}
        {tab === 'equipe' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <input type="text" value={busca} onChange={function(e: any) { setBusca(e.target.value) }} placeholder="🔍 Buscar por nome ou cargo..."
                style={{ padding: '9px 14px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, width: 280, outline: 'none' }} />
            </div>
            {equipeLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳ Carregando...</div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#4a4a7a' }}>
                {busca ? 'Nenhum resultado.' : 'Nenhum colaborador. Clique em "Novo Membro"!'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
                {filtrados.map(function(m: Membro) {
                  return (
                    <div key={m.id}
                      style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}
                      onMouseEnter={function(e: any) { e.currentTarget.style.borderColor = '#6366f1' }}
                      onMouseLeave={function(e: any) { e.currentTarget.style.borderColor = '#2a2a4a' }}>
                      <div style={{ height: 48, background: 'linear-gradient(135deg, #1a1a3a 0%, #2a1a4a 100%)', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                          {m.ativo ? <Badge txt="Ativo" cor="#22c55e" /> : <Badge txt="Inativo" cor="#ef4444" />}
                        </div>
                      </div>
                      <div style={{ marginTop: -24, paddingLeft: 12 }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2a2a4a', border: '3px solid #12122a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {m.foto_url ? <img src={m.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#a78bfa', fontSize: 20, fontWeight: 700 }}>{m.nome.charAt(0).toUpperCase()}</span>}
                        </div>
                      </div>
                      <div style={{ padding: '10px 14px 14px' }}>
                        <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: 14 }}>{m.nome}</div>
                        <div style={{ color: '#7070a0', fontSize: 11, marginTop: 2 }}>{m.cargo || 'Sem cargo'}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                          {m.salario_base && m.salario_base !== '0' && <Badge txt={fmt(m.salario_base)} cor="#22c55e" />}
                          {m.data_nascimento && <Badge txt={'🎂 ' + fmtD(m.data_nascimento)} cor="#f59e0b" />}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                          <button onClick={function() { abrirEdit(m) }}
                            style={{ flex: 1, padding: '7px 0', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                            ✏️ Editar
                          </button>
                          <button onClick={function() { setPagtoSelecionado(m); setTab('pagamentos') }}
                            style={{ flex: 1, padding: '7px 0', background: '#1a2a2a', border: 'none', borderRadius: 8, color: '#22c55e', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                            💰 Pagamentos
                          </button>
                          <button onClick={function() { deletarMembro(m.id) }}
                            style={{ padding: '7px 10px', background: 'transparent', border: '1px solid #3a2a2a', borderRadius: 8, color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB PAGAMENTOS ─────────────────────────────── */}
        {tab === 'pagamentos' && (
          <div>
            {/* Seletor de mês */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <select value={filtroMes} onChange={function(e: any) { setFiltroMes(e.target.value) }}
                style={{ padding: '8px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
                {MESES.map(function(m, i) { return <option key={m} value={String(i + 1)}>{m}</option> })}
              </select>
              <select value={filtroAno} onChange={function(e: any) { setFiltroAno(e.target.value) }}
                style={{ padding: '8px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13 }}>
                {ANOS.map(function(y) { return <option key={y} value={String(y)}>{y}</option> })}
              </select>
              <span style={{ color: '#7070a0', fontSize: 13 }}>{MESES[Number(filtroMes) - 1]}/{filtroAno}</span>
              <span style={{ marginLeft: 8, background: '#1a2a2a', color: '#22c55e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
                Total: {fmt(totalMes)}
              </span>
              <button onClick={function() { loadPagamentos(); loadResumo() }}
                style={{ padding: '8px 14px', background: '#1a1a3a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#7070a0', cursor: 'pointer', fontSize: 12 }}>
                ↻
              </button>
            </div>

            {/* Resumo por membro */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ color: '#d0c0ff', fontSize: 13, marginBottom: 10 }}>📊 Resumo — {MESES[Number(filtroMes) - 1]}/{filtroAno}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {membros.filter(function(m: Membro) { return m.ativo }).map(function(m: Membro) {
                  const sal = m.salario_base ? parseFloat(m.salario_base) : 0
                  const pago = resumo[m.id] ? resumo[m.id].total_pago : 0
                  const falta = sal > 0 ? sal - pago : 0
                  const pct = sal > 0 ? Math.min(100, (pago / sal) * 100) : 0
                  return (
                    <div key={m.id}
                      onClick={function() { abrirNovoPagto(m) }}
                      style={{ background: '#12122a', border: falta > 0 ? '1px solid #f59e0b44' : '1px solid #22c55e44', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={function(e: any) { e.currentTarget.style.borderColor = '#a78bfa' }}
                      onMouseLeave={function(e: any) { e.currentTarget.style.borderColor = falta > 0 ? '#f59e0b44' : '#22c55e44' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2a2a4a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {m.foto_url ? <img src={m.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700 }}>{m.nome.charAt(0)}</span>}
                        </div>
                        <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#7070a0' }}>Salário</span><span style={{ color: '#d0c0ff', fontWeight: 600 }}>{fmt(sal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#7070a0' }}>Pago</span><span style={{ color: '#22c55e', fontWeight: 600 }}>{fmt(pago)}</span>
                      </div>
                      {sal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: '#7070a0' }}>Falta</span><span style={{ color: falta > 0 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>{fmt(falta)}</span>
                        </div>
                      )}
                      <div style={{ marginTop: 6, height: 3, background: '#1a1a3a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: String(pct) + '%', height: '100%', background: sal > 0 && falta > 0 ? '#f59e0b' : '#22c55e', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ color: '#4a4a7a', fontSize: 9, marginTop: 3 }}>
                        {resumo[m.id] ? resumo[m.id].count : 0} pagamento(s)
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Lista */}
            <div>
              <h3 style={{ color: '#d0c0ff', fontSize: 13, marginBottom: 10 }}>📋 Registros — {MESES[Number(filtroMes) - 1]}/{filtroAno}</h3>
              {pgtoLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#7070a0' }}>⏳ Carregando...</div>
              ) : pagamentos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, background: '#12122a', borderRadius: 12, border: '1px dashed #2a2a4a', color: '#4a4a7a' }}>
                  Nenhum pagamento em {MESES[Number(filtroMes) - 1]}/{filtroAno}.<br />Clique em "💰 Novo Pagamento" ou em algum cartão acima.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pagamentos.map(function(p: Pagamento) {
                    const t = TIPO_PAG.find(function(x: any) { return x.value === p.tipo })
                    return (
                      <div key={p.id} style={{ background: '#12122a', border: '1px solid #1a1a3a', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: t ? t.cor : '#7070a0', fontWeight: 700 }}>{t ? t.label : p.tipo}</span>
                            {p.referencia_mes && <span style={{ color: '#4a4a7a', fontSize: 10 }}>{MESES[p.referencia_mes - 1]}/{p.referencia_ano}</span>}
                          </div>
                          {p.observacao && <div style={{ color: '#4a4a7a', fontSize: 10, marginTop: 2 }}>{p.observacao}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>{fmt(p.valor)}</div>
                          <div style={{ color: '#7070a0', fontSize: 10 }}>{fmtD(p.data_pagamento)}</div>
                        </div>
                        <button onClick={function() { deletarPagto(p.id) }}
                          style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #3a2a2a', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB PONTO ─────────────────────────────────── */}
        {tab === 'ponto' && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ color: '#7070a0', fontSize: 13 }}>📅 Hoje: <strong style={{ color: '#d0c0ff' }}>{fmtD(hoje())}</strong></span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Btn label="↻ Atualizar" onClick={loadPontos} />
                <Btn label="🕐 Registrar" onClick={abrirPonto} cor="#22c55e" />
              </div>
            </div>
            {pontosLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳</div>
            ) : pontos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, background: '#12122a', borderRadius: 12, border: '1px dashed #2a2a4a', color: '#4a4a7a' }}>
                Nenhum registro hoje.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pontos.map(function(p: Ponto) {
                  return (
                    <div key={p.id} style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1a3a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {p.equipe.foto_url ? <img src={p.equipe.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ color: '#a78bfa', fontSize: 16 }}>{p.equipe.nome.charAt(0)}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: 13 }}>{p.equipe.nome}</div>
                        {p.observacao && <div style={{ color: '#7070a0', fontSize: 11 }}>{p.observacao}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Badge
                          txt={p.tipo === 'entrada' ? '➡️ Entrada' : p.tipo === 'saida' ? '⬅️ Saída' : '⏸ Pausa'}
                          cor={p.tipo === 'entrada' ? '#22c55e' : p.tipo === 'saida' ? '#ef4444' : '#f59e0b'}
                        />
                        <div style={{ color: '#60a5fa', fontSize: 15, fontWeight: 700, marginTop: 4, fontFamily: 'monospace' }}>{fmtH(p.data_hora)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL MEMBRO ─────────────────────────────── */}
      {modalMembro !== null && (
        <Modal title={modalMembro ? '✏️ Editar Membro' : '➕ Novo Membro'} onClose={function() { setModalMembro(null) }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start' }}>
            <div>
              <div onClick={function() {
                var el = document.createElement('input')
                el.type = 'file'
                el.accept = 'image/*'
                el.onchange = function(e: any) {
                  var file = e.target.files[0]
                  if (file) setForm(function(q: any) { return Object.assign({}, q, { foto_url: URL.createObjectURL(file) }) })
                }
                el.click()
              }}
                style={{ width: 72, height: 72, borderRadius: 12, background: '#0a0a1a', border: '2px dashed #2a2a4a', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                {form.foto_url ? <img src={form.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>📷</span>}
              </div>
              <div style={{ color: '#4a4a7a', fontSize: 9, textAlign: 'center' }}>clique + foto</div>
            </div>
            <div>
              {inp('Nome completo *', form.nome, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { nome: v }) }) }, 'text', 'Ex: Maria Silva')}
              {inp('Cargo', form.cargo, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { cargo: v }) }) }, 'text', 'Ex: Vendedora')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {inp('Telefone', form.telefone, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { telefone: v }) }) }, 'tel')}
            {inp('E-mail', form.email, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { email: v }) }) }, 'email')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {inp('Nascimento', form.data_nascimento, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { data_nascimento: v }) }) }, 'date')}
            {inp('Admissão', form.data_admissao, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { data_admissao: v }) }) }, 'date')}
          </div>
          {inp('Salário base (R$)', form.salario_base, function(v: string) { setForm(function(q: any) { return Object.assign({}, q, { salario_base: v }) }) }, 'number')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" id="ativo" checked={form.ativo} onChange={function(e: any) { setForm(function(q: any) { return Object.assign({}, q, { ativo: e.target.checked }) }) }} />
            <label htmlFor="ativo" style={{ color: '#d0c0ff', fontSize: 13, cursor: 'pointer' }}>Colaborador ativo</label>
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>
              Observação <span style={{ color: '#4a4a7a' }}>(para biométrico, escreva: biometrico:123)</span>
            </div>
            <textarea value={form.observacao} onChange={function(e: any) { setForm(function(q: any) { return Object.assign({}, q, { observacao: e.target.value }) }) }} rows={2}
              style={{ width: '100%', padding: '8px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn label="Salvar" onClick={salvarMembro} cor="#22c55e" loading={saving} />
          </div>
        </Modal>
      )}

      {/* ── MODAL PAGAMENTO ────────────────────────────── */}
      {modalNovoPagto && (
        <Modal title="💰 Registrar Pagamento" onClose={function() { setModalNovoPagto(false) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Colaborador */}
            <div style={{ background: '#0f0f22', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 6 }}>Colaborador</div>
              {pagtoSelecionado ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2a2a4a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pagtoSelecionado.foto_url ? <img src={pagtoSelecionado.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#a78bfa', fontWeight: 700 }}>{pagtoSelecionado.nome.charAt(0)}</span>}
                  </div>
                  <div>
                    <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: 13 }}>{pagtoSelecionado.nome}</div>
                    {pagtoSelecionado.salario_base && <div style={{ color: '#22c55e', fontSize: 11 }}>Salário: {fmt(pagtoSelecionado.salario_base)}</div>}
                  </div>
                  <button onClick={function() { setPagtoSelecionado(null) }}
                    style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2a2a4a', borderRadius: 6, color: '#7070a0', cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}>
                    Mudar
                  </button>
                </div>
              ) : (
                <select value={pgtoForm.equipe_id} onChange={function(e: any) { setPgtoForm(function(q: any) { return Object.assign({}, q, { equipe_id: e.target.value }) }) }}
                  style={{ width: '100%', padding: '8px 12px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 13, outline: 'none' }}>
                  <option value="">Selecione...</option>
                  {membros.filter(function(m: Membro) { return m.ativo }).map(function(m: Membro) {
                    return <option key={m.id} value={m.id}>{m.nome}{m.cargo ? ' — ' + m.cargo : ''}</option>
                  })}
                </select>
              )}
            </div>

            {/* Tipo */}
            <div style={{ color: '#7070a0', fontSize: 11, marginBottom: 4 }}>Tipo de pagamento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TIPO_PAG.map(function(t: { value: string; label: string; cor: string }) {
                return (
                  <button key={t.value} onClick={function() { setPgtoForm(function(q: any) { return Object.assign({}, q, { tipo: t.value }) }) }}
                    style={{
                      padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      border: '2px solid ' + (pgtoForm.tipo === t.value ? t.cor : '#2a2a4a'),
                      background: pgtoForm.tipo === t.value ? t.cor + '22' : 'transparent',
                      color: pgtoForm.tipo === t.value ? t.cor : '#7070a0', transition: 'all 0.15s',
                    }}>
                    {t.label}
                  </button>
                )
              })}
            </div>

            {inp('Valor (R$)', pgtoForm.valor, function(v: string) { setPgtoForm(function(q: any) { return Object.assign({}, q, { valor: v }) }) }, 'number')}
            {inp('Data do pagamento', pgtoForm.data_pagamento, function(v: string) { setPgtoForm(function(q: any) { return Object.assign({}, q, { data_pagamento: v }) }) }, 'date')}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {sel('Mês referência', String(pgtoForm.referencia_mes), function(v: string) { setPgtoForm(function(q: any) { return Object.assign({}, q, { referencia_mes: Number(v) }) }) },
                MESES.map(function(m, i) { return { value: String(i + 1), label: m } }))}
              {sel('Ano referência', String(pgtoForm.referencia_ano), function(v: string) { setPgtoForm(function(q: any) { return Object.assign({}, q, { referencia_ano: Number(v) }) }) },
                ANOS.map(function(y) { return { value: String(y), label: String(y) } }))}
            </div>

            {inp('Observação', pgtoForm.observacao, function(v: string) { setPgtoForm(function(q: any) { return Object.assign({}, q, { observacao: v }) }) }, 'text', 'Ex: 1ª parcela, bônus por meta...')}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn label="Registrar" onClick={salvarPagto} cor="#22c55e" loading={pgtoSaving} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL PONTO ────────────────────────────────── */}
      {modalPonto && (
        <Modal title="🕐 Registrar Ponto" onClose={function() { setModalPonto(false) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <select value={pontoForm.equipe_id} onChange={function(e: any) { setPontoForm(function(q: any) { return Object.assign({}, q, { equipe_id: e.target.value }) }) }}
              style={{ padding: '10px 14px', background: '#0a0a1a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0', fontSize: 14 }}>
              <option value="">Selecione o colaborador...</option>
              {membros.filter(function(m: Membro) { return m.ativo }).map(function(m: Membro) {
                return <option key={m.id} value={m.id}>{m.nome}{m.cargo ? ' — ' + m.cargo : ''}</option>
              })}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {(['entrada', 'saida', 'pausa'] as const).map(function(t: string) {
                return (
                  <button key={t} onClick={function() { setPontoForm(function(q: any) { return Object.assign({}, q, { tipo: t }) }) }}
                    style={{
                      padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      border: '2px solid ' + (pontoForm.tipo === t ? (t === 'entrada' ? '#22c55e' : t === 'saida' ? '#ef4444' : '#f59e0b') : '#2a2a4a'),
                      background: pontoForm.tipo === t ? (t === 'entrada' ? '#22c55e11' : t === 'saida' ? '#ef444411' : '#f59e0b11') : 'transparent',
                      color: pontoForm.tipo === t ? (t === 'entrada' ? '#22c55e' : t === 'saida' ? '#ef4444' : '#f59e0b') : '#7070a0',
                    }}>
                    {t === 'entrada' ? '➡️ Entrada' : t === 'saida' ? '⬅️ Saída' : '⏸ Pausa'}
                  </button>
                )
              })}
            </div>

            <div style={{ color: '#7070a0', fontSize: 12 }}>
              Horário: <strong style={{ color: '#d0c0ff' }}>{new Date().toLocaleTimeString('pt-BR')}</strong>
            </div>

            {inp('Observação', pontoForm.observacao, function(v: string) { setPontoForm(function(q: any) { return Object.assign({}, q, { observacao: v }) }) }, 'text', 'Ex: Entrou mais cedo')}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn label="Registrar" onClick={registrarPonto} cor="#22c55e" loading={regLoading} />
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast} cor={toastCor} />}
    </div>
  )
}
