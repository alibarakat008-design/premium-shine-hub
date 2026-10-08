'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

interface Statement {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  matched_with: string | null
  matched_id: string | null
  confianca: number | null
}

export default function ConciliacaoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ statements: Statement[]; stats: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [csvText, setCsvText] = useState('')
  const [importando, setImportando] = useState(false)
  const [matching, setMatching] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  function load() {
    setLoading(true)
    fetch(`/api/conciliacao?mes=${mes}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); setLoading(false) })
  }

  useEffect(load, [mes])

  async function importar() {
    if (!csvText.trim()) return alert('Cole o CSV primeiro')
    setImportando(true)
    try {
      const res = await apiFetch('/api/conciliacao/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      })
      const j = await res.json()
      if (j.success) {
        alert(`✅ ${j.message}`)
        setCsvText('')
        setOpen(false)
        load()
      } else {
        alert('❌ ' + j.error)
      }
    } finally {
      setImportando(false)
    }
  }

  async function autoMatch() {
    if (!confirm('Rodar match automático? Vai conciliar transações com orders de mesmo valor/data.')) return
    setMatching(true)
    try {
      const res = await apiFetch('/api/conciliacao/match', { method: 'POST' })
      const j = await res.json()
      alert(j.success ? `✅ ${j.message}` : `❌ ${j.error}`)
      load()
    } finally {
      setMatching(false)
    }
  }

  async function remover(id: string) {
    if (!confirm('Remover esta transação?')) return
    await apiFetch(`/api/conciliacao/${id}`, { method: 'DELETE' })
    load()
  }

  async function desconciliar(id: string) {
    await apiFetch(`/api/conciliacao/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matched_with: null, matched_id: null }),
    })
    load()
  }

  if (status === 'loading' || loading || !data) {
    return <div style={{ background: '#0a0a1a', minHeight: '100vh', color: '#d0c0ff', padding: 40 }}>Carregando...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 4 }}>🏦 Conciliação Bancária</h1>
            <div style={{ color: '#7070a0', fontSize: '0.9em' }}>Importe seu extrato e concilie automaticamente com pedidos</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ padding: '8px 12px', background: '#12122a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6 }} />
            <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#a78bfa', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>📥 Importar</button>
            <button onClick={autoMatch} disabled={matching} style={{ padding: '8px 16px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: matching ? 'wait' : 'pointer', fontWeight: 600, opacity: matching ? 0.6 : 1 }}>
              {matching ? '⏳' : '🤖'} Auto Match
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Card label="💰 Créditos" value={`R$ ${data.stats.total_creditos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#22c55e" />
          <Card label="💸 Débitos" value={`R$ ${data.stats.total_debitos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color="#ef4444" />
          <Card label="✅ Conciliados" value={data.stats.conciliados} color="#a78bfa" />
          <Card label="⏳ Pendentes" value={data.stats.pendentes} color="#f97316" />
        </div>

        {/* Tabela */}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0a1a', borderBottom: '1px solid #2a2a4a' }}>
                <th style={th}>Data</th>
                <th style={th}>Descrição</th>
                <th style={th}>Tipo</th>
                <th style={th}>Valor</th>
                <th style={th}>Match</th>
                <th style={th}>Confiança</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.statements.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#7070a0' }}>Nenhuma transação neste mês. Importe um extrato CSV.</td></tr>
              ) : (
                data.statements.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #1a1a3a' }}>
                    <td style={td}>{new Date(s.data).toLocaleDateString('pt-BR')}</td>
                    <td style={td}>
                      <div style={{ color: '#d0c0ff' }}>{s.descricao}</div>
                    </td>
                    <td style={td}>
                      <span style={{ padding: '3px 8px', background: s.tipo === 'credito' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: s.tipo === 'credito' ? '#22c55e' : '#ef4444', borderRadius: 4, fontSize: '0.75em', fontWeight: 600 }}>
                        {s.tipo === 'credito' ? '⬆️ Crédito' : '⬇️ Débito'}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ color: s.tipo === 'credito' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                        {s.tipo === 'credito' ? '+' : '-'} R$ {Number(s.valor).toFixed(2)}
                      </span>
                    </td>
                    <td style={td}>
                      {s.matched_with ? (
                        <span style={{ padding: '3px 8px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: 4, fontSize: '0.75em' }}>
                          🔗 {s.matched_with} #{s.matched_id?.slice(0, 8)}
                        </span>
                      ) : (
                        <span style={{ color: '#7070a0', fontSize: '0.8em' }}>— pendente —</span>
                      )}
                    </td>
                    <td style={td}>
                      {s.confianca !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 50, height: 6, background: '#0a0a1a', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${s.confianca}%`, height: '100%', background: Number(s.confianca) > 80 ? '#22c55e' : Number(s.confianca) > 60 ? '#eab308' : '#f97316' }} />
                          </div>
                          <span style={{ color: '#b0b0cc', fontSize: '0.75em' }}>{Number(s.confianca).toFixed(0)}%</span>
                        </div>
                      ) : <span style={{ color: '#7070a0' }}>-</span>}
                    </td>
                    <td style={td}>
                      {s.matched_with && (
                        <button onClick={() => desconciliar(s.id)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid #f97316', color: '#f97316', borderRadius: 3, cursor: 'pointer', fontSize: '0.7em', marginRight: 4 }}>
                          Desfazer
                        </button>
                      )}
                      <button onClick={() => remover(s.id)} style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 3, cursor: 'pointer', fontSize: '0.7em' }}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Importar */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, maxWidth: 700, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: '#a78bfa' }}>📥 Importar Extrato</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#b0b0cc', cursor: 'pointer', fontSize: '1.5em' }}>✕</button>
            </div>
            <div style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 12 }}>
              Cole o conteúdo do CSV. Formato esperado:<br />
              <code style={{ color: '#a78bfa', background: '#0a0a1a', padding: 4, borderRadius: 3, display: 'block', marginTop: 6 }}>
                data;descricao;valor;tipo<br />
                2026-06-15;PIX RECEBIDO;150.00;credito<br />
                2026-06-14;BOLETO;-89.90;debito
              </code>
              <div style={{ marginTop: 8, fontSize: '0.8em' }}>
                Aceita: <code>;</code> ou <code>,</code> como separador. Tipo opcional (se vazio, valor positivo = crédito).
              </div>
            </div>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="Cole aqui..." rows={12} style={{ width: '100%', padding: 10, background: '#0a0a1a', border: '1px solid #2a2a4a', color: '#d0c0ff', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.85em' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={importar} disabled={importando} style={{ flex: 1, padding: '12px', background: '#22c55e', border: 'none', color: '#000', borderRadius: 6, cursor: 'pointer', fontWeight: 700, opacity: importando ? 0.6 : 1 }}>
                {importando ? '⏳ Importando...' : '✅ Importar Transações'}
              </button>
              <button onClick={() => setOpen(false)} style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #2a2a4a', color: '#b0b0cc', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 16 }}>
      <div style={{ color: '#7070a0', fontSize: '0.75em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '12px', textAlign: 'left', color: '#7070a0', fontSize: '0.75em', fontWeight: 600 }
const td: React.CSSProperties = { padding: '12px', fontSize: '0.85em' }
