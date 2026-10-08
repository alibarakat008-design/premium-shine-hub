'use client'

/**
 * /admin/meus-custos
 *
 * Página do PARCEIRO pra cadastrar custos dos produtos DA EMPRESA DELE.
 * - Lista filtrada por company_id (multi-tenant — só vê produtos da própria empresa)
 * - Edição inline (clica → input → Enter salva)
 * - Busca por SKU ou nome
 * - Tabela paginada
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Produto = {
  sku: string
  nome: string
  categoria: string | null
  marca?: string | null
  preco_venda: number
  custo: number
  lucro_unit: number
  margem_pct: number
  has_price?: boolean
  updated_at: string
  // Custos de NFs (entrada de mercadoria)
  custo_medio?: number
  custo_ultima_nf?: number | null
  ultima_nf_numero?: string | null
  ultima_nf_data?: string | null
  variacao_pct?: number | null
  total_notas?: number
}

export default function MeusCustosPage() {
  const router = useRouter()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [company, setCompany] = useState<{ nome: string; cnpj: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterSemCusto, setFilterSemCusto] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ sucessos: number; erros: any[]; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/meus-custos?search=${encodeURIComponent(search)}&page=${page}${filterSemCusto ? '&filter=sem_custo' : ''}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login-parceiro')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setProdutos(data.produtos || [])
      setTotal(data.total || 0)
      setCompany(data.company || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, page, filterSemCusto, router])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (sku: string, custoAtual: number) => {
    setEditing(sku)
    setEditValue(custoAtual.toFixed(2))
    setSuccessMsg(null)
  }

  const cancelEdit = () => {
    setEditing(null)
    setEditValue('')
  }

  const saveEdit = async (sku: string) => {
    // Evita save duplicado
    if (saving === sku) return
    const novoCusto = Number(editValue.replace(',', '.'))
    if (isNaN(novoCusto) || novoCusto < 0) {
      setError('Custo inválido')
      return
    }
    setSaving(sku)
    try {
      const res = await fetch('/api/admin/meus-custos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, custo: novoCusto }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error)
      // Atualiza o item LOCALMENTE (sem recarregar a página toda)
      setProdutos(prev => prev.map(p =>
        p.sku === sku
          ? { ...p, custo: novoCusto, lucro_unit: p.preco_venda - novoCusto, margem_pct: p.preco_venda > 0 ? ((p.preco_venda - novoCusto) / p.preco_venda) * 100 : 0 }
          : p
      ))
      setSuccessMsg(`✅ ${sku} → R$ ${novoCusto.toFixed(2)}`)
      setEditing(null)
      setEditValue('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(null)
    }
  }

  const handleKey = (e: React.KeyboardEvent, sku: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit(sku)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    setImportResult(null)
    setError(null)
    setSuccessMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/meus-custos/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setImportResult({
        sucessos: data.sucessos || 0,
        erros: data.erros || [],
        total: data.total_lidos || 0,
      })
      await load()
    } catch (e: any) {
      setError(`Erro ao importar: ${e.message}`)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = () => {
    const csv = 'SKU,CUSTO\nMLB0000000001,10.50\nMLB0000000002,15.00\nMLB0000000003,8.75\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template-custos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const [exporting, setExporting] = useState(false)
  const exportarProdutos = async () => {
    if (!company || exporting) return
    setExporting(true)
    try {
      // Pega TODOS os produtos (não só os filtrados da página)
      const r = await fetch(`/api/admin/meus-custos?limit=200&offset=0${filterSemCusto ? '&filter=sem_custo' : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`, {
        credentials: 'include',
        headers: { Authorization: `Basic ${btoa('premium:shine2026')}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const produtos: any[] = data.produtos || []
      if (produtos.length === 0) {
        alert('Nenhum produto pra exportar')
        return
      }
      // Gera CSV
      const headers = ['SKU', 'Nome', 'Categoria', 'Marca', 'Preço Venda', 'Custo', 'Lucro Unit', 'Custo Médio (NF)', 'Última NF', 'Total NFs']
      const rows = produtos.map(p => [
        p.sku || '',
        (p.nome || '').replace(/"/g, '""'),
        p.categoria_nome || '',
        p.marca || '',
        p.preco_venda != null ? Number(p.preco_venda).toFixed(2) : '',
        p.custo != null ? Number(p.custo).toFixed(2) : '',
        (p.preco_venda != null && p.custo != null) ? (Number(p.preco_venda) - Number(p.custo)).toFixed(2) : '',
        p.custo_medio != null ? Number(p.custo_medio).toFixed(2) : '',
        p.ultima_nf_numero || '',
        p.total_notas != null ? Number(p.total_notas) : '',
      ])
      // Adiciona BOM pra Excel abrir certo
      const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `produtos-${company.nome?.replace(/\s+/g, '-') || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Erro ao exportar: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          💰 Meus Custos
        </h1>
        {company && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
            <b>{company.nome}</b> · CNPJ {company.cnpj} · <b>{total} produto(s)</b> cadastrados
          </p>
        )}
      </div>

      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="🔍 Buscar por SKU ou nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '10px 14px',
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 8,
              background: 'var(--psh-bg-primary)',
              color: 'var(--psh-text-primary)',
              fontSize: 13,
            }}
          />
          <button
            onClick={load}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-primary)',
              color: 'var(--psh-text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            🔄 Atualizar
          </button>
          <button
            onClick={() => { setFilterSemCusto(!filterSemCusto); setPage(1) }}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: `1.5px solid ${filterSemCusto ? '#ef4444' : 'var(--psh-border-primary)'}`,
              background: filterSemCusto ? '#fef2f2' : 'var(--psh-bg-primary)',
              color: filterSemCusto ? '#991b1b' : 'var(--psh-text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Mostrar apenas produtos sem custo cadastrado (NULL ou 0)"
          >
            {filterSemCusto ? '⚠️ Mostrando só sem custo' : '⏳ Sem custo'}
          </button>
          <button
            onClick={exportarProdutos}
            disabled={exporting}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-primary)',
              color: 'var(--psh-text-primary)',
              fontSize: 13,
              cursor: exporting ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
            title="Baixar planilha CSV com TODOS os produtos (filtrados) + custo atual, preço, lucro unit, custo médio, última NF"
          >
            {exporting ? '⏳ Exportando...' : '📥 Exportar produtos'}
          </button>
          <button
            onClick={downloadTemplate}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-primary)',
              color: 'var(--psh-text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Baixar modelo CSV com colunas SKU + CUSTO"
          >
            📄 Modelo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: importing ? 'var(--psh-text-secondary, #9ca3af)' : '#10b981',
              color: 'var(--psh-bg-primary, white)',
              fontSize: 13,
              cursor: importing ? 'wait' : 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {importing ? '⏳ Importando...' : '📥 Importar Excel/CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
            }}
          />
        </div>
      </div>

      {importResult && (
        <div style={{
          padding: 14, borderRadius: 8,
          background: importResult.erros.length === 0 ? '#d1fae5' : '#fef3c7',
          border: `1px solid ${importResult.erros.length === 0 ? '#10b981' : '#f59e0b'}`,
          color: importResult.erros.length === 0 ? '#065f46' : '#92400e',
          marginBottom: 12, fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ✅ Importação concluída — {importResult.sucessos} sucesso(s) de {importResult.total} linha(s)
          </div>
          {importResult.erros.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                ⚠️ {importResult.erros.length} erro(s) — clique pra ver
              </summary>
              <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                {importResult.erros.slice(0, 50).map((e: any, i: number) => (
                  <div key={i}>
                    Linha {e.linha}: <b>{e.sku}</b> — {e.motivo}
                  </div>
                ))}
                {importResult.erros.length > 50 && <div>... +{importResult.erros.length - 50} mais</div>}
              </div>
            </details>
          )}
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: 10, borderRadius: 8,
          background: '#d1fae5', color: '#065f46',
          marginBottom: 12, fontSize: 13,
        }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{
          padding: 10, borderRadius: 8,
          background: '#fee2e2', color: '#991b1b',
          marginBottom: 12, fontSize: 13,
        }}>
          ❌ {error}
        </div>
      )}

      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
            ⏳ Carregando...
          </div>
        ) : produtos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--psh-text-primary)' }}>
              {filterSemCusto ? 'Nenhum produto sem custo no momento.' : 'Você ainda não tem produtos importados.'}
            </p>
            <p style={{ fontSize: 12, marginTop: 8, color: 'var(--psh-text-muted)', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
              {filterSemCusto
                ? 'Todos os seus produtos já têm custo cadastrado. 🎉'
                : 'Importe vendas do Mercado Livre ou sincronize sua conta ML — os produtos das suas vendas aparecem aqui automaticamente pra você cadastrar os custos.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-primary)', color: 'var(--psh-text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>SKU</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Produto</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Marca</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Categoria</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Preço Venda</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Custo</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, color: 'var(--psh-text-tertiary)' }} title="Custo médio ponderado de todas as NFs de compra">Custo Médio</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11, color: 'var(--psh-text-tertiary)' }} title="Custo da última NF + variação %">Última NF</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Lucro</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Margem</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.sku} style={{ borderTop: '1px solid var(--psh-border-secondary)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--psh-text-secondary)' }}>
                    {p.sku}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--psh-text-primary)' }}>
                    {p.nome}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--psh-text-secondary)', fontSize: 12 }}>
                    {p.marca || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--psh-text-secondary)', fontSize: 12 }}>
                    {p.categoria || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    R$ {p.preco_venda.toFixed(2)}
                  </td>
                  <td
                    onClick={() => editing !== p.sku && startEdit(p.sku, p.custo)}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      cursor: editing === p.sku ? 'default' : 'pointer',
                      background: editing === p.sku ? '#fef3c7' : 'transparent',
                    }}
                    title="Clica pra editar"
                  >
                    {editing === p.sku ? (
                      <span
                        // Para que cliques no input/botão NÃO borrem e cancelem
                        onMouseDown={(e) => e.preventDefault()}
                        style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
                      >
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKey(e, p.sku)}
                          autoFocus
                          style={{
                            width: '90px',
                            padding: '4px 6px',
                            border: '1px solid #f59e0b',
                            borderRadius: 4,
                            fontSize: 13,
                            textAlign: 'right',
                            fontFamily: 'monospace',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(p.sku)}
                          disabled={saving === p.sku}
                          title="Salvar (Enter)"
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            background: saving === p.sku ? '#9ca3af' : '#10b981',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: saving === p.sku ? 'wait' : 'pointer',
                            lineHeight: 1,
                          }}
                        >
                          {saving === p.sku ? '⏳' : '✓'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          title="Cancelar (Esc)"
                          style={{
                            padding: '4px 8px',
                            border: '1px solid var(--psh-border-primary)',
                            background: 'transparent',
                            color: 'var(--psh-text-secondary)',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span style={{ color: p.custo > 0 ? 'inherit' : 'var(--psh-text-secondary, #9ca3af)' }}>
                        {p.custo > 0 ? `R$ ${p.custo.toFixed(2)}` : 'R$ 0,00 (clique p/ definir)'}
                      </span>
                    )}
                    {saving === p.sku && <span style={{ marginLeft: 6, fontSize: 11 }}>⏳</span>}
                  </td>
                  {/* Custo Médio (NFs) */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--psh-text-tertiary)', fontSize: 12 }} title={p.total_notas ? `Baseado em ${p.total_notas} nota(s) de compra` : 'Sem notas de compra'}>
                    {p.custo_medio && p.custo_medio > 0 ? (
                      <>
                        R$ {p.custo_medio.toFixed(2)}
                        {p.total_notas ? <span style={{ color: 'var(--psh-text-muted)', fontSize: 10, marginLeft: 4 }}>({p.total_notas}NF)</span> : null}
                      </>
                    ) : <span style={{ color: 'var(--psh-text-muted)' }}>—</span>}
                  </td>
                  {/* Última NF + Variação */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12 }} title={p.ultima_nf_data ? `NF ${p.ultima_nf_numero} em ${new Date(p.ultima_nf_data).toLocaleDateString('pt-BR')}` : ''}>
                    {p.custo_ultima_nf != null ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--psh-text-primary)' }}>
                          R$ {p.custo_ultima_nf.toFixed(2)}
                        </span>
                        {p.variacao_pct != null ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            background: p.variacao_pct > 0 ? '#fee2e2' : p.variacao_pct < 0 ? '#d1fae5' : 'var(--psh-bg-tertiary)',
                            color: p.variacao_pct > 0 ? '#991b1b' : p.variacao_pct < 0 ? '#065f46' : 'var(--psh-text-tertiary)',
                          }}>
                            {p.variacao_pct > 0 ? '↑' : p.variacao_pct < 0 ? '↓' : '='} {Math.abs(p.variacao_pct).toFixed(1)}%
                          </span>
                        ) : null}
                      </div>
                    ) : <span style={{ color: 'var(--psh-text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: p.lucro_unit > 0 ? '#10b981' : '#ef4444' }}>
                    R$ {p.lucro_unit.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: p.margem_pct > 30 ? '#10b981' : p.margem_pct > 15 ? '#f59e0b' : '#ef4444' }}>
                    {p.margem_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16 }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-secondary)',
              color: 'var(--psh-text-primary)',
              fontSize: 12,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
            }}
          >
            « Anterior
          </button>
          <span style={{ padding: '8px 14px', color: 'var(--psh-text-secondary)', fontSize: 12 }}>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-secondary)',
              color: 'var(--psh-text-primary)',
              fontSize: 12,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.5 : 1,
            }}
          >
            Próxima »
          </button>
        </div>
      )}
    </div>
  )
}