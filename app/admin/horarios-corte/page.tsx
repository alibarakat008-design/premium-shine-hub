'use client'
import { useEffect, useState, useCallback } from 'react'

interface Horario {
  id: string
  company_id: string
  company_nome: string
  marketplace_account_id: string
  conta_nickname: string
  marketplace: string
  tipo: string
  descricao: string
  dia_semana: number
  horario: string
  ativo: boolean
  permite_junto_proximo_dia: boolean
  limite_junto_horas: number
  observacoes: string
}

const DIAS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
const TIPOS = [
  { key: 'coleta', label: 'Coleta em casa' },
  { key: 'agencia', label: 'Levar ate agencia' },
  { key: 'correios', label: 'Postar nos Correios' },
  { key: 'transportadora', label: 'Transportadora' },
  { key: 'custom', label: 'Customizado' },
]

export default function HorariosCortePage() {
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [companies, setCompanies] = useState<Array<{ id: string, nome_fantasia: string }>>([])
  const [accounts, setAccounts] = useState<Array<{ id: string, nickname: string, marketplace: string }>>([])

  // Form state
  const [companyId, setCompanyId] = useState<string>('')
  const [mpAccountId, setMpAccountId] = useState<string>('')
  const [tipo, setTipo] = useState<string>('coleta')
  const [descricao, setDescricao] = useState<string>('')
  const [diaSemana, setDiaSemana] = useState<number>(1)
  const [horario, setHorario] = useState<string>('14:00')
  const [permiteJunto, setPermiteJunto] = useState<boolean>(true)
  const [limiteHoras, setLimiteHoras] = useState<number>(2)
  const [observacoes, setObservacoes] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/horarios-corte', { credentials: 'include' })
      const j = await r.json()
      if (j.ok) setHorarios(j.horarios || [])

      const r2 = await fetch('/api/admin/companies-list', { credentials: 'include' })
      const j2 = await r2.json()
      if (j2.ok) setCompanies(j2.companies || [])

      // Pega marketplace accounts
      const r3 = await fetch('/api/admin/marketplace-accounts-list', { credentials: 'include' })
      const j3 = await r3.json()
      if (j3.ok) setAccounts(j3.accounts || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!companyId) {
      alert('Selecione a empresa')
      return
    }
    try {
      setLoading(true)
      const r = await fetch('/api/admin/horarios-corte', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          marketplace_account_id: mpAccountId || null,
          tipo, descricao, dia_semana: diaSemana, horario,
          ativo: true, permite_junto_proximo_dia: permiteJunto,
          limite_junto_horas: limiteHoras, observacoes,
        }),
      })
      const j = await r.json()
      if (j.ok) {
        setShowForm(false)
        setDescricao('')
        setObservacoes('')
        load()
      } else {
        alert('Erro: ' + j.error)
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const del = async (id: string) => {
    if (!confirm('Excluir horario?')) return
    await fetch('/api/admin/horarios-corte?id=' + id, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            Horarios de Corte
          </h1>
          <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Configure o horario de coleta/agencia por empresa e conta. Usado pra calcular data contabil corretamente.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '10px 20px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {showForm ? 'Cancelar' : '+ Novo Horario'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
            Novo Horario de Corte
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Empresa *</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
                <option value="">Selecione...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Conta Marketplace (opcional)</label>
              <select value={mpAccountId} onChange={(e) => setMpAccountId(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
                <option value="">Todas as contas da empresa</option>
                {accounts.filter(a => !companyId || true).map(a => (
                  <option key={a.id} value={a.id}>{a.nickname || a.id.substring(0, 8)} ({a.marketplace})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
                {TIPOS.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Dia da Semana</label>
              <select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
                {DIAS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Horario</label>
              <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Limite (horas)</label>
              <input type="number" min="0" max="24" value={limiteHoras} onChange={(e) => setLimiteHoras(Number(e.target.value))}
                style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--psh-text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={permiteJunto} onChange={(e) => setPermiteJunto(e.target.checked)} />
              Permite imprimir etiquetas do proximo dia junto
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Descricao</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Coleta diaria as 14h na transportadora X"
              style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>Observacoes</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
          </div>

          <button onClick={submit} disabled={loading}
            style={{ marginTop: 16, padding: '10px 24px', background: '#10b981', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {loading ? 'Salvando' : 'Salvar Horario'}
          </button>
        </div>
      )}

      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--psh-text-primary)' }}>
          Horarios Configurados
        </h2>
        {horarios.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Empresa</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Conta</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Dia</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Horario</th>
                  <th style={{ textAlign: 'center', padding: 10, color: 'var(--psh-text-secondary)' }}>Permite Junto?</th>
                  <th style={{ textAlign: 'left', padding: 10, color: 'var(--psh-text-secondary)' }}>Descricao</th>
                  <th style={{ textAlign: 'center', padding: 10, color: 'var(--psh-text-secondary)' }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {horarios.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>{h.company_nome}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-secondary)' }}>{h.conta_nickname || '-'}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>{TIPOS.find(t => t.key === h.tipo)?.label || h.tipo}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)' }}>{DIAS[h.dia_semana]}</td>
                    <td style={{ padding: 10, color: 'var(--psh-text-primary)', fontWeight: 600 }}>{h.horario.substring(0, 5)}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {h.permite_junto_proximo_dia ? (
                        <span style={{ color: '#10b981' }}>✓ ate {h.limite_junto_horas}h</span>
                      ) : (
                        <span style={{ color: 'var(--psh-text-secondary)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: 10, color: 'var(--psh-text-secondary)', fontSize: 12 }}>{h.descricao}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <button onClick={() => del(h.id)}
                        style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--psh-text-secondary)' }}>Nenhum horario configurado. Use o botao acima pra criar.</p>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'var(--psh-bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--psh-text-secondary)' }}>
        <strong>Como funciona o corte:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Voce configura o horario de coleta/agencia por empresa e conta</li>
          <li>Por exemplo: LIURA coleta ML segunda a sexta as 14h, ALAMEDA so tem coleta as 16h</li>
          <li>Se permite "junto proximo dia", etiquetas imprimidas apos o horario contam pro proximo dia util</li>
          <li>O sistema usa isso pra calcular a <strong>data contabil</strong> automaticamente</li>
          <li>Por enquanto o sistema usa 14h fixo como padrao (backfill ja aplicado em orders.data_contabil). Quando rodar o recalculo, ele vai considerar os horarios configurados</li>
        </ul>
      </div>
    </div>
  )
}
