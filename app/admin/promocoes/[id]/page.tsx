'use client'

/**
 * PÁGINA: Detalhe do Cenário de Promoção
 * Rota: /admin/promocoes/[id]
 *
 * Funcionalidades:
 * - Ver/buscar promoções do ML para este cenário
 * - Classificação automática (can_join / cannot_join / inconclusive / already_participating)
 * - Simular adesão (chama API, salva no histórico)
 * - Ver dados brutos (diagnóstico)
 * - Histórico de alterações + simulações
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

const AUTH = 'Basic ' + btoa('premium:shine2026')

interface ClassifiedPromo {
  promotion_id: string
  promotion_name: string
  promotion_type: string
  status: string
  start_date: string | null
  finish_date: string | null
  original_price: number
  discounted_price: number | null
  seller_percentage: number | null
  meli_percentage: number | null
  min_discount_percent: number | null
  max_discount_percent: number | null
  suggested_discounted_price: number | null
  min_discounted_price: number | null
  max_discounted_price: number | null
  has_coupon: boolean
  has_pix_discount: boolean
  free_shipping: boolean
  already_participating: boolean
  // Classificação
  classification: 'can_join' | 'cannot_join' | 'inconclusive' | 'already_participating' | string
  classification_reasons: string[]
  missing_fields: string[]
  seller_pct_used: number | null
  simulated_price: number | null
  simulated_net_receivable: number | null
  // Raw
  raw_candidate?: any
}

interface Simulation {
  id: string
  promotion_id: string
  promotion_type: string | null
  promotion_snapshot: any
  simulation_result: string
  seller_pct: string | null
  sale_price: string | null
  net_receivable: string | null
  decision_reasons: string[]
  missing_fields: string[]
  cumulative_effects: any
  created_at: string
}

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
  latest_query?: { fetched_at: string | null; normalized_data: ClassifiedPromo[] | null; raw_payload?: any } | null
  history?: any[]
  simulations?: Simulation[]
}

type Tab = 'todas' | 'pode_aderir' | 'nao_pode' | 'inconclusivo' | 'ativas'

function fmtD(d: string | null) {
  return d ? new Date(d).toLocaleString('pt-BR') : '—'
}
function fmt(v: number | string | null) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function Badge({ children, cor }: { children: React.ReactNode; cor: string }) {
  return (
    <span style={{
      background: cor + '22',
      color: cor,
      borderRadius: 6,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700,
      display: 'inline-block',
    }}>
      {children}
    </span>
  )
}

export default function ScenarioDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [tab, setTab] = useState<Tab>('todas')
  const [toast, setToast] = useState<{ msg: string; cor: string } | null>(null)
  const [simModal, setSimModal] = useState<ClassifiedPromo | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simResult, setSimResult] = useState<any | null>(null)
  const [rawModal, setRawModal] = useState<ClassifiedPromo | null>(null)

  const showToast = (msg: string, cor = '#22c55e') => {
    setToast({ msg, cor })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/promo-scenarios/${id}`, { headers: { Authorization: AUTH } })
      const d = await r.json()
      if (d.ok) {
        setScenario(d.scenario)
        // Carregar simulações também
        if (d.scenario?.simulations) {
          // já vem na response
        }
      } else {
        showToast(d.error || 'Erro ao carregar cenário', '#ef4444')
      }
    } catch {
      showToast('Erro de conexão', '#ef4444')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  const toggleScenario = () => {
    if (!scenario) return
    fetch(`/api/admin/promo-scenarios/${id}/toggle`, {
      method: 'POST',
      headers: { Authorization: AUTH },
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          showToast(scenario.active ? '📴 Cenário desativado' : '✅ Cenário ativado')
          load()
        } else showToast(d.error || 'Erro', '#ef4444')
      })
      .catch(() => showToast('Erro', '#ef4444'))
  }

  const fetchPromotions = () => {
    setFetching(true)
    fetch(`/api/admin/promo-scenarios/${id}/fetch-promotions`, {
      method: 'POST',
      headers: { Authorization: AUTH },
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          showToast(`✅ ${d.total} promoção(ões) encontrada(s) para este MLB`)
          load()
        } else {
          showToast(d.error || 'Erro ao buscar promoções', '#ef4444')
        }
      })
      .catch((e: any) => showToast(e.message || 'Erro', '#ef4444'))
      .finally(() => setFetching(false))
  }

  // ── Simular adesão: chama API real e salva no histórico ──
  const runSimulation = () => {
    if (!simModal || !scenario) return
    setSimLoading(true)
    setSimResult(null)
    fetch('/api/admin/promo-simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({
        scenario_id: scenario.id,
        promotion_id: simModal.promotion_id,
        promotion_type: simModal.promotion_type,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSimResult(d)
          if (d.already_exists) {
            showToast('ℹ️ Esta promoção já foi simulada antes. Registro anterior mantido.')
          } else {
            showToast('✅ Simulação salva no histórico!')
          }
          load() // recarrega pra atualizar contagem
        } else {
          showToast(d.error || 'Erro ao simular', '#ef4444')
          setSimModal(null)
        }
      })
      .catch((e: any) => {
        showToast(e.message || 'Erro', '#ef4444')
        setSimModal(null)
      })
      .finally(() => setSimLoading(false))
  }

  const promos: ClassifiedPromo[] = scenario?.latest_query?.normalized_data || []

  const filtered = promos.filter((p: ClassifiedPromo) => {
    if (tab === 'todas') return true
    if (tab === 'pode_aderir') return p.classification === 'can_join'
    if (tab === 'nao_pode') return p.classification === 'cannot_join'
    if (tab === 'inconclusivo') return p.classification === 'inconclusive'
    if (tab === 'ativas') return p.classification === 'already_participating'
    return true
  })

  const countFor = (c: string) => promos.filter((p: ClassifiedPromo) => p.classification === c).length

  const corCla: Record<string, string> = {
    can_join: '#22c55e',
    cannot_join: '#ef4444',
    inconclusive: '#f59e0b',
    already_participating: '#60a5fa',
  }
  const labelCla: Record<string, string> = {
    can_join: '✓ PODE ADERIR',
    cannot_join: '✗ NÃO PODE',
    inconclusive: '⚠ INCONCLUSIVO',
    already_participating: '🔵 JÁ PARTICIPA',
  }
  const tabColors: Record<string, string> = {
    todas: '#d0c0ff',
    pode_aderir: '#22c55e',
    nao_pode: '#ef4444',
    inconclusivo: '#f59e0b',
    ativas: '#60a5fa',
  }
  const tabLabels: Record<string, string> = {
    todas: 'Todas',
    pode_aderir: 'Pode aderir',
    nao_pode: 'Não pode',
    inconclusivo: 'Inconclusivo',
    ativas: 'Já participa',
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a1a',
        color: '#d0c0ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
      }}>
        ⏳ Carregando cenário...
      </div>
    )
  }

  if (!scenario) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a1a',
        color: '#d0c0ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        Cenário não encontrado.{' '}
        <a href="/admin/promocoes" style={{ color: '#a78bfa', marginLeft: 8 }}>Voltar</a>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <button
          onClick={() => router.push('/admin/promocoes')}
          style={{ padding: '8px 16px', background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 8, color: '#a78bfa', cursor: 'pointer', fontSize: 13 }}>
          ← Cenários
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <Badge cor={scenario.active ? '#22c55e' : '#7070a0'}>
              {scenario.active ? '🔥 ATIVO' : '📴 INATIVO'}
            </Badge>
            <Badge cor={scenario.activation_mode === 'aggressive' ? '#f59e0b' : '#60a5fa'}>
              {scenario.activation_mode === 'aggressive' ? '⚡ Agressivo' : '🛡️ Conservador'}
            </Badge>
          </div>
          <h1 style={{ color: '#d0c0ff', fontSize: '1.6em', margin: 0 }}>{scenario.product_name}</h1>
          <div style={{ color: '#7070a0', fontSize: '0.85em', marginTop: 4 }}>
            MLB:{' '}
            <span style={{ color: '#a78bfa', fontFamily: 'monospace', fontSize: '1em' }}>
              {scenario.mlb || '—'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={toggleScenario}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid ' + (scenario.active ? '#ef4444' : '#22c55e'),
              borderRadius: 8,
              color: scenario.active ? '#ef4444' : '#22c55e',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}>
            {scenario.active ? '⏸ Desativar' : '▶ Ativar'}
          </button>
          <a
            href={`/admin/promocoes/${id}/editar`}
            style={{
              padding: '9px 16px',
              background: '#12122a',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              color: '#a78bfa',
              fontSize: 13,
              textDecoration: 'none',
            }}>
            ✏️ Editar
          </a>
          <button
            onClick={fetchPromotions}
            disabled={!scenario.active || fetching}
            style={{
              padding: '9px 18px',
              background: scenario.active ? '#a78bfa' : '#2a2a4a',
              border: 'none',
              borderRadius: 8,
              color: scenario.active ? '#000' : '#7070a0',
              cursor: scenario.active ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 700,
              opacity: fetching ? 0.6 : 1,
            }}>
            {fetching ? '⏳ Buscando...' : '🔍 Buscar Promoções'}
          </button>
        </div>
      </div>

      {/* ── Critérios ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {scenario.max_seller_discount_pct && (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ color: '#7070a0', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>TETO SELLER</div>
            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1.2em' }}>{scenario.max_seller_discount_pct}%</div>
          </div>
        )}
        {scenario.min_sale_price && (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ color: '#7070a0', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>PREÇO MÍNIMO</div>
            <div style={{ color: '#f472b6', fontWeight: 700, fontSize: '1.2em' }}>{fmt(scenario.min_sale_price)}</div>
          </div>
        )}
        {scenario.min_net_receivable && (
          <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ color: '#7070a0', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>RECEBIMENTO MÍNIMO</div>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1.2em' }}>{fmt(scenario.min_net_receivable)}</div>
          </div>
        )}
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: '#7070a0', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ÚLTIMA CONSULTA</div>
          <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{fmtD(scenario.latest_query?.fetched_at)}</div>
        </div>
        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: '#7070a0', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SIMULAÇÕES</div>
          <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: '1.2em' }}>{scenario.simulations?.length || 0}</div>
        </div>
      </div>

      {/* ── Aviso inativo ── */}
      {!scenario.active && (
        <div style={{
          background: '#1a1a3a',
          border: '1px solid #f59e0b',
          borderRadius: 10,
          padding: '12px 16px',
          color: '#f59e0b',
          fontSize: '0.85em',
          marginBottom: 20,
        }}>
          ⚠️ Cenário inativo. Ative para buscar e simular promoções.
        </div>
      )}

      {/* ── Aviso dados desatualizados ── */}
      {scenario.latest_query?.fetched_at && (
        <div style={{
          background: '#12122a',
          border: '1px solid #2a2a4a',
          borderRadius: 10,
          padding: '8px 14px',
          color: '#7070a0',
          fontSize: '0.8em',
          marginBottom: 16,
        }}>
          📡 Dados consultados em {fmtD(scenario.latest_query.fetched_at)}. Podem estar desatualizados.
        </div>
      )}

      {/* ── Abas ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['todas', 'pode_aderir', 'nao_pode', 'inconclusivo', 'ativas'] as Tab[]).map(t => {
          const count = t === 'todas'
            ? promos.length
            : countFor(t === 'pode_aderir' ? 'can_join' : t === 'nao_pode' ? 'cannot_join' : t === 'inconclusivo' ? 'inconclusive' : 'already_participating')
          const tc = tabColors[t]
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 14px',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: tab === t ? tc + '22' : '#12122a',
                border: '1px solid ' + (tab === t ? tc : '#2a2a4a'),
                color: tab === t ? tc : '#7070a0',
              }}>
              {tabLabels[t]} <span style={{ marginLeft: 4, opacity: 0.8 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* ── Promoções ── */}
      {promos.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#12122a',
          border: '1px dashed #2a2a4a',
          borderRadius: 12,
          color: '#4a4a7a',
        }}>
          {scenario.latest_query?.fetched_at
            ? 'Nenhuma promoção encontrada para este MLB.'
            : 'Nenhuma consulta ainda. Clique em "Buscar Promoções" para consultar o ML.'}
        </div>
      )}

      {filtered.map((promo: ClassifiedPromo, idx: number) => {
        const c = corCla[promo.classification] || '#7070a0'
        const l = labelCla[promo.classification] || promo.classification || ''
        const isCanJoin = promo.classification === 'can_join'

        return (
          <div key={idx} style={{
            background: '#12122a',
            border: '1px solid ' + c + '44',
            borderRadius: 12,
            padding: 16,
            marginBottom: 10,
          }}>
            {/* Header do card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <Badge cor={c}>{l}</Badge>
                  <span style={{ background: '#1a2a3a', color: '#7070a0', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>
                    {promo.promotion_type}
                  </span>
                  <span style={{ color: '#7070a0', fontSize: 11 }}>ID: {promo.promotion_id}</span>
                </div>
                <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1em', marginBottom: 4 }}>
                  {promo.promotion_name}
                </div>
                {promo.start_date && promo.finish_date && (
                  <div style={{ color: '#7070a0', fontSize: 11 }}>
                    Vigência: {new Date(promo.start_date).toLocaleDateString('pt-BR')} → {new Date(promo.finish_date).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>

              {/* Coluna de preços */}
              <div style={{ textAlign: 'right', minWidth: 140 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 2 }}>ORIGINAL</div>
                <div style={{
                  color: '#d0c0ff',
                  fontWeight: 700,
                  fontSize: '1.1em',
                  textDecoration: promo.discounted_price ? 'line-through' : 'none',
                  opacity: promo.discounted_price ? 0.5 : 1,
                }}>
                  {fmt(promo.original_price)}
                </div>
                {promo.discounted_price && (
                  <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.2em' }}>
                    {fmt(promo.discounted_price)}
                  </div>
                )}
                {promo.seller_percentage !== null && (
                  <div style={{ color: '#60a5fa', fontSize: 11 }}>Seller: {promo.seller_percentage}%</div>
                )}
                {promo.meli_percentage !== null && (
                  <div style={{ color: '#a78bfa', fontSize: 11 }}>ML: {promo.meli_percentage}%</div>
                )}
                {promo.min_discount_percent !== null && promo.max_discount_percent !== null && (
                  <div style={{ color: '#7070a0', fontSize: 11, marginTop: 4 }}>
                    Faixa: {promo.min_discount_percent}% – {promo.max_discount_percent}%
                  </div>
                )}
                {promo.suggested_discounted_price && (
                  <div style={{ color: '#fbbf24', fontSize: 11 }}>Sugerido: {fmt(promo.suggested_discounted_price)}</div>
                )}
              </div>
            </div>

            {/* Simulação (resultado da classificação) */}
            {promo.seller_pct_used !== null && (
              <div style={{
                background: '#0a0a1a',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 10,
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 2 }}>SELLER USADO</div>
                  <div style={{ color: '#60a5fa', fontWeight: 700 }}>{promo.seller_pct_used}%</div>
                </div>
                <div>
                  <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 2 }}>PREÇO SIMULADO</div>
                  <div style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(promo.simulated_price)}</div>
                </div>
                {promo.simulated_net_receivable !== null ? (
                  <div>
                    <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 2 }}>LÍQUIDO SIMULADO</div>
                    <div style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(promo.simulated_net_receivable)}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 2 }}>LÍQUIDO SIMULADO</div>
                    <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠️ dados insuficientes</div>
                  </div>
                )}
              </div>
            )}

            {/* Motivos da classificação */}
            {(promo.classification_reasons || []).map((r: string, i: number) => {
              const isOk = r.includes('respectitados') || r.includes('ok') || r.includes('aprovado') || r.includes('✅')
              return (
                <div key={i} style={{ color: isOk ? '#22c55e' : '#f59e0b', fontSize: 12, marginBottom: 2 }}>
                  {isOk ? '✅' : '❌'} {r}
                </div>
              )
            })}

            {/* Dados ausentes */}
            {(promo.missing_fields || []).length > 0 && (
              <div style={{ color: '#f59e0b', fontSize: 11, marginBottom: 8 }}>
                ⚠️ Dados ausentes: {(promo.missing_fields || []).join(', ')}
              </div>
            )}

            {/* Benefícios cumulativos */}
            {(promo.has_coupon || promo.has_pix_discount || promo.free_shipping) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {promo.has_coupon && <Badge cor="#fbbf24">🎫 Cupom cumulativo</Badge>}
                {promo.has_pix_discount && <Badge cor="#22c55e">💳 Pix detectado</Badge>}
                {promo.free_shipping && <Badge cor="#60a5fa">🚚 Frete grátis</Badge>}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {/* Ver dados brutos */}
              <button
                onClick={() => setRawModal(promo)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid #2a2a4a',
                  borderRadius: 6,
                  color: '#7070a0',
                  cursor: 'pointer',
                  fontSize: 11,
                }}>
                🔬 Ver dados brutos
              </button>

              {/* Simular adesão */}
              {isCanJoin && (
                <button
                  onClick={() => {
                    setSimModal(promo)
                    setSimResult(null)
                  }}
                  style={{
                    padding: '7px 14px',
                    background: '#22c55e22',
                    border: '1px solid #22c55e',
                    borderRadius: 8,
                    color: '#22c55e',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                  📊 Simular Adesão
                </button>
              )}

              {/* Não pode / Inconclusivo */}
              {!isCanJoin && promo.classification === 'cannot_join' && (
                <span style={{ color: '#ef4444', fontSize: 12, padding: '7px 0', opacity: 0.7 }}>
                  ✗ Bloqueado — ver motivos acima
                </span>
              )}

              {!isCanJoin && promo.classification === 'inconclusive' && (
                <span style={{ color: '#f59e0b', fontSize: 12, padding: '7px 0', opacity: 0.7 }}>
                  ⚠️ Análise inconclusiva — dados insuficientes
                </span>
              )}

              {!isCanJoin && promo.classification === 'already_participating' && (
                <span style={{ color: '#60a5fa', fontSize: 12, padding: '7px 0', opacity: 0.7 }}>
                  🔵 Já participa desta promoção
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* ── Histórico de alterações ── */}
      {scenario.history && scenario.history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            📋 Histórico de Alterações
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scenario.history.slice(0, 15).map((h: any) => (
              <div key={h.id} style={{
                background: '#0a0a1a',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                color: '#7070a0',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}>
                <span style={{ color: '#d0c0ff', fontWeight: 600, minWidth: 160 }}>{h.event_type}</span>
                <span style={{ flex: 1 }}>
                  {h.old_values && h.new_values && (
                    <span style={{ color: '#f59e0b', fontSize: 11 }}>
                      {JSON.stringify(h.old_values)} → {JSON.stringify(h.new_values)}
                    </span>
                  )}
                  {(!h.old_values || !h.new_values) && h.new_values && (
                    <span style={{ color: '#a78bfa', fontSize: 11 }}>{JSON.stringify(h.new_values)}</span>
                  )}
                </span>
                <span style={{ color: '#4a4a7a', fontSize: 11 }}>{fmtD(h.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico de simulações ── */}
      {scenario.simulations && scenario.simulations.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ color: '#7070a0', fontSize: '0.85em', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            📊 Histórico de Simulações ({scenario.simulations.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenario.simulations.slice(0, 10).map((s: Simulation) => (
              <div key={s.id} style={{
                background: '#0a0a1a',
                border: '1px solid #2a2a4a',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge cor="#22c55e">✅ {s.simulation_result}</Badge>
                    <span style={{ color: '#a78bfa', fontSize: 11 }}>{s.promotion_type || '—'}</span>
                    <span style={{ color: '#7070a0', fontSize: 11 }}>ID: {s.promotion_id}</span>
                  </div>
                  <span style={{ color: '#4a4a7a', fontSize: 11 }}>{fmtD(s.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {s.seller_pct && <span style={{ color: '#60a5fa' }}>Seller: {s.seller_pct}%</span>}
                  {s.sale_price && <span style={{ color: '#22c55e' }}>Preço: {fmt(s.sale_price)}</span>}
                  {s.net_receivable && <span style={{ color: '#fbbf24' }}>Líquido: {fmt(s.net_receivable)}</span>}
                </div>
                {(s.decision_reasons || []).length > 0 && (
                  <div style={{ marginTop: 4, color: '#7070a0', fontSize: 11 }}>
                    {s.decision_reasons.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: Simular Adesão ── */}
      {simModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: '#12122a',
            border: '1px solid #22c55e',
            borderRadius: 12,
            padding: 24,
            maxWidth: 520,
            width: '100%',
          }}>
            <h2 style={{ color: '#22c55e', margin: '0 0 4px' }}>📊 Simulação de Adesão</h2>
            <div style={{ color: '#d0c0ff', fontWeight: 700, fontSize: '1em', marginBottom: 16 }}>
              {simModal.promotion_name}
            </div>
            <div style={{ color: '#7070a0', fontSize: 12, marginBottom: 16 }}>
              ID: {simModal.promotion_id} · {simModal.promotion_type}
            </div>

            {/* Dados da simulação */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#0a0a1a', borderRadius: 8, padding: 10 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>TETO SELLER DO CENÁRIO</div>
                <div style={{ color: '#60a5fa', fontWeight: 700 }}>{scenario.max_seller_discount_pct || '—'}%</div>
              </div>
              <div style={{ background: '#0a0a1a', borderRadius: 8, padding: 10 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>SELLER USADO</div>
                <div style={{ color: '#22c55e', fontWeight: 700 }}>{simModal.seller_pct_used != null ? `${simModal.seller_pct_used}%` : '—'}</div>
              </div>
              <div style={{ background: '#0a0a1a', borderRadius: 8, padding: 10 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>PREÇO FINAL</div>
                <div style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(simModal.simulated_price)}</div>
              </div>
              <div style={{ background: '#0a0a1a', borderRadius: 8, padding: 10 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>LÍQUIDO</div>
                <div style={{ color: '#fbbf24', fontWeight: 700 }}>
                  {simModal.simulated_net_receivable != null ? fmt(simModal.simulated_net_receivable) : '⚠️ indisponível'}
                </div>
              </div>
            </div>

            {/* Resultado salvo */}
            {simResult && (
              <div style={{
                background: '#22c55e22',
                border: '1px solid #22c55e44',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#22c55e',
                fontSize: 13,
                marginBottom: 16,
              }}>
                ✅ {simResult.already_exists
                  ? 'ℹ️ Já simulada antes. Registro anterior mantido.'
                  : '💾 Simulação salva no histórico!'}
                <br />
                <span style={{ opacity: 0.8, fontSize: 12 }}>
                  Simulação concluída. Nenhuma alteração foi feita no Mercado Livre.
                </span>
              </div>
            )}

            {/* Aviso */}
            <div style={{
              background: '#0a0a1a',
              border: '1px solid #2a2a4a',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#7070a0',
              fontSize: 12,
              marginBottom: 16,
            }}>
              💡 Esta ação apenas salva a simulação no histórico. Nenhuma promoção será aderida no Mercado Livre.
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10 }}>
              {!simResult && (
                <button
                  onClick={runSimulation}
                  disabled={simLoading}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: '#22c55e',
                    border: 'none',
                    borderRadius: 8,
                    color: '#000',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: simLoading ? 'not-allowed' : 'pointer',
                    opacity: simLoading ? 0.6 : 1,
                  }}>
                  {simLoading ? '⏳ Salvando...' : '💾 Salvar Simulação'}
                </button>
              )}
              <button
                onClick={() => { setSimModal(null); setSimResult(null) }}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'transparent',
                  border: '1px solid #2a2a4a',
                  borderRadius: 8,
                  color: '#7070a0',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Dados Brutos ── */}
      {rawModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: '#12122a',
            border: '1px solid #2a2a4a',
            borderRadius: 12,
            padding: 24,
            maxWidth: 700,
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: '#d0c0ff', margin: 0 }}>🔬 Dados Brutos — {rawModal.promotion_name}</h2>
              <button
                onClick={() => setRawModal(null)}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid #2a2a4a',
                  borderRadius: 6,
                  color: '#7070a0',
                  cursor: 'pointer',
                }}>
                ✕
              </button>
            </div>
            <pre style={{
              background: '#0a0a1a',
              borderRadius: 8,
              padding: 14,
              color: '#a0a0c0',
              fontSize: 11,
              fontFamily: 'monospace',
              overflow: 'auto',
              maxHeight: '60vh',
              margin: 0,
            }}>
              {JSON.stringify(rawModal, null, 2)}
            </pre>
            <div style={{ color: '#4a4a7a', fontSize: 11, marginTop: 10 }}>
              ℹ️ Tokens e dados sensíveis foram omitidos. Apenas dados da promoção.
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.cor,
          color: '#000',
          padding: '10px 24px',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          zIndex: 9999,
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
