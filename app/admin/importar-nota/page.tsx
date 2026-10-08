'use client'
/**
 * Página: Importar Nota de Compra
 * Faz upload de PDF de orçamento ZAYNEX, extrai produtos,
 * mostra preview com matching de marcas, e salva no banco.
 */
import { useState, useRef, useCallback } from 'react'

interface ItemPreview {
  marca: string; produto: string; volume: string
  quantidade: number; preco_unitario: number; total: number
  acao: 'novo' | 'existe' | 'nova_marca'
  brand_id?: string; product_id?: string; sku_existente?: string
}

interface ResultadoFinal {
  produto: string; acao: 'criado' | 'atualizado' | 'erro'; id?: string; sku?: string; erro?: string
}

export default function ImportarNotaPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [itens, setItens] = useState<ItemPreview[]>([])
  const [marcasNovas, setMarcasNovas] = useState<string[]>([])
  const [marcasExistentes, setMarcasExistentes] = useState<string[]>([])
  const [totalNota, setTotalNota] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<ResultadoFinal[] | null>(null)
  const [tab, setTab] = useState<'upload' | 'preview' | 'resultado'>('upload')
  const fileRef = useRef<HTMLInputElement>(null)

  const authHeaders = {
    'Authorization': 'Basic ' + btoa('premium:shine2026'),
    'Content-Type': 'application/json',
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    setSucesso(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/importar-nota', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: formData,
      })
      const d = await res.json()
      if (!d.ok) { setError(d.error); return }

      setItens(d.resultados || [])
      setMarcasNovas(d.marcas_novas || [])
      setMarcasExistentes(d.marcas_existentes || [])

      const total = (d.resultados || []).reduce((s: number, i: ItemPreview) => s + (i.total || 0), 0)
      setTotalNota(total)
      setTab('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function handleSalvar() {
    setSaving(true)
    setError(null)

    try {
      const produtos = itens.filter(i => i.acao === 'novo').map(i => ({
        marca: i.marca,
        produto: i.produto,
        volume: i.volume,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        brand_id: i.brand_id,
      }))

      if (marcasNovas.length > 0 && produtos.some(p => marcasNovas.map(m => m.toUpperCase()).includes(p.marca.toUpperCase()))) {
        // Confirma criação de marcas
        const marcasParaCriar = produtos
          .map(p => p.marca)
          .filter(m => marcasNovas.map(n => n.toUpperCase()).includes(m.toUpperCase()))
        const res = await fetch('/api/admin/importar-nota', {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ produtos, criar_marcas: [...new Set(marcasParaCriar)] }),
        })
        const d = await res.json()
        if (!d.ok) { setError(d.error); return }
        setSucesso(d.detalhes || [])
      } else {
        const res = await fetch('/api/admin/importar-nota', {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ produtos }),
        })
        const d = await res.json()
        if (!d.ok) { setError(d.error); return }
        setSucesso(d.detalhes || [])
      }

      setTab('resultado')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    setFile(null); setItens([]); setMarcasNovas([]); setSucesso(null)
    setError(null); setTab('upload')
    if (fileRef.current) fileRef.current.value = ''
  }

  const novosCount = itens.filter(i => i.acao === 'novo').length
  const existemCount = itens.filter(i => i.acao === 'existe').length
  const novoMarcaCount = itens.filter(i => i.acao === 'nova_marca').length
  const totalCusto = itens.filter(i => i.acao === 'novo').reduce((s, i) => s + (i.preco_unitario || 0) * (i.quantidade || 0), 0)

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div style={{ padding: 24, color: '#e0e0e0', minHeight: '100vh', background: '#0d0d14' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
          📥 Importar Nota de Compra
        </h2>
        <p style={{ margin: '6px 0 0', color: '#888', fontSize: 13 }}>
          Upload de Orçamento ZAYNEX (PDF) → extrai produtos → salva com custos nas marcas corretas
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['upload', 'preview', 'resultado'] as const).map(t => (
          <button key={t} onClick={() => (t === 'upload' || (t === 'preview' && itens.length) || (t === 'resultado' && sucesso)) && setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
              background: tab === t ? '#7c3aed' : '#1e1e2e', color: tab === t ? '#fff' : '#888',
              fontWeight: tab === t ? 600 : 400,
            }}>
            {t === 'upload' ? '1. Upload' : t === 'preview' ? '2. Preview' : '3. Resultado'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#3d1010', border: '1px solid #f87171', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {/* TAB 1: Upload */}
      {tab === 'upload' && (
        <div style={{ background: '#13131f', borderRadius: 14, padding: 32, border: '1px solid #2a2a40' }}>
          <div style={{ border: '2px dashed #333', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xml"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            {file ? (
              <>
                <div style={{ color: '#a78bfa', fontWeight: 600 }}>{file.name}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </>
            ) : (
              <>
                <div style={{ color: '#888' }}>Arraste ou</div>
                <button onClick={() => fileRef.current?.click()} style={{
                  marginTop: 12, padding: '10px 24px', background: '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                }}>
                  Escolher arquivo
                </button>
                <div style={{ color: '#555', fontSize: 12, marginTop: 10 }}>
                  Aceita PDF (ZAYNEX Orçamento) ou XML (NF-e)
                </div>
              </>
            )}
          </div>

          {file && (
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button onClick={handleUpload} disabled={uploading} style={{
                flex: 1, padding: '14px 0', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600,
                opacity: uploading ? 0.6 : 1,
              }}>
                {uploading ? '🔄 Processando...' : '🔍 Analisar Arquivo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Preview */}
      {tab === 'preview' && itens.length > 0 && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard label="Total de Itens" value={itens.length.toString()} color="#7c3aed" />
            <StatCard label=" Novos" value={novosCount.toString()} color="#22c55e" />
            <StatCard label=" Já existem" value={existemCount.toString()} color="#f59e0b" />
            <StatCard label=" Custo Total" value={fmt(totalCusto)} color="#ef4444" />
          </div>

          {novoMarcaCount > 0 && (
            <div style={{ background: '#2d1f00', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
              ⚠️ {novoMarcaCount} produto(s) têm marca nova: <b>{[...new Set(itens.filter(i => i.acao === 'nova_marca').map(i => i.marca))].join(', ')}</b>. Será criada automaticamente.
            </div>
          )}

          {/* Table */}
          <div style={{ background: '#13131f', borderRadius: 14, overflow: 'hidden', border: '1px solid #2a2a40' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a40', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#888' }}>
                Total da Nota: <b style={{ color: '#ef4444' }}>{fmt(totalNota)}</b>
              </span>
            </div>
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1a1a28' }}>
                  <tr style={{ color: '#888' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ação</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Marca</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Produto</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Vol.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Qtd</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Custo Unit.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e1e2e', background: item.acao === 'existe' ? '#1a1500' : 'transparent' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: item.acao === 'novo' ? '#14532d' : item.acao === 'nova_marca' ? '#78350f' : '#1e3a5f',
                          color: item.acao === 'novo' ? '#4ade80' : item.acao === 'nova_marca' ? '#fb923c' : '#60a5fa',
                        }}>
                          {item.acao === 'novo' ? 'NOVO' : item.acao === 'nova_marca' ? 'NOVA MARCA' : 'EXISTE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{item.marca}</td>
                      <td style={{ padding: '8px 12px' }}>{item.produto}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#888' }}>{item.volume}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{item.quantidade}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#4ade80' }}>{fmt(item.preco_unitario)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={handleReset} style={{
              padding: '12px 24px', background: '#1e1e2e', color: '#888', border: '1px solid #333',
              borderRadius: 10, cursor: 'pointer', fontSize: 14,
            }}>
              ← Escolher outro arquivo
            </button>
            <button onClick={handleSalvar} disabled={saving || novosCount === 0} style={{
              flex: 1, padding: '14px 0', background: '#22c55e', color: '#fff',
              border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 700, opacity: (saving || novosCount === 0) ? 0.5 : 1,
            }}>
              {saving ? '🔄 Salvando...' : `💾 Salvar ${novosCount} Produto(s) com Custos`}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Resultado */}
      {tab === 'resultado' && sucesso && (
        <div style={{ background: '#13131f', borderRadius: 14, padding: 24, border: '1px solid #2a2a40' }}>
          <h3 style={{ margin: '0 0 16px', color: '#4ade80', fontSize: 18 }}>✅ Importação Concluída!</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard label="Criados" value={sucesso.filter(s => s.acao === 'criado').length.toString()} color="#22c55e" />
            <StatCard label="Atualizados" value={sucesso.filter(s => s.acao === 'atualizado').length.toString()} color="#f59e0b" />
            <StatCard label="Erros" value={sucesso.filter(s => s.acao === 'erro').length.toString()} color="#ef4444" />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#888' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Produto</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>SKU</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Erro</th>
              </tr>
            </thead>
            <tbody>
              {sucesso.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1e1e2e' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: s.acao === 'criado' ? '#14532d' : s.acao === 'atualizado' ? '#1e3a5f' : '#3d1010',
                      color: s.acao === 'criado' ? '#4ade80' : s.acao === 'atualizado' ? '#60a5fa' : '#f87171',
                    }}>
                      {s.acao.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{s.produto}</td>
                  <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{s.sku || '-'}</td>
                  <td style={{ padding: '8px 12px', color: '#f87171', fontSize: 11 }}>{s.erro || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleReset} style={{
            marginTop: 20, padding: '12px 24px', background: '#7c3aed', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>
            📥 Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#13131f', borderRadius: 12, padding: 16, border: '1px solid #2a2a40', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  )
}
