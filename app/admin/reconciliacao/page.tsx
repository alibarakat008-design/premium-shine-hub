'use client'
import { useEffect, useState } from 'react'

type Result = {
  id: string
  order_id: string
  order_number: string
  pack_id: string | null
  tipo_envio: string | null
  ml_receb: number
  db_receb: number
  diff: number
  ml_venda: number | null
  ml_sale_fee: number | null
  ml_receiver_save: number | null
  ml_sender_save: number | null
  ml_sender_cost: number | null
  status: string
  observed_at: string
  resolved_at: string | null
  resolved_receb: number | null
}

function fmt(n: any) {
  if (n == null) return '—'
  return `R$ ${Number(n).toFixed(2)}`
}

function fmtDiff(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}R$ ${n.toFixed(2)}`
}

export default function ReconciliacaoPage() {
  const [results, setResults] = useState<Result[]>([])
  const [stats, setStats] = useState<any[]>([])
  const [status, setStatus] = useState<'pending' | 'fixed' | 'ignored' | 'all'>('pending')
  const [filterType, setFilterType] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<{ processed: number; discrepancies: number; elapsed_ms: number; errors?: any[] } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [days, setDays] = useState(7)
  const [batch, setBatch] = useState(30)
  const [onlyFlex, setOnlyFlex] = useState(false)
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'ml_receb' | 'db_receb' } | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  async function saveEdit(r: Result, field: 'ml_receb' | 'db_receb') {
    if (!editingCell || editingCell.id !== r.id) return
    const num = parseFloat(editValue.replace(',', '.'))
    setEditingCell(null)
    if (isNaN(num)) { alert('Valor inválido'); return }
    if (field === 'ml_receb') {
      // edita só o esperado da reconciliação (NÃO mexe no banco ainda — vira "resolved_receb")
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/reconcile/fix', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, ml_receb: num }),
      })
      const j = await res.json()
      if (!j.ok) { alert(`Erro: ${j.error}`); return }
      alert(`${r.order_number} → R$ ${num.toFixed(2)} aplicado`)
      await loadList()
    } else {
      // db_receb: edita direto no banco (orders.recebimento_liquido) via set-recebimento
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/set-recebimento', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: r.order_number, recebimento: num }),
      })
      const j = await res.json()
      if (!j.ok) { alert(`Erro: ${j.error}`); return }
      alert(`${r.order_number} (banco) → R$ ${num.toFixed(2)}`)
      await loadList()
    }
  }

  function cancelEdit() { setEditingCell(null); setEditValue('') }

  async function loadList() {
    setLoading(true)
    try {
      const auth = btoa('premium:shine2026')
      const r = await fetch(`/api/admin/reconcile/list?status=${status}&limit=200${filterType ? `&tipo=${filterType}` : ''}`, {
        headers: { Authorization: `Basic ${auth}` },
      })
      const j = await r.json()
      setResults(j.results || [])
      setStats(j.stats || [])
    } finally {
      setLoading(false)
    }
  }

  async function runReconciliation() {
    setRunning(true)
    setLastRun(null)
    try {
      const auth = btoa('premium:shine2026')
      const r = await fetch('/api/admin/reconcile/run', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, batchSize: batch, onlyFlex }),
      })
      const j = await r.json()
      setLastRun({
        processed: j.processed,
        discrepancies: j.discrepancies,
        elapsed_ms: j.elapsed_ms,
        errors: j.errors,
      })
      await loadList()
    } catch (err: any) {
      setLastRun({ processed: 0, discrepancies: 0, elapsed_ms: 0, errors: [{ error: err.message }] })
    } finally {
      setRunning(false)
    }
  }

  async function fixSelected(mlRecebOverride?: number) {
    const selected = results.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    if (!confirm(`Aplicar fix em ${selected.length} vendas?`)) return
    const auth = btoa('premium:shine2026')
    const body = {
      results: selected.map(r => ({
        id: r.id,
        order_id: r.order_id,
        ml_receb: mlRecebOverride ?? r.ml_receb,
      })),
    }
    const r = await fetch('/api/admin/reconcile/fix', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json()
    if (j.ok) {
      alert(`${j.updated} vendas corrigidas`)
      setSelectedIds(new Set())
      await loadList()
    } else {
      alert(`Erro: ${j.error}`)
    }
  }

  async function fixOne(r: Result) {
    const input = prompt(
      `Confirme o valor de recebimento que o ML mostra para a venda ${r.order_number} (pack ${r.pack_id || 'sem pack'}):\n\n` +
      `Atualmente no sistema: R$ ${r.db_receb.toFixed(2)}\n` +
      `Calculado pelo bot: R$ ${r.ml_receb.toFixed(2)}\n` +
      `Tipo de envio: ${r.tipo_envio}\n\n` +
      `Digite o valor correto (ou deixe vazio e clique Cancel pra manter):`,
      r.ml_receb.toFixed(2),
    )
    if (input === null) return
    const num = parseFloat(input.replace(',', '.'))
    if (isNaN(num)) {
      alert('Valor inválido')
      return
    }
    const auth = btoa('premium:shine2026')
    const res = await fetch('/api/admin/reconcile/fix', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: [{ id: r.id, order_id: r.order_id, ml_receb: num }] }),
    })
    const j = await res.json()
    if (j.ok) {
      alert(`OK: ${r.order_number} atualizado para R$ ${num.toFixed(2)}`)
      await loadList()
    } else {
      alert(`Erro: ${j.error}`)
    }
  }

  async function fixPackOne(r: Result) {
    if (!r.pack_id) {
      alert('Essa venda não tem pack_id')
      return
    }
    const input = prompt(
      `Vendas com pack_id = ${r.pack_id}.\n\nDigite o valor TOTAL que o ML mostra para esse pack (R$).\nEsse valor será distribuído proporcionalmente entre as vendas do pack.`,
      r.ml_receb.toFixed(2),
    )
    if (input === null) return
    const num = parseFloat(input.replace(',', '.'))
    if (isNaN(num)) {
      alert('Valor inválido')
      return
    }
    const auth = btoa('premium:shine2026')
    const res = await fetch('/api/admin/set-recebimento', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: r.pack_id, recebimento: num }),
    })
    const j = await res.json()
    if (j.ok) {
      alert(`OK: pack ${r.pack_id} = R$ ${num.toFixed(2)} distribuído em ${j.total_atualizadas} vendas`)
      await loadList()
    } else {
      alert(`Erro: ${j.error}`)
    }
  }

  async function ignoreSelected() {
    const selected = results.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    if (!confirm(`Ignorar ${selected.length} discrepâncias?`)) return
    const auth = btoa('premium:shine2026')
    const r = await fetch('/api/admin/reconcile/ignore', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const j = await r.json()
    if (j.ok) {
      alert(`${j.ignored} marcadas como ignoradas`)
      setSelectedIds(new Set())
      await loadList()
    }
  }

  useEffect(() => {
    loadList()
  }, [status, filterType])

  const totalDiff = results.reduce((s, r) => s + Math.abs(r.diff), 0)
  const maxDiff = Math.max(...results.map(r => Math.abs(r.diff)), 0)

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system,system-ui,sans-serif', background: 'var(--psh-bg-secondary, #fafbfc)', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>Reconciliação ML</h1>
      <p style={{ color: 'var(--psh-text-secondary, #6b7280)', margin: '4px 0 24px 0' }}>
        Compara o <code style={{ background: 'var(--psh-border, #e5e7eb)', padding: '2px 6px', borderRadius: 4 }}>recebimento_liquido</code> do banco com o cálculo esperado pela API do Mercado Livre.
        <br />
        Por enquanto <strong>só sinaliza</strong> — você decide se fixa ou ignora.
      </p>

      {/* Painel de ação */}
      <div style={{ background: 'var(--psh-bg-primary, white)', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: 'var(--psh-text-primary, #374151)' }}>Rodar nova reconciliação</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Janela (dias)</label>
            <input type="number" value={days} onChange={e => setDays(Number(e.target.value))}
              style={{ width: 80, padding: 6, borderRadius: 4, border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Batch (vendas/run)</label>
            <input type="number" value={batch} onChange={e => setBatch(Number(e.target.value))}
              style={{ width: 80, padding: 6, borderRadius: 4, border: '1px solid #d1d5db' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={onlyFlex} onChange={e => setOnlyFlex(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Só FLEX</span>
          </label>
          <button onClick={runReconciliation} disabled={running}
            style={{ padding: '8px 16px', background: running ? 'var(--psh-text-secondary, #9ca3af)' : '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 6, cursor: running ? 'wait' : 'pointer', fontWeight: 600 }}>
            {running ? '⏳ Rodando…' : '🔄 Rodar agora'}
          </button>
        </div>
        {lastRun && (
          <div style={{ marginTop: 12, padding: 10, background: lastRun.errors?.length ? '#fef2f2' : '#f0fdf4', borderRadius: 4, fontSize: 13 }}>
            Processadas: <b>{lastRun.processed}</b> | Discrepâncias: <b>{lastRun.discrepancies}</b> | Tempo: <b>{(lastRun.elapsed_ms / 1000).toFixed(1)}s</b>
            {lastRun.errors && lastRun.errors.length > 0 && (
              <span style={{ color: '#dc2626', marginLeft: 12 }}>⚠️ {lastRun.errors.length} erros</span>
            )}
          </div>
        )}
      </div>

      {/* Stats + filtros */}
      <div style={{ background: 'var(--psh-bg-primary, white)', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {results.length > 0 && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Vendas pendentes</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{results.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Maior diff</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{fmtDiff(maxDiff)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)' }}>Soma |diff|</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{fmt(totalDiff)}</div>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={status} onChange={e => setStatus(e.target.value as any)}
              style={{ padding: 6, borderRadius: 4, border: '1px solid #d1d5db' }}>
              <option value="pending">Pendentes</option>
              <option value="fixed">Corrigidas</option>
              <option value="ignored">Ignoradas</option>
              <option value="all">Todas</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ padding: 6, borderRadius: 4, border: '1px solid #d1d5db' }}>
              <option value="">Todos tipos</option>
              <option value="self_service">FLEX (self_service)</option>
              <option value="fulfillment">FULL (fulfillment)</option>
              <option value="cross_docking">Cross Docking</option>
              <option value="me2">Me2 (Clássico)</option>
            </select>
          </div>
        </div>
        {stats.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>
            Por tipo (pendentes): {stats.map((s: any) => `${s.tipo_envio || 'sem tipo'}: ${s.total} vendas (avg diff R$${Number(s.avg_abs_diff || 0).toFixed(2)})`).join(' · ')}
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--psh-bg-primary, white)', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>Carregando…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
            Nenhuma discrepância {status === 'pending' ? 'pendente' : status}.
          </div>
        ) : (
          <>
            <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--psh-text-secondary, #6b7280)' }}>
                {selectedIds.size > 0 && <>{selectedIds.size} selecionada(s) | </>}
                <label style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === results.length && results.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedIds(new Set(results.map(r => r.id)))
                      else setSelectedIds(new Set())
                    }}
                  />
                  {' '}Selecionar todas
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={ignoreSelected} disabled={selectedIds.size === 0}
                  style={{ padding: '6px 12px', background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-secondary, #6b7280)', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer' }}>
                  Ignorar
                </button>
                <button onClick={() => fixSelected()} disabled={selectedIds.size === 0}
                  style={{ padding: '6px 12px', background: selectedIds.size === 0 ? 'var(--psh-text-secondary, #9ca3af)' : '#10b981', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer' }}>
                  Aplicar ML nas {selectedIds.size || ''} selecionadas
                </button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}></th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Pack/Order</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Tipo</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>ML venda</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>ML sale_fee</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Rec_save</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sen_save</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sistema tem</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Esperado ML</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Diff</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', background: Math.abs(r.diff) > 5 ? '#fef2f2' : Math.abs(r.diff) > 0.5 ? '#fffbeb' : 'white' }}>
                    <td style={{ padding: '6px 12px' }}>
                      <input type="checkbox" checked={selectedIds.has(r.id)}
                        onChange={e => {
                          const ns = new Set(selectedIds)
                          if (e.target.checked) ns.add(r.id)
                          else ns.delete(r.id)
                          setSelectedIds(ns)
                        }} />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      {r.pack_id && (
                        <div style={{ fontSize: 12, color: 'var(--psh-text-primary, #111827)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>Pack</span>
                          <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4, fontSize: 11, userSelect: 'all', cursor: 'text' }}>
                            {r.pack_id}
                          </code>
                          <button onClick={() => navigator.clipboard.writeText(r.pack_id!)}
                            title="Copiar pack_id"
                            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 5px', fontSize: 10, cursor: 'pointer', color: 'var(--psh-text-secondary, #6b7280)' }}>
                            📋
                          </button>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--psh-text-primary, #374151)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--psh-text-secondary, #9ca3af)' }}>#</span>
                        <code style={{ fontFamily: 'monospace', background: 'var(--psh-bg-secondary, #f3f4f6)', padding: '2px 6px', borderRadius: 4, fontSize: 11, userSelect: 'all', cursor: 'text' }}>
                          {r.order_number}
                        </code>
                        <button onClick={() => navigator.clipboard.writeText(r.order_number)}
                          title="Copiar order_number"
                          style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 5px', fontSize: 10, cursor: 'pointer', color: 'var(--psh-text-secondary, #6b7280)' }}>
                          📋
                        </button>
                        <a href={`https://www.mercadolivre.com.br/vendas/omni/lista?filters=&subFilters=&search=${r.order_number}&limit=50&offset=0`}
                          target="_blank" rel="noreferrer"
                          title="Abrir no ML"
                          style={{ background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 3, padding: '1px 6px', fontSize: 10, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
                          ↗ ML
                        </a>
                      </div>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: r.tipo_envio === 'self_service' ? '#dbeafe' : r.tipo_envio === 'fulfillment' ? '#dcfce7' : '#fef3c7',
                        color: r.tipo_envio === 'self_service' ? '#1e40af' : r.tipo_envio === 'fulfillment' ? '#166534' : '#92400e',
                      }}>
                        {r.tipo_envio || '?'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(r.ml_venda)}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(r.ml_sale_fee)}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(r.ml_receiver_save)}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(r.ml_sender_save)}</td>
                    <td
                      onDoubleClick={() => { setEditingCell({ id: r.id, field: 'db_receb' }); setEditValue(String(r.db_receb)) }}
                      title="Clique duplo p/ editar"
                      style={{ padding: '4px 12px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)', cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fef9c3')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {editingCell?.id === r.id && editingCell?.field === 'db_receb' ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(r, 'db_receb')}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(r, 'db_receb'); if (e.key === 'Escape') cancelEdit() }}
                          style={{ width: 90, padding: '2px 4px', textAlign: 'right', border: '1px solid #3b82f6', borderRadius: 3, fontSize: 12, outline: 'none' }}
                        />
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>{fmt(r.db_receb)} ✎</span>
                      )}
                    </td>
                    <td
                      onDoubleClick={() => { setEditingCell({ id: r.id, field: 'ml_receb' }); setEditValue(String(r.ml_receb)) }}
                      title="Clique duplo p/ editar"
                      style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {editingCell?.id === r.id && editingCell?.field === 'ml_receb' ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(r, 'ml_receb')}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(r, 'ml_receb'); if (e.key === 'Escape') cancelEdit() }}
                          style={{ width: 90, padding: '2px 4px', textAlign: 'right', border: '1px solid #3b82f6', borderRadius: 3, fontSize: 12, outline: 'none', fontWeight: 600 }}
                        />
                      ) : (
                        <span>{fmt(r.ml_receb)} ✎</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: Math.abs(r.diff) > 5 ? '#dc2626' : Math.abs(r.diff) > 0.5 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
                      {fmtDiff(r.diff)}
                    </td>
                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => fixOne(r)}
                        style={{ padding: '4px 10px', background: '#3b82f6', color: 'var(--psh-bg-primary, white)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        Fixar
                      </button>
                      {r.pack_id && (
                        <button onClick={() => fixPackOne(r)}
                          style={{ padding: '4px 10px', background: 'var(--psh-bg-primary, white)', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 4, fontSize: 12, cursor: 'pointer', marginLeft: 4 }}>
                          Fix Pack
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}