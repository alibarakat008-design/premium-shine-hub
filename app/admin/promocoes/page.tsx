'use client'

/**
 * PÁGINA: Promoções ML — Lista de Cenários + Todos os MLBs
 * Rota: /admin/promocoes
 *
 * Abas:
 *  - Cenários: cenários criados (com filtros)
 *  - Todos os MLBs: todos os anúncios da conta (com e sem regra)
 *
 * Funcionalidades:
 *  - Criar cenário manual
 *  - Ativar/desativar cenário
 *  - Duplicar cenário
 *  - Ver todos os MLBs da conta
 *  - Configurar regra para MLB sem cenário
 *  - Importar cenários em lote (planilha)
 *  - Download modelo de planilha
 */
import { useEffect, useState, useCallback, useRef } from 'react'

const AUTH = 'Basic ' + btoa('premium:shine2026')

// ── Tipos ────────────────────────────────────────────────────────────────
interface Scenario {
  id: string
  product_name: string
  mlb: string
  max_seller_discount_pct: string | null
  min_sale_price: string | null
  min_net_receivable: string | null
  activation_mode: string
  active: boolean
  created_at: string
  latest_query?: { fetched_at: string | null; normalized_data: any[] | null } | null
  _count?: { simulations: number }
}

interface MlbItem {
  listing_id: string
  product_name: string
  preco_atual: number | null
  vendas_total: number | null
  sku: string | null
  has_scenario: boolean
  scenario: Scenario | null
}

interface CenarioForm {
  product_name: string
  mlb: string
  max_seller_discount_pct: string
  min_sale_price: string
  min_net_receivable: string
  activation_mode: 'conservative' | 'aggressive'
  active: boolean
}

interface MlbListResponse {
  ok: boolean
  error?: string
  total: number
  total_in_db: number
  with_scenario: number
  without_scenario: number
  sync_error?: string
  hint?: string
  listings: MlbItem[]
}

interface SyncResult {
  ok: boolean
  step?: string
  error?: string
  hint?: string
  account?: { ml_user_id: string; nickname: string; has_token: boolean }
  db_status?: { active_listings: number; needs_sync: boolean; after_sync?: number }
  ml_api_test?: { search?: { ok: boolean; total_in_ml: number; first_3_mlbs: string[]; error?: string } }
  sync?: { ml_total_found?: number; saved?: number; errors?: string[]; error?: string }
}

// ── Utilitários ─────────────────────────────────────────────────────────
function fmtD(d: string | null) {
  return d ? new Date(d).toLocaleString('pt-BR') : '—'
}
function fmt(v: number | string | null) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function Badge({ children, cor, style }: { children: React.ReactNode; cor: string; style?: any }) {
  return (
    <span style={{
      background: cor + '22',
      color: cor,
      borderRadius: 6,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700,
      display: 'inline-block',
      ...(style || {}),
    }}>
      {children}
    </span>
  )
}
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #2a2a4a',
      borderRadius: 12,
      padding: 16,
      ...(style || {}),
    }}>
      {children}
    </div>
  )
}

