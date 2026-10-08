'use client'

/**
 * ABA DE CUSTOS DENTRO DE PRODUTOS
 *
 * 2 abas:
 * - Exportar: baixa planilha com titulo, sku, custo
 * - Importar: faz upload da planilha preenchida e atualiza custos
 *
 * Canal: mercado_livre
 * (o envio_full do ML é flag do listing, não canal separado — custo de envio igual)
 */

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type ImportResult = {
  total_linhas: number
  atualizados: number
  criados: number
  nao_encontrados: number
  erros: number
  // API antiga retornava `results: [{sku, status, custo?, erro?}]`
  // API nova retorna `nao_encontrados_amostra: [sku1, sku2, ...]` + `skus_unicos`, `duracao_ms`
  results?: { sku: string; status: string; custo?: number; erro?: string }[]
  nao_encontrados_amostra?: string[]
  skus_unicos?: number
  duracao_ms?: number
  canal?: string
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ProdutosCustosPage() {
  const [aba, setAba] = useState<'exportar' | 'importar'>('exportar')
  const [canal, setCanal] = useState('mercado_livre')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [previewCsv, setPreviewCsv] = useState<string>('')
  const [totalProdutos, setTotalProdutos] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carrega preview do CSV (5 primeiras linhas)
  useEffect(() => {
    const carregarPreview = async () => {
      try {
        setLoading(true)
        const r = await apiFetch(`/api/admin/products/export-costs?canal=${canal}&missing=${onlyMissing}&format=json`, {
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error)
        setTotalProdutos(j.total || 0)
        // Gera CSV das 5 primeiras linhas
        const linhas = ['titulo,sku,custo']
        for (const p of j.data.slice(0, 5)) {
          const tit = String(p.titulo || '').replace(/"/g, '""')
          const sku = String(p.sku || '').replace(/"/g, '""')
          linhas.push(`"${tit}","${sku}",${Number(p.custo || 0).toFixed(2)}`)
        }
        setPreviewCsv(linhas.join('\n'))
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    carregarPreview()
  }, [canal, onlyMissing])


  const baixarPlanilha = async () => {
    try {
      setLoading(true)
      const r = await apiFetch(`/api/admin/products/export-costs?canal=${canal}&missing=${onlyMissing}`, {
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `custos-produtos-${canal}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const importarArquivo = async (file: File) => {
    try {
      setLoading(true)
      setError(null)
      setResult(null)
      const text = await file.text()
      const r = await apiFetch(`/api/admin/products/import-costs?canal=${canal}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
        },
        body: text,
      })
      // Lê como texto primeiro pra não quebrar se o servidor retornar HTML/erro cru
      const raw = await r.text()
      let j: any = null
      try {
        j = JSON.parse(raw)
      } catch {
        throw new Error(
          `Resposta não-JSON do servidor (HTTP ${r.status}). ` +
          `Primeiros 200 caracteres: ${raw.slice(0, 200)}`
        )
      }
      if (!j.ok) throw new Error(j.error || `Erro ${r.status}`)
      setResult(j)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importarArquivo(file)
  }
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 4 }}>
            <Link href="/admin/produtos" style={{ color: 'var(--psh-text-secondary, #6b7280)', textDecoration: 'none' }}>Produtos</Link>
            <span>/</span>
            <span style={{ color: 'var(--psh-text-primary, #111827)' }}>Custos</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>💰 Custos de Produtos</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>Exporte a planilha, preencha os custos e faça upload pra atualizar em massa</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/admin/produtos/custos-editar" style={{ padding: '8px 14px', background: 'var(--psh-text-primary, #111827)', color: 'var(--psh-bg-primary, white)', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>📝 Editar Online (sem planilha)</Link>
          <Link href="/admin/produtos" style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← Voltar aos Produtos</Link>
        </div>
        </div>
      {error && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>⚠️ {error}</div>}
      {/* Canal */}
      <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--psh-text-primary, #374151)', fontWeight: 600 }}>Canal:</span>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
          <option value="mercado_livre">Mercado Livre</option>
          <option value="shopee">Shopee</option>
          <option value="site_b2c">Site B2C</option>
          <option value="b2b">B2B</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginLeft: 'auto' }}>{totalProdutos} produtos ativos</span>
      </div>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {[
          { id: 'exportar', label: '📥 Exportar Custos' },
          { id: 'importar', label: '📤 Importar Custos' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: aba === t.id ? 'var(--psh-text-primary, #111827)' : 'transparent',
              color: aba === t.id ? 'white' : 'var(--psh-text-primary, #374151)',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              borderBottom: aba === t.id ? '2px solid #111827' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Conteúdo */}
      {aba === 'exportar' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Lado esquerdo: como funciona */}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📋 Como funciona</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--psh-text-primary, #374151)' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: '#3b82f6', color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>1</div>
                <div>
                  <strong>Baixe a planilha</strong> clicando no botão abaixo.
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>A planilha tem 3 colunas: <code>titulo</code>, <code>sku</code>, <code>custo</code></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: '#3b82f6', color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>2</div>
                <div>
                  <strong>Abra no Excel/Google Sheets</strong> e preencha a coluna <code>custo</code>.
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Não altere as colunas <code>titulo</code> e <code>sku</code> — elas identificam o produto.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: '#3b82f6', color: 'var(--psh-bg-primary, white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>3</div>
                <div>
                  <strong>Salve como CSV</strong> e faça upload na aba <em>Importar</em>.
                  <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>Os custos são identificados pelo SKU e atualizados no app.</div>
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 20, paddingTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--psh-text-primary, #374151)', cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Só produtos SEM custo (recomendado na 1ª vez)
              </label>
              <button
                onClick={baixarPlanilha}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#10b981',
                  color: 'var(--psh-bg-primary, white)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '⏳ Baixando...' : `📥 Baixar planilha (${onlyMissing ? 'só sem custo' : 'todos'})`}
              </button>
            </div>
          </div>
          {/* Lado direito: preview */}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 8px 0' }}>👀 Preview (5 primeiras linhas)</h2>
            <p style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', margin: '0 0 12px 0' }}>É assim que a planilha vai vir</p>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 220, fontFamily: 'monospace' }}>
{previewCsv || 'Carregando...'}
            </pre>
            <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>💡 Dica</div>
              <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>
                A planilha inclui o cabeçalho na 1ª linha. Use vírgula como separador (formato CSV padrão).
                Se tiver problemas com acentos, salve como <code>CSV UTF-8</code>.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Lado esquerdo: upload */}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📤 Enviar planilha preenchida</h2>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: 8,
                padding: 40,
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--psh-bg-secondary, #fafbfc)',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--psh-text-primary, #374151)', marginBottom: 4 }}>Clique aqui ou arraste o arquivo</div>
              <div style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>CSV com 3 colunas: titulo, sku, custo</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
            </div>
            {loading && (
              <div style={{ padding: 12, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 6, textAlign: 'center', fontSize: 13, color: '#1e40af' }}>
                ⏳ Processando planilha...
              </div>
            )}
          </div>
          {/* Lado direito: resultado */}
          <div style={{ background: 'var(--psh-bg-primary, white)', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: '0 0 12px 0' }}>📊 Resultado da importação</h2>
            {!result ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)', fontSize: 13 }}>
                Aguardando envio da planilha...
              </div>
            ) : (
              <div>
                {(result.skus_unicos != null || result.duracao_ms != null) && (
                  <div style={{ fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 8 }}>
                    {result.skus_unicos != null && <span>SKUs únicos: <strong>{result.skus_unicos}</strong> · </span>}
                    {result.duracao_ms != null && <span>Processado em <strong>{(result.duracao_ms / 1000).toFixed(2)}s</strong></span>}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                  <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>✅ Atualizados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{result.atualizados}</div>
                  </div>
                  <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>➕ Criados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1e40af' }}>{result.criados}</div>
                  </div>
                  <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>❌ Não encontrados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#991b1b' }}>{result.nao_encontrados}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--psh-bg-secondary, #f9fafb)', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--psh-text-primary, #374151)', fontWeight: 600 }}>📋 Total linhas</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--psh-text-primary, #111827)' }}>{result.total_linhas}</div>
                  </div>
                </div>
                {/* Lista de resultados (primeiros 50) — compatível com API antiga e nova */}
                {(result.results && result.results.length > 0) ? (
                  <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    {result.results.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          borderBottom: '1px solid #f3f4f6',
                          fontSize: 12,
                          background: r.status === 'atualizado' ? '#f0fdf4' : r.status === 'criado' ? '#eff6ff' : r.status === 'nao_encontrado' ? '#fef2f2' : '#fefce8',
                        }}
                      >
                        {r.status === 'atualizado' && <span style={{ color: '#15803d' }}>✅</span>}
                        {r.status === 'criado' && <span style={{ color: '#1e40af' }}>➕</span>}
                        {r.status === 'nao_encontrado' && <span style={{ color: '#991b1b' }}>❌</span>}
                        {r.status === 'erro' && <span style={{ color: '#92400e' }}>⚠️</span>}
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', minWidth: 120 }}>{r.sku}</span>
                        {r.custo != null && <span style={{ color: 'var(--psh-text-primary, #111827)', fontWeight: 600 }}>{fmtBRL(r.custo)}</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--psh-text-secondary, #6b7280)', textTransform: 'capitalize' }}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : result.nao_encontrados_amostra && result.nao_encontrados_amostra.length > 0 ? (
                  <div style={{ marginTop: 8, padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                      ❌ SKUs não encontrados no banco (mostrando {result.nao_encontrados_amostra.length} de {result.nao_encontrados}):
                    </div>
                    <div style={{ fontFamily: 'monospace', color: '#7f1d1d', fontSize: 11, lineHeight: 1.6 }}>
                      {result.nao_encontrados_amostra.map((sku, i) => (
                        <span key={i} style={{ display: 'inline-block', marginRight: 8 }}>• {sku}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.atualizados > 0 && (
                  <div style={{ marginTop: 16, padding: 10, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, color: '#14532d' }}>
                    ✨ <strong>{result.atualizados} produtos atualizados!</strong> Os custos já estão sendo usados nos cálculos de DRE, Mix de Canais e Vendas ao Vivo.
                    <div style={{ marginTop: 6 }}>
                      <Link href="/admin/financeiro/dre-mensal" style={{ color: '#15803d', fontWeight: 600 }}>📊 Ver DRE atualizado</Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
