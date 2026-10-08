'use client'

/**
 * IA ASSISTENTE — estilo Mercado Livre
 * Cada card = 1 pergunta com produto + pergunta + resposta
 * Layout: cards empilhados verticalmente (sem sidebar esquerda)
 */
import { useEffect, useState } from 'react'

const AUTH = 'Basic ' + btoa('premium:shine2026')
const fmtH = (d: string | null) => {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const horas = Math.floor(diff / 3600000)
  const dias = Math.floor(diff / 86400000)
  if (dias > 0) return `Há ${dias}d`
  if (horas > 0) return `Há ${horas}h`
  const min = Math.floor(diff / 60000)
  return `Há ${min}min`
}

type View = 'perguntas' | 'treinar'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface MLQuestion {
  id: string
  texto: string
  status: string
  answer: string | null
  created_at: string
  from_nickname: string
  from_id?: number
  listing?: {
    item_id: string
    title: string
    thumbnail: string
    permalink: string
    price: number
    sold_quantity?: number
  }
}
interface TrainedResponse {
  id: string
  question_pattern: string
  trained_response: string
  category: string
  ml_response: string | null
  shopee_response: string | null
  times_used: number
  created_at: string
}
interface Counts { total_questions: number; unanswered: number }

// ─── Página Principal ────────────────────────────────────────────────────────
export default function IARespostasPage() {
  const [view, setView] = useState<View>('perguntas')
  const [questions, setQuestions] = useState<MLQuestion[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set())
  const [responseTexts, setResponseTexts] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingMsg, setSendingMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [deletedQ, setDeletedQ] = useState<Set<string>>(new Set())
  const [trained, setTrained] = useState<TrainedResponse[]>([])
  const [mlReal, setMlReal] = useState(false)

  const loadQuestions = () => {
    setLoading(true)
    fetch('/api/admin/ml-listings', { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          // Flatten: todas as perguntas de todos os listings
          const flat: MLQuestion[] = []
          for (const listing of d.listings || []) {
            for (const q of listing.questions || []) {
              flat.push({ ...q, listing: listing.item || undefined })
            }
          }
          // Ordena: mais recentes primeiro
          flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          setQuestions(flat)
          setCounts(d.counts || null)
          setMlReal(!!d.ml_real)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  const loadTrained = () => {
    fetch('/api/admin/ia-responses', { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(d => { if (d.ok) setTrained(d.responses || []) })
      .catch(() => {})
  }

  useEffect(() => {
    loadQuestions()
    loadTrained()
  }, [])

  const visibleQuestions = questions.filter(q => !deletedQ.has(q.id))

  const getTrainedResponse = (texto: string) => {
    return trained.find(t => {
      const q = texto.toLowerCase()
      const p = t.question_pattern.toLowerCase()
      return p.split(' ').filter(w => w.length > 3).every(w => q.includes(w))
    })
  }

  const toggleExpand = (qId: string) => {
    const n = new Set(expandedQ)
    if (n.has(qId)) n.delete(qId)
    else n.add(qId)
    setExpandedQ(n)
    // Auto-fill response if not answered
    const q = questions.find(q => q.id === qId)
    if (q && !q.answer && !responseTexts[qId]) {
      const match = getTrainedResponse(q.texto)
      if (match) setResponseTexts(prev => ({ ...prev, [qId]: match.trained_response }))
    }
  }

  const sendAnswer = async (qId: string) => {
    const text = responseTexts[qId]?.trim()
    if (!text) return
    setSendingId(qId)
    setSendingMsg(null)
    try {
      const res = await fetch('/api/admin/ml-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ question_id: qId, text }),
      })
      const d = await res.json()
      if (d.ok) {
        setSendingMsg({ type: 'ok', text: '✅ Resposta enviada ao Mercado Livre!' })
        setResponseTexts(prev => { const n = { ...prev }; delete n[qId]; return n })
        setExpandedQ(prev => { const n = new Set(prev); n.delete(qId); return n })
        setTimeout(() => loadQuestions(), 1500)
      } else {
        setSendingMsg({ type: 'err', text: d.error || 'Erro ao enviar resposta' })
      }
    } catch {
      setSendingMsg({ type: 'err', text: 'Erro de conexão' })
    }
    setSendingId(null)
    setTimeout(() => setSendingMsg(null), 4000)
  }

  const deleteQuestion = async (qId: string) => {
    if (!confirm('Remover esta pergunta da lista?')) return
    setDeletedQ(prev => new Set([...prev, qId]))
    await fetch(`/api/admin/ml-question/${qId}`, { method: 'DELETE', headers: { Authorization: AUTH } })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, color: '#1f2937', margin: 0 }}>
          💬 IA assistente de Respostas
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85em', margin: '4px 0 10px' }}>
          {mlReal ? (
            <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
              🔴 Dados REAIS do Mercado Livre
            </span>
          ) : (
            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
              ⚠️ Modo demo
            </span>
          )}
        </p>
        {/* Stats bar */}
        {counts && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#1e40af', fontWeight: 800, fontSize: '1.2em' }}>{counts.unanswered}</span>
              <span style={{ color: '#9ca3af', fontSize: 11 }}>perguntas</span>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#166534', fontWeight: 800, fontSize: '1.2em' }}>{counts.total_questions}</span>
              <span style={{ color: '#9ca3af', fontSize: 11 }}>total</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {([['perguntas','💬 Perguntas'],['treinar','🎓 Treinar IA']] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{
              padding: '9px 20px', background: 'transparent', border: 'none',
              borderBottom: view === v ? '2px solid #7c3aed' : '2px solid transparent',
              color: view === v ? '#7c3aed' : '#6b7280', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'perguntas' ? (
        <>
          {/* Feedback */}
          {sendingMsg && (
            <div style={{
              position: 'fixed', top: 20, right: 20, padding: '12px 20px',
              background: sendingMsg.type === 'ok' ? '#10b981' : '#ef4444',
              color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
            }}>
              {sendingMsg.text}
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              Carregando perguntas...
            </div>
          ) : visibleQuestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Todas as perguntas foram respondidas!</div>
            </div>
          ) : (
            /* ─── LISTA DE CARDS (estilo ML) ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleQuestions.map(q => {
                const listing = q.listing
                const match = getTrainedResponse(q.texto)
                const isExpanded = expandedQ.has(q.id)
                const isAnswered = !!q.answer
                const currentText = responseTexts[q.id] || ''
                const isSending = sendingId === q.id

                return (
                  <div key={q.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}>

                    {/* ── PARTE DE CIMA: PRODUTO (branco) ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto auto', gap: 12, alignItems: 'center', padding: '14px 16px' }}>
                      {/* Imagem */}
                      {listing?.thumbnail ? (
                        <img
                          src={listing.thumbnail}
                          style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }}
                          alt=""
                        />
                      ) : (
                        <div style={{ width: 64, height: 64, borderRadius: 6, background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📷</div>
                      )}

                      {/* Info */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#9ca3af', fontSize: 10, fontFamily: 'monospace', marginBottom: 3, textTransform: 'uppercase' }}>
                          {listing?.item_id || '—'}
                        </div>
                        <div style={{ color: '#1f2937', fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {listing?.title || 'Anúncio'}
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                          {listing?.price && (
                            <span style={{ color: '#16a34a', fontWeight: 800, fontSize: 13 }}>
                              R$ {listing.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {listing?.sold_quantity !== undefined && (
                            <span style={{ color: '#9ca3af', fontSize: 11 }}>
                              {listing.sold_quantity} vendidos
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Badge catálogo */}
                      {listing?.permalink && (
                        <a href={listing.permalink} target="_blank" rel="noopener noreferrer"
                          title="Ver no Mercado Livre"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', textDecoration: 'none', flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/><polyline points="15 3 21 3 21 9" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="14" x2="21" y2="3" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
                        </a>
                      )}

                      {/* Menu dots */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', padding: 4 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af' }} />
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af' }} />
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af' }} />
                      </div>
                    </div>

                    {/* ── PARTE DE BAIXO: PERGUNTA (cinza claro #f5f5f5) ── */}
                    <div style={{ background: '#f5f5f5', borderTop: '1px solid #e5e7eb' }}>
                      {/* Linha da pergunta */}
                      <div
                        style={{
                          padding: '12px 16px',
                          cursor: (!isAnswered && !isExpanded) ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                        onClick={() => !isAnswered && !isExpanded && toggleExpand(q.id)}
                      >
                        {/* Indicador não lida */}
                        {!isAnswered && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                        )}
                        {isAnswered && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                        )}

                        {/* Texto da pergunta */}
                        <span style={{ color: '#374151', fontSize: 13, fontWeight: 500, flex: 1 }}>
                          {q.from_nickname}: <span style={{ fontWeight: 700 }}>"{q.texto}"</span>
                        </span>

                        {/* Timestamp + warning */}
                        <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>
                          {fmtH(q.created_at)}
                        </span>
                        {!isAnswered && (
                          <span style={{ color: '#dc2626', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                            Afeta seu tempo de resposta
                          </span>
                        )}

                        {/* Expand/collapse */}
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none"
                          style={{
                            color: '#9ca3af', flexShrink: 0,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>

                      {/* ── RESPOSTA JÁ ENVIADA ── */}
                      {isAnswered && (
                        <div style={{ padding: '0 16px 12px 30px' }}>
                          <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ color: '#166534', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>✅ SUA RESPOSTA:</div>
                            <div style={{ color: '#166534', fontSize: 13, lineHeight: 1.5 }}>{q.answer}</div>
                          </div>
                        </div>
                      )}

                      {/* ── ÁREA EXPANDIDA: TEXTEIRA + BOTÕES ── */}
                      {isExpanded && !isAnswered && (
                        <div style={{ padding: '0 16px 14px' }}>
                          {/* Preview treinada */}
                          {match && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>🎓 TREINADA</span>
                                <span style={{ color: '#9ca3af', fontSize: 10 }}>Usada {match.times_used}x</span>
                              </div>
                              <div style={{ color: '#166534', fontSize: 12, lineHeight: 1.5 }}>{match.trained_response}</div>
                            </div>
                          )}

                          <textarea
                            value={currentText}
                            onChange={e => setResponseTexts(prev => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="Digite a resposta para este cliente..."
                            rows={4}
                            style={{
                              width: '100%', padding: '10px 12px', background: '#fff',
                              border: '1px solid #d1d5db', borderRadius: 8, color: '#374151',
                              fontSize: 13, boxSizing: 'border-box', resize: 'vertical',
                              outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
                            <button
                              onClick={() => {
                                setResponseTexts(prev => ({ ...prev, [q.id]: match?.trained_response || '' }))
                              }}
                              style={{
                                padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb',
                                borderRadius: 7, color: '#374151', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600,
                              }}>
                              🔄 Limpar
                            </button>
                            <button
                              onClick={() => sendAnswer(q.id)}
                              disabled={isSending || !currentText.trim()}
                              style={{
                                padding: '7px 16px', background: '#7c3aed', border: 'none',
                                borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 12,
                                cursor: isSending || !currentText.trim() ? 'not-allowed' : 'pointer',
                                opacity: isSending || !currentText.trim() ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', gap: 6,
                              }}>
                              {isSending ? '⏳ Enviando...' : '📤 Enviar Resposta'}
                            </button>
                            <button
                              onClick={() => deleteQuestion(q.id)}
                              style={{
                                padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca',
                                borderRadius: 7, color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/></svg>
                              Excluir
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* ─── VIEW: TREINAR IA ─── */
        <TrainView trained={trained} onRefresh={loadTrained} onDelete={async (id: string) => {
          await fetch(`/api/admin/ia-responses/${id}`, { method: 'DELETE', headers: { Authorization: AUTH } })
          loadTrained()
        }} />
      )}
    </div>
  )
}

// ─── View: Treinar IA ────────────────────────────────────────────────────────
const CATEGORIAS = ['originalidade','notas_olfativas','prazo_entrega','devolucao','composicao','embalagem','nota_fiscal','tamanho','desconto','outro']
const SUGESTOES = [
  { pattern: 'é original', response: 'Sim, todos os nossos produtos são 100% originais! Trabalhamos direto com distribuidores oficiais e cada produto acompanha nota fiscal de procedência. Pode comprar com tranquilidade! 😊', category: 'originalidade' },
  { pattern: 'notas olfativas', response: 'Nosso perfume conta com notas de topo, coração e base. São essências importadas de alta qualidade que garantem fixação de 6-8 horas na pele.', category: 'notas_olfativas' },
  { pattern: 'prazo entrega', response: 'O prazo de entrega varia de acordo com seu CEP. Após a postagem, geralmente de 5-12 dias úteis chega. Você pode simular o prazo na página do produto! 📦', category: 'prazo_entrega' },
  { pattern: 'devolver', response: 'Sim! Você tem 7 dias após o recebimento para solicitar troca ou devolução. É só entrar em contato por aqui que a gente orienta todo o processo, sem burocracia. 🔄', category: 'devolucao' },
  { pattern: 'embalagem presente', response: 'Enviamos em embalagem stealth (discreta). Se quiser embalagem de presente, é só pedir no campo observações do pedido! 🎁', category: 'embalagem' },
  { pattern: 'nota fiscal', response: 'Sim! Todos os nossos produtos acompanham nota fiscal eletrônica emitida em nome do comprador e enviada por e-mail após a postagem. 📄', category: 'nota_fiscal' },
  { pattern: 'tamanho ml', response: 'Temos disponível em várias versões: 25ml, 50ml, 75ml e 100ml! O tamanho mais popular é o de 100ml por ter o melhor custo-benefício.', category: 'tamanho' },
  { pattern: 'fixação', response: 'A fixação varia de 6 a 12 horas dependendo da concentração (EDP ou EDT) e do tipo de pele. Recomendamos aplicar nos pulsos e atrás das orelhas para maior durabilidade. 🕐', category: 'originalidade' },
]

function TrainView({ trained, onRefresh, onDelete }: { trained: TrainedResponse[]; onRefresh: () => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState({ question_pattern: '', trained_response: '', category: 'originalidade' })
  const [ml_response, setMlResponse] = useState('')
  const [shopee_response, setShopeeResponse] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const showMsg = (type: string, text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ia-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ ...form, ml_response: ml_response || null, shopee_response: shopee_response || null }),
      })
      const d = await res.json()
      if (d.ok) {
        showMsg('ok', '✅ Resposta treinada com sucesso!')
        setForm({ question_pattern: '', trained_response: '', category: 'originalidade' })
        setMlResponse(''); setShopeeResponse('')
        onRefresh()
      } else {
        showMsg('err', d.error || 'Erro')
      }
    } catch { showMsg('err', 'Erro de conexão') }
    setSaving(false)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Esquerda: respostas treinadas */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontSize: 13, fontWeight: 700, color: '#374151' }}>
          🎓 Respostas Treinadas ({trained.length})
        </div>
        <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
          {trained.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#d1d5db', fontSize: 13 }}>
              Nenhuma resposta treinada ainda.<br />Use os modelos sugeridos ao lado.
            </div>
          ) : trained.map(r => (
            <div key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>{r.category.replace(/_/g,' ')}</span>
                <button onClick={() => { if (!deleting.has(r.id)) { setDeleting(prev => new Set([...prev, r.id])); Promise.resolve(onDelete(r.id)).finally(() => setDeleting(prev => { const n = new Set(prev); n.delete(r.id); return n })) } }}
                  disabled={deleting.has(r.id)}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: deleting.has(r.id) ? 'default' : 'pointer', fontSize: 12 }}>
                  {deleting.has(r.id) ? '...' : '🗑️'}
                </button>
              </div>
              <div style={{ color: '#1f2937', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🔑 {r.question_pattern}</div>
              <div style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.4 }}>{r.trained_response.slice(0, 120)}{r.trained_response.length > 120 ? '...' : ''}</div>
              <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>Usada {r.times_used}x</div>
            </div>
          ))}
        </div>
      </div>

      {/* Direita: treinar nova */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 6px 0', color: '#374151', fontSize: '1.1em', fontWeight: 700 }}>➕ Treinar Nova Resposta</h3>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>Adicione uma resposta que a IA usará automaticamente para perguntas similares.</p>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>💡 Modelos prontos:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGESTOES.map((s, i) => (
              <button key={i} onClick={() => setForm({ question_pattern: s.pattern, trained_response: s.response, category: s.category })}
                style={{ padding: '4px 10px', background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 6, color: '#7c3aed', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                + {s.pattern}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div style={{ background: msg.type==='ok'?'#ecfdf5':'#fef2f2', border:`1px solid ${msg.type==='ok'?'#059669':'#dc2626'}`, borderRadius:8, padding:'10px 14px', color:msg.type==='ok'?'#059669':'#dc2626', fontSize:12, marginBottom:14 }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🔑 Palavras-chave *</label>
            <input type="text" value={form.question_pattern} onChange={e => setForm(f => ({ ...f, question_pattern: e.target.value }))} required
              placeholder="Ex: é original"
              style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#374151', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📦 ML específico</label>
              <input type="text" value={ml_response} onChange={e => setMlResponse(e.target.value)}
                placeholder="Resposta só pra ML"
                style={{ width: '100%', padding: '9px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#374151', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🛒 Shopee específico</label>
              <input type="text" value={shopee_response} onChange={e => setShopeeResponse(e.target.value)}
                placeholder="Resposta só pra Shopee"
                style={{ width: '100%', padding: '9px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#374151', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>💬 Resposta treinada *</label>
            <textarea value={form.trained_response} onChange={e => setForm(f => ({ ...f, trained_response: e.target.value }))} required
              placeholder="Cole aqui a resposta que a IA deve usar automaticamente..."
              rows={5}
              style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#374151', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🏷️ Categoria</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#374151', fontSize: 13, boxSizing: 'border-box' }}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving}
            style={{ padding: '10px 24px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, width: '100%' }}>
            {saving ? '⏳ Salvando...' : '🎓 Treinar Resposta'}
          </button>
        </form>
      </div>
    </div>
  )
}