// ── Componente: Linha de Cenário ─────────────────────────────────────────
function ScenarioRow({ s, onToggle, onDuplicar, onShowToast, onReload }: {
  s: Scenario
  onToggle: (s: Scenario) => void
  onDuplicar: (s: Scenario) => void
  onShowToast: (msg: string, cor?: string) => void
  onReload: () => void
}) {
  const q = s.latest_query
  const promotions = q?.normalized_data || []
  const canJoin = promotions.filter((p: any) => p.classification === 'can_join').length
  const inconclusive = promotions.filter((p: any) => p.classification === 'inconclusive').length
  const already = promotions.filter((p: any) => p.classification === 'already_participating').length

  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #2a2a4a',
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <Badge cor={s.active ? '#22c55e' : '#7070a0'}>
              {s.active ? '🔥 ATIVO' : '📴 INATIVO'}
            </Badge>
            <Badge cor={s.activation_mode === 'aggressive' ? '#f59e0b' : '#60a5fa'}>
              {s.activation_mode === 'aggressive' ? '⚡ Agressivo' : '🛡️ Conservador'}
            </Badge>
            {q && promotions.length > 0 && (
              <Badge cor={canJoin > 0 ? '#22c55e' : '#7070a0'}>
                {canJoin} pode(m) aderir
              </Badge>
            )}
            {q && promotions.length === 0 && (
              <Badge cor="#7070a0">sem promoções</Badge>
            )}
          </div>

          <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1.05em', marginBottom: 4 }}>
            {s.product_name}
          </div>
          <div style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 6 }}>
            MLB:{' '}
            <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{s.mlb || '—'}</span>
            {q?.fetched_at && <span style={{ marginLeft: 12 }}>↻ {fmtD(q.fetched_at)}</span>}
          </div>

          {/* Critérios */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {s.max_seller_discount_pct && (
              <span style={{ background: '#1a2a3a', color: '#60a5fa', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                Teto seller: {s.max_seller_discount_pct}%
              </span>
            )}
            {s.min_sale_price && (
              <span style={{ background: '#1a2a3a', color: '#f472b6', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                Preço mín: {fmt(s.min_sale_price)}
              </span>
            )}
            {s.min_net_receivable && (
              <span style={{ background: '#1a2a3a', color: '#fbbf24', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                Receb. mín: {fmt(s.min_net_receivable)}
              </span>
            )}
          </div>

          {/* Resumo promoções */}
          {q && promotions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: '0.8em', color: '#7070a0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Total: {promotions.length}</span>
              {canJoin > 0 && <span style={{ color: '#22c55e' }}>✓ Pode aderir: {canJoin}</span>}
              {inconclusive > 0 && <span style={{ color: '#fbbf24' }}>⚠ Inconclusivo: {inconclusive}</span>}
              {already > 0 && <span style={{ color: '#60a5fa' }}>🔵 Já participa: {already}</span>}
              <span style={{ color: '#7070a0' }}>🗂 Simulações: {s._count?.simulations || 0}</span>
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={`/admin/promocoes/${s.id}`}
            style={{
              padding: '8px 16px',
              background: '#a78bfa',
              border: 'none',
              borderRadius: 8,
              color: '#000',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}>
            🔍 Abrir
          </a>
          <button
            onClick={() => onToggle(s)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid ' + (s.active ? '#ef4444' : '#22c55e'),
              borderRadius: 8,
              color: s.active ? '#ef4444' : '#22c55e',
              cursor: 'pointer',
              fontSize: 13,
            }}>
            {s.active ? '⏸ Desativar' : '▶️ Ativar'}
          </button>
          <button
            onClick={() => onDuplicar(s)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              color: '#7070a0',
              cursor: 'pointer',
              fontSize: 13,
            }}>
            📋 Duplicar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente: Linha de MLB sem cenário ────────────────────────────────
function MlbRow({ item, onConfig }: { item: MlbItem; onConfig: (item: MlbItem) => void }) {
  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #2a2a4a',
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Badge cor="#f59e0b">⚠️ SEM REGRA</Badge>
            {item.vendas_total != null && item.vendas_total > 0 && (
              <span style={{ color: '#7070a0', fontSize: 11 }}>📦 {item.vendas_total} vendas</span>
            )}
          </div>
          <div style={{ color: '#d0c0ff', fontWeight: 600, fontSize: '0.95em', marginBottom: 2 }}>
            {item.product_name}
          </div>
          <div style={{ color: '#7070a0', fontSize: '0.8em' }}>
            MLB: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{item.listing_id}</span>
            {item.sku && <span style={{ marginLeft: 10 }}>SKU: {item.sku}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.preco_atual && (
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.95em' }}>
              {fmt(item.preco_atual)}
            </span>
          )}
          <button
            onClick={() => onConfig(item)}
            style={{
              padding: '7px 14px',
              background: '#f59e0b22',
              border: '1px solid #f59e0b',
              borderRadius: 8,
              color: '#f59e0b',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
            }}>
            ⚡ Configurar regras
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente: Modal Duplicar ───────────────────────────────────────────
function DuplicarModal({ scenario, onClose, onSuccess, onShowToast }: {
  scenario: Scenario
  onClose: () => void
  onSuccess: () => void
  onShowToast: (msg: string, cor?: string) => void
}) {
  const [dupName, setDupName] = useState(scenario.product_name + ' (cópia)')
  const [dupMlb, setDupMlb] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDuplicar = async () => {
    if (!dupName.trim()) { setError('Nome é obrigatório'); return }
    if (!dupMlb.trim()) { setError('MLB é obrigatório'); return }
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/promo-scenarios/${scenario.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ new_name: dupName, new_mlb: dupMlb }),
      })
      const d = await r.json()
      if (d.ok) {
        onShowToast('✅ Cenário duplicado!')
        onSuccess()
        onClose()
      } else {
        if (d.existing_id) {
          setError('Já existe cenário com este MLB.')
        } else {
          setError(d.error || 'Erro')
        }
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#12122a', border: '1px solid #a78bfa',
        borderRadius: 12, padding: 24, maxWidth: 420, width: '100%',
      }}>
        <h2 style={{ color: '#a78bfa', margin: '0 0 16px' }}>📋 Duplicar Cenário</h2>
        <div style={{ color: '#7070a0', fontSize: 13, marginBottom: 16 }}>
          Copiando: <strong style={{ color: '#d0c0ff' }}>{scenario.product_name}</strong> (MLB: {scenario.mlb})
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ color: '#7070a0', fontSize: 12, marginBottom: 4 }}>Nome do novo cenário *</div>
          <input
            value={dupName}
            onChange={e => setDupName(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', background: '#0a0a1a',
              border: '1px solid #2a2a4a', borderRadius: 8,
              color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ color: '#7070a0', fontSize: 12, marginBottom: 4 }}>Novo MLB *</div>
          <input
            value={dupMlb}
            onChange={e => setDupMlb(e.target.value)}
            placeholder="MLB do novo produto"
            style={{
              width: '100%', padding: '8px 12px', background: '#0a0a1a',
              border: '1px solid #2a2a4a', borderRadius: 8,
              color: '#e8e8f0', fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </label>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#1a0a0a', padding: '8px 12px', borderRadius: 6 }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDuplicar}
            disabled={loading}
            style={{
              flex: 1, padding: '10px', background: '#a78bfa',
              border: 'none', borderRadius: 8, color: '#000',
              fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
            }}>
            {loading ? '⏳...' : '✅ Duplicar'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', background: 'transparent',
              border: '1px solid #2a2a4a', borderRadius: 8,
              color: '#7070a0', cursor: 'pointer',
            }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente: Modal Importar ────────────────────────────────────────────
function ImportarModal({ onClose, onSuccess, onShowToast }: {
  onClose: () => void
  onSuccess: () => void
  onShowToast: (msg: string, cor?: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const r = await fetch('/api/admin/promo-scenarios/import', {
        method: 'POST',
        headers: { Authorization: AUTH },
        body: formData,
      })
      const d = await r.json()
      if (d.ok) {
        setResult(d)
        onShowToast(`✅ ${d.created} criados, ${d.updated} atualizados`)
        onSuccess()
      } else {
        setError(d.error || 'Erro ao importar')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#12122a', border: '1px solid #22c55e',
        borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
      }}>
        <h2 style={{ color: '#22c55e', margin: '0 0 16px' }}>📥 Importar Cenários em Lote</h2>

        {/* Modelo */}
        <div style={{
          background: '#0a0a1a', border: '1px solid #2a2a4a',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12,
        }}>
          <div style={{ color: '#d0c0ff', fontWeight: 600, marginBottom: 6 }}>📋 Modelo de colunas:</div>
          <div style={{ color: '#7070a0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <span><code style={{ color: '#a78bfa' }}>mlb</code> (obrigatório)</span>
            <span><code style={{ color: '#a78bfa' }}>nome_produto</code> (obrigatório)</span>
            <span><code style={{ color: '#a78bfa' }}>teto_desconto_seller_pct</code></span>
            <span><code style={{ color: '#a78bfa' }}>preco_minimo</code></span>
            <span><code style={{ color: '#a78bfa' }}>valor_minimo_a_receber</code></span>
            <span><code style={{ color: '#a78bfa' }}>modo</code> (conservador/agressivo)</span>
          </div>
          <a
            href="/api/admin/promo-scenarios/import-template"
            download
            style={{
              display: 'inline-block', marginTop: 10,
              color: '#a78bfa', fontSize: 12, textDecoration: 'none',
            }}>
            ⬇️ Baixar modelo CSV
          </a>
        </div>

        {/* Upload */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{
            width: '100%', padding: '12px', background: '#22c55e22',
            border: '1px solid #22c55e', borderRadius: 8,
            color: '#22c55e', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', marginBottom: 12, opacity: loading ? 0.6 : 1,
          }}>
          {loading ? '⏳ Processando...' : '📁 Selecionar arquivo CSV/XLSX'}
        </button>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, background: '#1a0a0a', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
            ❌ {error}
          </div>
        )}

        {result && (
          <div style={{ background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 8, padding: 12, fontSize: 13 }}>
            <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: 6 }}>✅ Importação concluída</div>
            <div style={{ color: '#7070a0' }}>Criados: <strong style={{ color: '#22c55e' }}>{result.created}</strong></div>
            <div style={{ color: '#7070a0' }}>Atualizados: <strong style={{ color: '#22c55e' }}>{result.updated}</strong></div>
            {result.errors?.length > 0 && (
              <div style={{ marginTop: 8, color: '#f59e0b' }}>
                Erros: {result.errors.length} ({result.errors.slice(0, 3).join('; ')}...)
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 12, padding: '10px',
            background: 'transparent', border: '1px solid #2a2a4a',
            borderRadius: 8, color: '#7070a0', cursor: 'pointer',
          }}>
          Fechar
        </button>
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────────────────
type ViewTab = 'cenarios' | 'mlbs'
type FilterCenarios = 'todos' | 'ativos' | 'inativos'
type FilterMlbs = 'todos' | 'com_regra' | 'sem_regra'

export default function PromocoesPage() {
  const [authOk, setAuthOk] = useState(false)
  const [viewTab, setViewTab] = useState<ViewTab>('cenarios')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [mlbList, setMlbList] = useState<MlbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mlbLoading, setMlbLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [filterC, setFilterC] = useState<FilterCenarios>('todos')
  const [filterM, setFilterM] = useState<FilterMlbs>('todos')
  const [busca, setBusca] = useState('')
  const [modalDup, setModalDup] = useState<Scenario | null>(null)
  const [modalImport, setModalImport] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; cor: string } | null>(null)

  // Painel inline de criar cenário
  const [painelOpen, setPainelOpen] = useState(false)
  const [painelItem, setPainelItem] = useState<MlbItem | null>(null)
  const [painelForm, setPainelForm] = useState<CenarioForm>({
    product_name: '', mlb: '', max_seller_discount_pct: '',
    min_sale_price: '', min_net_receivable: '',
    activation_mode: 'conservative', active: false,
  })
  const [painelSaving, setPainelSaving] = useState(false)
  const [painelError, setPainelError] = useState('')

  function abrirPainel(item: MlbItem) {
    setPainelItem(item)
    setPainelForm({
      product_name: item.product_name,
      mlb: item.listing_id,
      max_seller_discount_pct: '',
      min_sale_price: '',
      min_net_receivable: '',
      activation_mode: 'conservative',
      active: false,
    })
    setPainelError('')
    setPainelOpen(true)
  }

  async function salvarPainel() {
    if (!painelForm.product_name.trim()) return setPainelError('Nome é obrigatório.')
    if (!painelForm.mlb.trim()) return setPainelError('MLB é obrigatório.')
    if (!painelForm.max_seller_discount_pct && !painelForm.min_sale_price && !painelForm.min_net_receivable) {
      return setPainelError('Pelo menos um critério financeiro é obrigatório.')
    }
    setPainelSaving(true)
    setPainelError('')
    try {
      const r = await fetch('/api/admin/promo-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({
          product_name: painelForm.product_name.trim(),
          mlb: painelForm.mlb.trim(),
          max_seller_discount_pct: painelForm.max_seller_discount_pct || null,
          min_sale_price: painelForm.min_sale_price || null,
          min_net_receivable: painelForm.min_net_receivable || null,
          activation_mode: painelForm.activation_mode,
          active: painelForm.active,
        }),
      })
      const d = await r.json()
      if (d.ok) {
        showToast('✅ Cenário criado!')
        setPainelOpen(false)
        loadMlListings()
        loadScenarios()
      } else {
        if (d.existing_id) setPainelError('Já existe cenário para este MLB.')
        else setPainelError(d.error || 'Erro ao criar.')
      }
    } catch { setPainelError('Erro de conexão.') }
    finally { setPainelSaving(false) }
  }

  function showToast(msg: string, cor = '#22c55e') {
    setToast({ msg, cor })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetch('/api/admin/login-empresa', {
      headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      credentials: 'include',
    })
      .then((r: any) => r.json())
      .then((d: any) => { if (d.ok) setAuthOk(true) })
  }, [])

  const loadScenarios = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/promo-scenarios', { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) setScenarios(d.scenarios || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const loadMlListings = useCallback(async () => {
    setMlbLoading(true)
    setSyncError(null)
    setSyncResult(null)
    try {
      const r = await fetch(`/api/admin/ml-listings?limit=300&search=${encodeURIComponent(busca)}`, { headers: { Authorization: AUTH } })
      const d: MlbListResponse = await r.json()
      if (d.ok) {
        setMlbList(d.listings || [])
        if (d.sync_error) setSyncError(d.sync_error)
      } else {
        setMlbList([])
        setSyncError(d.error || 'Erro ao carregar listings')
      }
    } catch (e: any) { console.error(e); setSyncError('Erro de conexão') }
    finally { setMlbLoading(false) }
  }, [busca])

  async function handleForceSync() {
    setSyncLoading(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const r = await fetch('/api/admin/ml-sync-trigger', { headers: { Authorization: AUTH } })
      const d: SyncResult = await r.json()
      setSyncResult(d)
      if (d.ok) {
        showToast(`✅ Sincronizados ${d.sync?.saved || 0} listings do ML`)
        // Recarregar listings
        loadMlListings()
      } else {
        setSyncError(d.error || d.hint || 'Erro na sincronização')
      }
    } catch (e: any) { setSyncError('Erro de conexão na sincronização') }
    finally { setSyncLoading(false) }
  }

  useEffect(() => {
    if (authOk) {
      loadScenarios()
      if (viewTab === 'mlbs') loadMlListings()
    }
  }, [authOk, viewTab])

  useEffect(() => {
    if (viewTab === 'mlbs' && authOk) loadMlListings()
  }, [busca, authOk, viewTab, loadMlListings])

  async function toggleScenario(s: Scenario) {
    try {
      const r = await fetch(`/api/admin/promo-scenarios/${s.id}/toggle`, { method: 'POST', headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) {
        showToast(d.active ? '✅ Cenário ativado' : '📴 Cenário desativado')
        loadScenarios()
      } else showToast('❌ ' + d.error, '#ef4444')
    } catch { showToast('❌ Erro', '#ef4444') }
  }

  // Filtros cenários
  const filteredCenarios = scenarios.filter(s => {
    if (filterC === 'ativos' && !s.active) return false
    if (filterC === 'inativos' && s.active) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!s.product_name.toLowerCase().includes(q) && !s.mlb?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Filtros MLBs
  const filteredMlbs = mlbList.filter(item => {
    if (filterM === 'com_regra' && !item.has_scenario) return false
    if (filterM === 'sem_regra' && item.has_scenario) return false
    return true
  })

  if (!authOk) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a1a', color: '#d0c0ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        ⏳ Carregando...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>🔥 Promoções Mercado Livre</h1>
          <p style={{ color: '#7070a0', margin: '4px 0 0', fontSize: '0.85em' }}>
            {scenarios.length} cenário(s) · {scenarios.filter(s => s.active).length} ativo(s) · {mlbList.length} MLB(s) na conta
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => loadScenarios()}
            style={{
              padding: '10px 16px', background: '#12122a',
              border: '1px solid #2a2a4a', borderRadius: 8,
              color: '#d0c0ff', cursor: 'pointer', fontSize: 13,
            }}>
            ↻ Atualizar
          </button>
        </div>
      </div>

      {/* ── Abas principais ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setViewTab('cenarios')}
          style={{
            padding: '9px 20px', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: viewTab === 'cenarios' ? '#a78bfa33' : '#12122a',
            border: '1px solid ' + (viewTab === 'cenarios' ? '#a78bfa' : '#2a2a4a'),
            color: viewTab === 'cenarios' ? '#a78bfa' : '#7070a0',
          }}>
          📋 Cenários ({scenarios.length})
        </button>
        <button
          onClick={() => setViewTab('mlbs')}
          style={{
            padding: '9px 20px', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: viewTab === 'mlbs' ? '#22c55e22' : '#12122a',
            border: '1px solid ' + (viewTab === 'mlbs' ? '#22c55e' : '#2a2a4a'),
            color: viewTab === 'mlbs' ? '#22c55e' : '#7070a0',
          }}>
          📦 Todos os MLBs ({mlbList.length})
        </button>
      </div>

      {/* ── View: Cenários ── */}
      {viewTab === 'cenarios' && (
        <>
          {/* Ações de cenário */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['todos', 'ativos', 'inativos'] as FilterCenarios[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterC(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: filterC === f ? '#a78bfa33' : '#12122a',
                    border: '1px solid ' + (filterC === f ? '#a78bfa' : '#2a2a4a'),
                    color: filterC === f ? '#a78bfa' : '#7070a0',
                  }}>
                  {f === 'todos' ? 'Todos' : f === 'ativos' ? '🔥 Ativos' : '📴 Inativos'}
                </button>
              ))}
            </div>
            {/* Botões */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href="/admin/promocoes/novo"
                style={{
                  padding: '8px 16px', background: '#a78bfa', border: 'none',
                  borderRadius: 8, color: '#000', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, textDecoration: 'none',
                }}>
                ➕ Novo Cenário
              </a>
              <button
                onClick={() => setModalImport(true)}
                style={{
                  padding: '8px 16px', background: '#22c55e22',
                  border: '1px solid #22c55e', borderRadius: 8,
                  color: '#22c55e', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                📥 Importar em Lote
              </button>
            </div>
          </div>

          {/* Busca */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nome ou MLB..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                padding: '8px 14px', background: '#12122a',
                border: '1px solid #2a2a4a', borderRadius: 8,
                color: '#e8e8f0', fontSize: 13, minWidth: 280,
              }}
            />
          </div>

          {/* Lista de cenários */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳ Carregando...</div>
          ) : filteredCenarios.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 60, background: '#12122a',
              borderRadius: 12, border: '1px dashed #2a2a4a', color: '#4a4a7a',
            }}>
              Nenhum cenário encontrado.
              <br />
              <a href="/admin/promocoes/novo" style={{ color: '#a78bfa', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                ➕ Criar primeiro cenário
              </a>
            </div>
          ) : (
            filteredCenarios.map(s => (
              <ScenarioRow
                key={s.id}
                s={s}
                onToggle={toggleScenario}
                onDuplicar={setModalDup}
                onShowToast={showToast}
                onReload={loadScenarios}
              />
            ))
          )}
        </>
      )}

      {/* ── View: Todos os MLBs ── */}
      {viewTab === 'mlbs' && (
        <>
          {/* Ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['todos', 'com_regra', 'sem_regra'] as FilterMlbs[]).map(f => {
                const counts: Record<string, number> = {
                  todos: mlbList.length,
                  com_regra: mlbList.filter(i => i.has_scenario).length,
                  sem_regra: mlbList.filter(i => !i.has_scenario).length,
                }
                return (
                  <button
                    key={f}
                    onClick={() => setFilterM(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      background: filterM === f ? '#22c55e22' : '#12122a',
                      border: '1px solid ' + (filterM === f ? '#22c55e' : '#2a2a4a'),
                      color: filterM === f ? '#22c55e' : '#7070a0',
                    }}>
                    {f === 'todos' ? `Todos (${counts.todos})` :
                      f === 'com_regra' ? `✅ Com regra (${counts.com_regra})` :
                        `⚠️ Sem regra (${counts.sem_regra})`}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleForceSync}
                disabled={syncLoading}
                style={{
                  padding: '8px 16px',
                  background: syncLoading ? '#7070a022' : '#a78bfa22',
                  border: '1px solid ' + (syncLoading ? '#7070a0' : '#a78bfa'),
                  borderRadius: 8,
                  color: syncLoading ? '#7070a0' : '#a78bfa',
                  cursor: syncLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700,
                  opacity: syncLoading ? 0.6 : 1,
                }}>
                {syncLoading ? '⏳ Sincronizando...' : '🔄 Forçar Sincronização'}
              </button>
              <button
                onClick={() => setModalImport(true)}
                style={{
                  padding: '8px 16px', background: '#22c55e22',
                  border: '1px solid #22c55e', borderRadius: 8,
                  color: '#22c55e', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                📥 Importar Cenários em Lote
              </button>
            </div>
          </div>

          {/* Busca */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nome ou MLB..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                padding: '8px 14px', background: '#12122a',
                border: '1px solid #2a2a4a', borderRadius: 8,
                color: '#e8e8f0', fontSize: 13, minWidth: 280,
              }}
            />
          </div>

          {/* Resumo */}
          <div style={{
            background: '#12122a', border: '1px solid #2a2a4a',
            borderRadius: 10, padding: '10px 16px', marginBottom: 16,
            fontSize: 12, color: '#7070a0',
            display: 'flex', gap: 20, flexWrap: 'wrap',
          }}>
            <span>
              📦 <strong style={{ color: '#d0c0ff' }}>{mlbList.length}</strong> anúncios ativos na conta
            </span>
            <span>
              ✅ <strong style={{ color: '#22c55e' }}>{mlbList.filter(i => i.has_scenario).length}</strong> com cenário
            </span>
            <span>
              ⚠️ <strong style={{ color: '#f59e0b' }}>{mlbList.filter(i => !i.has_scenario).length}</strong> sem regra configurada
            </span>
          </div>

          {/* Erro de sync */}
          {(syncError || syncResult) && (
            <div style={{
              background: '#12122a',
              border: '1px solid ' + (syncResult?.ok ? '#22c55e' : '#ef4444'),
              borderRadius: 10, padding: 14, marginBottom: 16,
              fontSize: 12,
            }}>
              {syncResult?.ok ? (
                <div>
                  <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: 6 }}>
                    ✅ Sincronização concluída
                  </div>
                  <div style={{ color: '#7070a0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Conta: <strong style={{ color: '#d0c0ff' }}>{syncResult.account?.nickname}</strong></span>
                    <span>ML user ID: <strong style={{ color: '#a78bfa' }}>{syncResult.account?.ml_user_id || '—'}</strong></span>
                    <span>Token ML: <strong style={{ color: syncResult.account?.has_token ? '#22c55e' : '#ef4444' }}>{syncResult.account?.has_token ? '✅ Presente' : '❌ Ausente'}</strong></span>
                    <span>Total no ML: <strong style={{ color: '#d0c0ff' }}>{syncResult.ml_api_test?.search?.total_in_ml ?? '?'}</strong></span>
                    <span>Listings sincronizados: <strong style={{ color: '#22c55e' }}>{syncResult.sync?.saved ?? 0}</strong></span>
                    {syncResult.db_status?.after_sync != null && (
                      <span>Total no banco: <strong style={{ color: '#22c55e' }}>{syncResult.db_status.after_sync}</strong></span>
                    )}
                    {syncResult.sync?.errors?.length > 0 && (
                      <span style={{ color: '#f59e0b' }}>Erros: {syncResult.sync.errors.join('; ')}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 6 }}>
                    ❌ Erro na sincronização
                  </div>
                  <div style={{ color: '#f59e0b', marginBottom: 4 }}>{syncError}</div>
                  {syncResult?.hint && (
                    <div style={{ color: '#7070a0' }}>💡 {syncResult.hint}</div>
                  )}
                  {syncResult?.account && (
                    <div style={{ marginTop: 8, color: '#7070a0', fontFamily: 'monospace', fontSize: 11 }}>
                      <div>Conta: {syncResult.account.nickname}</div>
                      <div>ML user_id: {syncResult.account.ml_user_id || '(vazio)'}</div>
                      <div>Token: {syncResult.account.has_token ? '✅ ok' : '❌ ausente'}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lista de MLBs */}
          {mlbLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#7070a0' }}>⏳ Carregando listings...</div>
          ) : filteredMlbs.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 60, background: '#12122a',
              borderRadius: 12, border: '1px dashed #2a2a4a', color: '#4a4a7a',
            }}>
              Nenhum MLB encontrado com este filtro.
            </div>
          ) : (
            filteredMlbs.map(item => <MlbRow key={item.listing_id} item={item} onConfig={abrirPainel} />)
          )}
        </>
      )}

      {/* ── Modals ── */}
      {modalDup && (
        <DuplicarModal
          scenario={modalDup}
          onClose={() => setModalDup(null)}
          onSuccess={loadScenarios}
          onShowToast={showToast}
        />
      )}

      {modalImport && (
        <ImportarModal
          onClose={() => setModalImport(false)}
          onSuccess={loadScenarios}
          onShowToast={showToast}
        />
      )}

      {/* ── Painel Inline: Criar Cenário ── */}
      {painelOpen && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setPainelOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 200, backdropFilter: 'blur(2px)',
            }}
          />
          {/* Painel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 480, maxWidth: '100vw',
            background: '#0d0d20',
            borderLeft: '1px solid #2a2a4a',
            zIndex: 201,
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #2a2a4a',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#12122a',
              position: 'sticky', top: 0, zIndex: 1,
            }}>
              <div>
                <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1em' }}>⚡ Criar Cenário</div>
                {painelItem && (
                  <div style={{ color: '#7070a0', fontSize: 11, marginTop: 2 }}>
                    {painelItem.product_name}
                  </div>
                )}
              </div>
              <button
                onClick={() => setPainelOpen(false)}
                style={{
                  background: 'transparent', border: '1px solid #2a2a4a',
                  borderRadius: 8, color: '#7070a0', cursor: 'pointer',
                  padding: '6px 10px', fontSize: 16,
                }}>
                ✕
              </button>
            </div>

            {/* Formulário */}
            <div style={{ padding: 20, flex: 1 }}>
              {/* MLB (readonly) */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>MLB</label>
                <input
                  type="text" value={painelForm.mlb}
                  readOnly
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: '#080818', border: '1px solid #2a2a4a',
                    borderRadius: 8, color: '#a78bfa', fontSize: 13,
                    fontFamily: 'monospace', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Nome do produto */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Nome do Produto *</label>
                <input
                  type="text"
                  value={painelForm.product_name}
                  onChange={e => setPainelForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="Ex: Batom Líquido Rosa 3ml"
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: '#0a0a1a', border: '1px solid #2a2a4a',
                    borderRadius: 8, color: '#e8e8f0', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Critérios financeiros */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>CRITÉRIOS FINANCEIROS</div>
                <div style={{ color: '#4a4a7a', fontSize: 11, marginBottom: 10 }}>Informe pelo menos um. Campo vazio = não avaliar.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Teto seller (%)</label>
                    <input
                      type="number" placeholder="Ex: 15"
                      value={painelForm.max_seller_discount_pct}
                      onChange={e => setPainelForm(f => ({ ...f, max_seller_discount_pct: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', background: '#0a0a1a',
                        border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0',
                        fontSize: 13, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Preço mín. (R$)</label>
                    <input
                      type="number" placeholder="Ex: 20"
                      value={painelForm.min_sale_price}
                      onChange={e => setPainelForm(f => ({ ...f, min_sale_price: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', background: '#0a0a1a',
                        border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0',
                        fontSize: 13, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Receb. mín. (R$)</label>
                    <input
                      type="number" placeholder="Ex: 10"
                      value={painelForm.min_net_receivable}
                      onChange={e => setPainelForm(f => ({ ...f, min_net_receivable: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', background: '#0a0a1a',
                        border: '1px solid #2a2a4a', borderRadius: 8, color: '#e8e8f0',
                        fontSize: 13, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Modo */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#7070a0', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>MODO DE ATIVAÇÃO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    onClick={() => setPainelForm(f => ({ ...f, activation_mode: 'conservative' }))}
                    style={{
                      padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      background: painelForm.activation_mode === 'conservative' ? '#60a5fa22' : '#0a0a1a',
                      border: '1px solid ' + (painelForm.activation_mode === 'conservative' ? '#60a5fa' : '#2a2a4a'),
                      color: painelForm.activation_mode === 'conservative' ? '#60a5fa' : '#7070a0',
                    }}>
                    🛡️ Conservador
                  </button>
                  <button
                    onClick={() => setPainelForm(f => ({ ...f, activation_mode: 'aggressive' }))}
                    style={{
                      padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      background: painelForm.activation_mode === 'aggressive' ? '#f59e0b22' : '#0a0a1a',
                      border: '1px solid ' + (painelForm.activation_mode === 'aggressive' ? '#f59e0b' : '#2a2a4a'),
                      color: painelForm.activation_mode === 'aggressive' ? '#f59e0b' : '#7070a0',
                    }}>
                    ⚡ Agressivo
                  </button>
                </div>
              </div>

              {/* Ativar */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={painelForm.active}
                    onChange={e => setPainelForm(f => ({ ...f, active: e.target.checked }))}
                  />
                  <span style={{ color: painelForm.active ? '#22c55e' : '#7070a0', fontWeight: 600, fontSize: 13 }}>
                    {painelForm.active ? '🔥 Ativo' : '📴 Inativo'}
                  </span>
                </label>
              </div>

              {/* Erro */}
              {painelError && (
                <div style={{
                  background: '#3a1a1a', border: '1px solid #ef4444',
                  borderRadius: 8, padding: '10px 14px', color: '#ef4444',
                  fontSize: 13, marginBottom: 16,
                }}>
                  ❌ {painelError}
                </div>
              )}

              {/* Botões */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={salvarPainel}
                  disabled={painelSaving}
                  style={{
                    flex: 1, padding: '11px',
                    background: '#22c55e', border: 'none',
                    borderRadius: 8, color: '#000',
                    fontWeight: 700, cursor: 'pointer',
                    opacity: painelSaving ? 0.6 : 1, fontSize: 14,
                  }}>
                  {painelSaving ? '⏳ Criando...' : '✅ Criar Cenário'}
                </button>
                <button
                  onClick={() => setPainelOpen(false)}
                  style={{
                    padding: '11px 16px',
                    background: 'transparent', border: '1px solid #2a2a4a',
                    borderRadius: 8, color: '#7070a0', cursor: 'pointer',
                  }}>
                  Cancelar
                </button>
              </div>

              {/* Info */}
              <div style={{
                marginTop: 16, background: '#0a1a3a', border: '1px solid #1a3a6a',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85em', marginBottom: 6 }}>📖 Como funciona</div>
                <div style={{ color: '#7070a0', fontSize: '0.8em', lineHeight: 1.6 }}>
                  Regras <strong style={{ color: '#d0c0ff' }}>AND</strong>: todas precisam ser respeitadas.<br/>
                  <strong style={{ color: '#d0c0ff' }}>Conservador</strong> = menor desconto (preserva margem).<br/>
                  <strong style={{ color: '#d0c0ff' }}>Agressivo</strong> = maior desconto possível.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.cor, color: '#000', padding: '10px 24px',
          borderRadius: 10, fontWeight: 700, fontSize: 14, zIndex: 9999,
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
