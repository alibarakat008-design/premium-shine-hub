'use client'

/**
 * /admin/folha-controle
 * 
 * Upload de PDF/XML de etiquetas → extrai SKUs/quantidades → 
 * controle de quem separou/pegou cada pedido.
 * 
 * Fluxo:
 * 1. Upload PDF (etiquetas impressas do ML/Shopee)
 * 2. Sistema extrai códigos/SKUs do PDF
 * 3. Mostra tabela editável: pedido | SKU | qtd | quem pegou | data | status
 * 4. Gera "nota de separação" pra imprimir
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type ItemExtraido = {
  id: string
  codigo: string       // código da etiqueta (ex: CBA123456789BR)
  sku?: string        // SKU detectado (pode ser parcial)
  nome?: string       // nome do produto (se detectar)
  quantidade: number   // 1 por etiqueta normalmente
  arquivo_origem: string
  data_upload: string
}

type Registro = {
  id: string
  item: ItemExtraido
  responsavel: string
  data_separacao: string
  observacao: string
  status: 'pendente' | 'separado' | 'entregue'
}

const RESPONSAVEIS = [
  'Alibaba',
  'Ana',
  'Bruno',
  'Carlos',
  'Daniela',
  'Equipe Manhã',
  'Equipe Tarde',
  'Outro',
]

export default function FolhaControlePage() {
  const router = useRouter()
  const [authOk, setAuthOk] = useState(false)
  const [activeTab, setActiveTab] = useState<'upload' | 'controle' | 'historico'>('upload')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [itensExtraidos, setItensExtraidos] = useState<ItemExtraido[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loadingRegistros, setLoadingRegistros] = useState(false)
  const [editandoRegistro, setEditandoRegistro] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ responsavel: '', observacao: '', status: 'pendente' as Registro['status'] })

  // Auth
  useEffect(() => {
    const auth = btoa('premium:shine2026')
    fetch('/api/admin/login-empresa', {
      headers: { Authorization: `Basic ${auth}` },
      credentials: 'include',
    }).then(r => r.json()).then(d => {
      if (d.ok) setAuthOk(true)
      else router.push('/login')
    })
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // Carregar registros salvos
  const loadRegistros = useCallback(async () => {
    setLoadingRegistros(true)
    try {
      const res = await fetch('/api/admin/folha-controle', {
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const d = await res.json()
      if (d.ok) {
        setRegistros(d.data || [])
      }
    } catch {
      showToast('❌ Erro ao carregar registros')
    } finally {
      setLoadingRegistros(false)
    }
  }, [])

  useEffect(() => {
    if (authOk && activeTab !== 'upload') loadRegistros()
  }, [authOk, activeTab])

  // Upload + parse PDF
  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setParseError(null)
    setItensExtraidos([])

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('company_id', 'e2633570-74da-4b14-9ca1-ba7b0670e612')

      const res = await fetch('/api/admin/folha-controle/upload', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: formData,
      })
      const d = await res.json()
      if (d.ok) {
        setItensExtraidos(d.itens || [])
        showToast(`✅ ${d.itens?.length || 0} itens extraídos`)
        if ((d.itens?.length || 0) === 0) {
          setParseError('Nenhum código detectado. Verifique se o PDF tem códigos de rastreamento visíveis.')
        }
      } else {
        setParseError(d.error || 'Erro ao processar arquivo')
      }
    } catch {
      setParseError('Erro de conexão')
    } finally {
      setUploading(false)
    }
  }

  // Salvar itens extraídos como registros pendentes
  async function handleSalvarItens() {
    if (!itensExtraidos.length) return
    try {
      const res = await fetch('/api/admin/folha-controle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ itens: itensExtraidos }),
      })
      const d = await res.json()
      if (d.ok) {
        showToast(`✅ ${itensExtraidos.length} itens salvos`)
        setItensExtraidos([])
        setActiveTab('controle')
        loadRegistros()
      } else {
        showToast('❌ ' + (d.error || 'Erro'))
      }
    } catch {
      showToast('❌ Erro ao salvar')
    }
  }

  // Atualizar registro
  async function handleSalvarRegistro(reg: Registro) {
    try {
      const res = await fetch(`/api/admin/folha-controle?id=${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa('premium:shine2026') },
        body: JSON.stringify({ responsavel: editForm.responsavel, observacao: editForm.observacao, status: editForm.status }),
      })
      const d = await res.json()
      if (d.ok) {
        setRegistros(prev => prev.map(r => r.id === reg.id ? {
          ...r,
          responsavel: editForm.responsavel,
          observacao: editForm.observacao,
          status: editForm.status,
        } : r))
        setEditandoRegistro(null)
        showToast('✅ Registro atualizado')
      }
    } catch {
      showToast('❌ Erro ao salvar')
    }
  }

  // Excluir registro
  async function handleExcluir(id: string) {
    if (!confirm('Excluir este registro?')) return
    try {
      const res = await fetch(`/api/admin/folha-controle?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Basic ' + btoa('premium:shine2026') },
      })
      const d = await res.json()
      if (d.ok) {
        setRegistros(prev => prev.filter(r => r.id !== id))
        showToast('✅ Excluído')
      }
    } catch {
      showToast('❌ Erro ao excluir')
    }
  }

  // Gerar nota de separação (impressão)
  function handleImprimir() {
    const pendentes = registros.filter(r => r.status !== 'entregue')
    if (!pendentes.length) return showToast('Nenhum item pendente')
    const html = gerarHTMLNota(pendentes)
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.print()
    }
  }

  function gerarHTMLNota(items: Registro[]): string {
    const agora = new Date().toLocaleString('pt-BR')
    const total = items.length
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Folha de Controle</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
  h2 { text-align: center; margin-bottom: 4px; }
  .sub { text-align: center; color: #666; font-size: 11px; margin-top: 0; }
  .meta { display: flex; justify-content: space-between; margin: 12px 0; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .meta-item { }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #000; color: #fff; padding: 5px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; }
  .pendente { background: #fff3cd; color: #856404; }
  .separado { background: #d4edda; color: #155724; }
  .entregue { background: #cce5ff; color: #004085; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #999; }
  .resp { font-weight: bold; }
</style></head><body>
<h2>FOLHA DE CONTROLE DE SEPARAÇÃO</h2>
<p class="sub">Premium Shine Hub — ${agora}</p>
<div class="meta">
  <div class="meta-item"><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
  <div class="meta-item"><strong>Total itens:</strong> ${total}</div>
  <div class="meta-item"><strong>Pendentes:</strong> ${items.filter(i => i.status === 'pendente').length}</div>
</div>
<table>
  <thead><tr>
    <th>#</th><th>Código Rastreio</th><th>SKU</th><th>Responsável</th><th>Status</th><th>Observação</th>
  </tr></thead>
  <tbody>
    ${items.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td><strong>${r.item.codigo}</strong></td>
      <td>${r.item.sku || '—'}</td>
      <td class="resp">${r.responsavel || '—'}</td>
      <td><span class="status ${r.status}">${r.status.toUpperCase()}</span></td>
      <td>${r.observacao || ''}</td>
    </tr>`).join('\n')}
  </tbody>
</table>
<div class="footer">
  Gerado por Premium Shine Hub — ${agora}
</div>
</body></html>`
  }

  if (!authOk) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
      Carregando...
    </div>
  )

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4em', color: '#d0c0ff' }}>📋 Folha Controle</h1>
          <p style={{ margin: '4px 0 0', color: '#7070a0', fontSize: '0.85em' }}>
            Upload de etiquetas PDF → extrai códigos → controle de separação
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleImprimir}
            style={{ padding: '8px 16px', background: '#1e40af', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            🖨️ Imprimir Nota
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2a2a4a' }}>
        {([
          { key: 'upload', label: '📤 Upload', icon: '📤' },
          { key: 'controle', label: '✏️ Controle', icon: '✏️' },
          { key: 'historico', label: '📜 Histórico', icon: '📜' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.key ? '#1e1e3f' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #a78bfa' : '2px solid transparent',
              color: activeTab === tab.key ? '#a78bfa' : '#7070a0',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 400,
              borderRadius: '6px 6px 0 0',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Upload */}
      {activeTab === 'upload' && (
        <div style={{ maxWidth: 700 }}>
          {/* Upload area */}
          <div style={{
            background: '#0f0f22', border: '2px dashed #3a3a6a', borderRadius: 12,
            padding: 32, textAlign: 'center', marginBottom: 16,
          }}>
            <input
              type="file"
              accept=".pdf,.xml"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ display: 'block', margin: '0 auto 12px' }}
            />
            {uploadFile && (
              <div style={{ color: '#a78bfa', fontSize: 13, marginBottom: 12 }}>
                📄 {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              style={{
                padding: '10px 28px',
                background: uploadFile && !uploading ? '#a78bfa' : '#3a3a5a',
                border: 'none', borderRadius: 8,
                color: '#fff', cursor: uploadFile && !uploading ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 700,
              }}>
              {uploading ? '⏳ Processando...' : '🔍 Extrair Códigos'}
            </button>
            <p style={{ margin: '12px 0 0', color: '#5050a0', fontSize: 11 }}>
              Aceita PDF (etiquetas impressas do ML/Shopee) ou XML (NF-e)
            </p>
          </div>

          {/* Erro */}
          {parseError && (
            <div style={{ background: '#2a1010', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
              ⚠️ {parseError}
            </div>
          )}

          {/* Itens extraídos */}
          {itensExtraidos.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, color: '#a78bfa', fontSize: '1em' }}>
                  📦 {itensExtraidos.length} código(s) detectado(s)
                </h3>
                <button onClick={handleSalvarItens}
                  style={{ padding: '8px 20px', background: '#22c55e', border: 'none', borderRadius: 8, color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  ✅ Salvar no Controle
                </button>
              </div>
              <div style={{ background: '#0a0a18', borderRadius: 8, overflow: 'hidden', border: '1px solid #1a1a3a' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1a1a3a' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Código Rastreio</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>SKU</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Origem</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensExtraidos.map(item => (
                      <tr key={item.id} style={{ borderTop: '1px solid #1a1a3a' }}>
                        <td style={{ padding: '7px 12px', color: '#4ade80', fontFamily: 'monospace', fontWeight: 700 }}>
                          {item.codigo}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#d0c0ff' }}>
                          {item.sku || <span style={{ color: '#5050a0', fontStyle: 'italic' }}>não detectado</span>}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#7070a0', fontSize: 11 }}>
                          {item.arquivo_origem}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#f59e0b', fontWeight: 700 }}>
                          {item.quantidade}x
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Controle */}
      {activeTab === 'controle' && (
        <div>
          {loadingRegistros ? (
            <div style={{ textAlign: 'center', color: '#7070a0', padding: 40 }}>Carregando...</div>
          ) : registros.filter(r => r.status !== 'entregue').length === 0 ? (
            <div style={{ textAlign: 'center', color: '#5050a0', padding: 40, fontSize: 14 }}>
              Nenhum registro pendente.<br />Faça upload de um PDF para começar.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1a1a3a' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600, whiteSpace: 'nowrap' }}>Código</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>SKU</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Responsável</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Observação</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.filter(r => r.status !== 'entregue').map(reg => (
                    <tr key={reg.id} style={{ borderTop: '1px solid #1a1a3a', background: reg.status === 'separado' ? '#0f1f0f' : 'transparent' }}>
                      <td style={{ padding: '7px 10px', color: '#4ade80', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {reg.item.codigo}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#d0c0ff' }}>
                        {reg.item.sku || '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {editandoRegistro === reg.id ? (
                          <select value={editForm.responsavel}
                            onChange={e => setEditForm(f => ({ ...f, responsavel: e.target.value }))}
                            style={{ background: '#1a1a2e', border: '1px solid #6366f1', color: '#d0c0ff', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
                            <option value="">Selecione...</option>
                            {RESPONSAVEIS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: reg.responsavel ? '#fbbf24' : '#5050a0', fontStyle: reg.responsavel ? 'normal' : 'italic' }}>
                            {reg.responsavel || 'não definido'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {editandoRegistro === reg.id ? (
                          <select value={editForm.status}
                            onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Registro['status'] }))}
                            style={{ background: '#1a1a2e', border: '1px solid #6366f1', color: '#d0c0ff', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
                            <option value="pendente">Pendente</option>
                            <option value="separado">Separado</option>
                            <option value="entregue">Entregue</option>
                          </select>
                        ) : (
                          <span style={{
                            padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: reg.status === 'pendente' ? '#fff3cd' : reg.status === 'separado' ? '#d4edda' : '#cce5ff',
                            color: reg.status === 'pendente' ? '#856404' : reg.status === 'separado' ? '#155724' : '#004085',
                          }}>
                            {reg.status.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#7070a0', fontSize: 11, maxWidth: 200 }}>
                        {editandoRegistro === reg.id ? (
                          <input value={editForm.observacao}
                            onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))}
                            placeholder="Observação..."
                            style={{ background: '#1a1a2e', border: '1px solid #6366f1', color: '#d0c0ff', borderRadius: 4, padding: '2px 6px', fontSize: 11, width: 160 }}
                          />
                        ) : (
                          reg.observacao || '—'
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                        {editandoRegistro === reg.id ? (
                          <>
                            <button onClick={() => handleSalvarRegistro(reg)}
                              style={{ background: '#22c55e', border: 'none', borderRadius: 4, color: '#000', cursor: 'pointer', padding: '3px 8px', fontSize: 11, fontWeight: 700, marginRight: 4 }}>
                              ✓
                            </button>
                            <button onClick={() => setEditandoRegistro(null)}
                              style={{ background: '#374151', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => {
                              setEditandoRegistro(reg.id)
                              setEditForm({ responsavel: reg.responsavel, observacao: reg.observacao, status: reg.status })
                            }}
                              style={{ background: '#1e40af', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: 11, marginRight: 4 }}>
                              ✏️
                            </button>
                            <button onClick={() => handleExcluir(reg.id)}
                              style={{ background: '#dc2626', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>
                              🗑️
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Histórico */}
      {activeTab === 'historico' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ background: '#1a1a2e', borderRadius: 8, padding: '12px 16px', border: '1px solid #2a2a4a' }}>
              <div style={{ fontSize: 10, color: '#7070a0', marginBottom: 2 }}>TOTAL REGISTROS</div>
              <div style={{ fontSize: 20, color: '#d0c0ff', fontWeight: 700 }}>{registros.length}</div>
            </div>
            <div style={{ background: '#1a1a2e', borderRadius: 8, padding: '12px 16px', border: '1px solid #2a2a4a' }}>
              <div style={{ fontSize: 10, color: '#7070a0', marginBottom: 2 }}>ENTREGUES</div>
              <div style={{ fontSize: 20, color: '#22c55e', fontWeight: 700 }}>{registros.filter(r => r.status === 'entregue').length}</div>
            </div>
            <div style={{ background: '#1a1a2e', borderRadius: 8, padding: '12px 16px', border: '1px solid #2a2a4a' }}>
              <div style={{ fontSize: 10, color: '#7070a0', marginBottom: 2 }}>PENDENTES</div>
              <div style={{ fontSize: 20, color: '#f59e0b', fontWeight: 700 }}>{registros.filter(r => r.status === 'pendente').length}</div>
            </div>
          </div>

          {loadingRegistros ? (
            <div style={{ textAlign: 'center', color: '#7070a0', padding: 40 }}>Carregando...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1a1a3a' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Código</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>SKU</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Responsável</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Obs</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Data Upload</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7070a0', fontWeight: 600 }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.slice().reverse().map(reg => (
                    <tr key={reg.id} style={{ borderTop: '1px solid #1a1a3a' }}>
                      <td style={{ padding: '7px 10px', color: '#4ade80', fontFamily: 'monospace', fontSize: 11 }}>{reg.item.codigo}</td>
                      <td style={{ padding: '7px 10px', color: '#d0c0ff' }}>{reg.item.sku || '—'}</td>
                      <td style={{ padding: '7px 10px', color: reg.responsavel ? '#fbbf24' : '#5050a0' }}>{reg.responsavel || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                          background: reg.status === 'pendente' ? '#fff3cd' : reg.status === 'separado' ? '#d4edda' : '#cce5ff',
                          color: reg.status === 'pendente' ? '#856404' : reg.status === 'separado' ? '#155724' : '#004085',
                        }}>
                          {reg.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#7070a0', fontSize: 11, maxWidth: 150 }}>{reg.observacao || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#5050a0', fontSize: 11 }}>{new Date(reg.item.data_upload).toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <button onClick={() => handleExcluir(reg.id)}
                          style={{ background: '#dc2626', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#1e1e3f', border: '1px solid #6366f1',
          borderRadius: 8, padding: '10px 16px',
          color: '#d0c0ff', fontSize: 13,
          zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
