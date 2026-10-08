'use client'
import { useEffect, useState, useCallback } from 'react'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const K = (n: number) => n.toLocaleString('pt-BR')

export default function UploadImpressoesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [partnerId, setPartnerId] = useState<string>('')
  const [fornecedores, setFornecedores] = useState<Array<{ id: string, nome_fantasia: string }>>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/companies-list', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.ok) setFornecedores(j.companies || []) })
  }, [])

  const upload = async () => {
    if (!file) {
      alert('Selecione um PDF')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (partnerId) form.append('partner_company_id', partnerId)
      const r = await fetch('/api/admin/fornecedor/upload-impressoes', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const j = await r.json()
      setResult(j)
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)', marginBottom: 8 }}>
        Upload de PDF de Impressoes ML
      </h1>
      <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Anexe o PDF gerado pelo Mercado Livre ao imprimir etiquetas. O sistema extrai os order_numbers
        e cruza com as vendas pra validar o que foi impresso.
      </p>

      <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>
            Parceiro que imprimiu (opcional, pra marcar automaticamente)
          </label>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }}>
            <option value="">Apenas cruzar (sem marcar)</option>
            {fornecedores.filter(f => f.id !== 'e2633570-74da-4b14-9ca1-ba7b0670e612').map(f => (
              <option key={f.id} value={f.id}>{f.nome_fantasia}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--psh-text-secondary)', display: 'block', marginBottom: 4 }}>
            PDF do Mercado Livre
          </label>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: '100%', padding: 8, border: '1px solid var(--psh-border)', borderRadius: 6, background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)' }} />
          {file && (
            <p style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginTop: 4 }}>
              Arquivo: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <button onClick={upload} disabled={loading || !file}
          style={{ padding: '10px 24px', background: 'var(--psh-accent, #3b82f6)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {loading ? 'Processando' : 'Processar PDF'}
        </button>
      </div>

      {result && (
        <div style={{ background: 'var(--psh-bg-secondary)', borderRadius: 12, padding: 24, marginTop: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--psh-text-primary)' }}>
            Resultado
          </h2>

          {result.ok ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <Stat label="Order Numbers no PDF" value={K(result.orderNumbers_encontrados?.length || 0)} />
                <Stat label="Encontrados no DB" value={K(result.cruzamento?.matched_db || 0)} highlight />
                <Stat label="Nao encontrados" value={K(result.cruzamento?.no_db || 0)} alert={!!result.cruzamento?.no_db} />
              </div>

              {result.acao && (
                <div style={{ background: 'var(--psh-bg-primary)', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 14, color: 'var(--psh-text-primary)' }}>
                  {result.acao}
                </div>
              )}

              {result.cruzamento?.matched_ids?.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--psh-border)' }}>
                        <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Order</th>
                        <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>Total</th>
                        <th style={{ textAlign: 'right', padding: 8, color: 'var(--psh-text-secondary)' }}>CMV</th>
                        <th style={{ textAlign: 'left', padding: 8, color: 'var(--psh-text-secondary)' }}>Impresso por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.cruzamento.matched_ids.map((m: any) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--psh-border)' }}>
                          <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>#{m.order_number}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>{fmtBRL(Number(m.total))}</td>
                          <td style={{ padding: 8, textAlign: 'right', color: 'var(--psh-text-secondary)' }}>{fmtBRL(Number(m.custo_total))}</td>
                          <td style={{ padding: 8, color: 'var(--psh-text-primary)' }}>{m.impressa_por_nome || '(LIURA mesma)'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#ef4444' }}>Erro: {result.error}</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: 'var(--psh-bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--psh-text-secondary)' }}>
        <strong>Como funciona:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Voce imprime etiquetas no Mercado Livre e gera o PDF</li>
          <li>Anexa o PDF aqui</li>
          <li>Sistema extrai os order_numbers e compara com as vendas no banco</li>
          <li>Se voce selecionou um parceiro, marca todas as vendas como "impressa por" esse parceiro</li>
          <li>Isso alimenta o relatorio "Vendas a Parceiros" automaticamente</li>
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight, alert }: { label: string, value: string, highlight?: boolean, alert?: boolean }) {
  return (
    <div style={{ background: 'var(--psh-bg-primary)', padding: 12, borderRadius: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--psh-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: alert ? '#ef4444' : highlight ? '#10b981' : 'var(--psh-text-primary)' }}>{value}</div>
    </div>
  )
}
