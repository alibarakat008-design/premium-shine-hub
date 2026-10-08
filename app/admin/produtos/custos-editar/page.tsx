'use client'

/**
 * Edição inline de custos (clica célula → edita → Enter salva).
 *
 * Layout estilo planilha Metrify: header sticky, linha zebra, hover destaca,
 * coluna custo é input que salva com Enter ou blur.
 *
 * Sem planilha — edite direto aqui, sem exportar/importar CSV.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-fetch'

type Item = {
  sku: string
  nome: string
  marca: string
  custo: number
  preco_venda: number
  has_price: boolean
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ProdutosCustosEditarPage() {
  const [abaOrigem] = useState(true) // marker
  const [canal, setCanal] = useState('mercado_livre')
  const [missing, setMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edição inline
  const [editingSku, setEditingSku] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [savingSku, setSavingSku] = useState<string | null>(null)
  const [savedSku, setSavedSku] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        canal,
        missing: missing ? '1' : '0',
        search,
        page: String(page),
        pageSize: String(pageSize),
      })
      const r = await apiFetch(`/api/admin/products/list-paginated?${params}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setItems(j.items)
      setTotal(j.total)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [canal, missing, search, page])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Reset página quando filtro muda
  useEffect(() => {
    setPage(1)
  }, [canal, missing, search])

  // Auto-focus input quando entra em modo edição
  useEffect(() => {
    if (editingSku && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingSku])

  const iniciarEdicao = (item: Item) => {
    setEditingSku(item.sku)
    setEditingValue(item.custo > 0 ? item.custo.toFixed(2) : '')
  }

  const cancelarEdicao = () => {
    setEditingSku(null)
    setEditingValue('')
  }

  const salvar = async (sku: string) => {
    const custo = Number(editingValue.replace(',', '.'))
    if (isNaN(custo) || custo < 0) {
      setError('Custo inválido')
      return
    }
    try {
      setSavingSku(sku)
      setError(null)
      const r = await apiFetch(
        `/api/admin/update-sku-custo?sku=${encodeURIComponent(sku)}&custo=${custo}&canal=${canal}`
      )
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Falha ao salvar')
      // Atualiza o item na lista local
      setItems((prev) =>
        prev.map((it) => (it.sku === sku ? { ...it, custo, has_price: true } : it))
      )
      setSavedSku(sku)
      setEditingSku(null)
      setTimeout(() => setSavedSku(null), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingSku(null)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const semCusto = useMemo(() => items.filter((i) => i.custo <= 0).length, [items])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginBottom: 4 }}>
            <Link href="/admin/produtos" style={{ color: 'var(--psh-text-secondary, #6b7280)', textDecoration: 'none' }}>Produtos</Link>
            <span>/</span>
            <Link href="/admin/produtos/custos" style={{ color: 'var(--psh-text-secondary, #6b7280)', textDecoration: 'none' }}>Custos</Link>
            <span>/</span>
            <span style={{ color: 'var(--psh-text-primary, #111827)' }}>Editar Online</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--psh-text-primary, #111827)', margin: 0 }}>📝 Editar Custos Online</h1>
          <p style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 13, margin: '4px 0 0 0' }}>
            Clique na célula do custo, edite, e pressione <kbd>Enter</kbd> pra salvar. <kbd>Esc</kbd> cancela.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/admin/produtos/custos"
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            📋 Via Planilha
          </Link>
          <Link
            href="/admin/produtos"
            style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'var(--psh-bg-primary, white)', color: 'var(--psh-text-primary, #374151)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            ← Voltar
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filtros */}
      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--psh-text-primary, #374151)', fontWeight: 600 }}>Canal:</span>
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 500 }}
        >
          <option value="mercado_livre">Mercado Livre</option>
          <option value="shopee">Shopee</option>
          <option value="site_b2c">Site B2C</option>
          <option value="b2b">B2B</option>
          <option value="whatsapp">WhatsApp</option>
        </select>

        <input
          type="text"
          placeholder="🔍 Buscar SKU ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            minWidth: 240,
          }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--psh-text-primary, #374151)', cursor: 'pointer' }}>
          <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />
          Só sem custo
        </label>

        <button
          onClick={carregar}
          disabled={loading}
          style={{
            padding: '6px 14px',
            background: 'var(--psh-text-primary, #111827)',
            color: 'var(--psh-bg-primary, white)',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
            marginLeft: 'auto',
          }}
        >
          {loading ? '⏳' : '🔄'} Atualizar
        </button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)' }}>
        <span>
          <strong style={{ color: 'var(--psh-text-primary, #111827)' }}>{total}</strong> produtos
        </span>
        {semCusto > 0 && (
          <span style={{ color: '#991b1b' }}>
            ⚠️ <strong>{semCusto}</strong> sem custo nesta página
          </span>
        )}
        <span>
          Página <strong>{page}</strong> de <strong>{totalPaginas}</strong>
        </span>
      </div>

      {/* Tabela */}
      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--psh-bg-secondary, #f9fafb)', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--psh-text-primary, #374151)', width: 220 }}>SKU</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--psh-text-primary, #374151)' }}>Nome</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--psh-text-primary, #374151)', width: 140 }}>Marca</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--psh-text-primary, #374151)', width: 140 }}>
                Custo
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--psh-text-primary, #374151)', width: 120 }}>
                Preço venda
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--psh-text-primary, #374151)', width: 110 }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary, #9ca3af)' }}>
                  {loading ? '⏳ Carregando...' : 'Nenhum produto encontrado com esses filtros.'}
                </td>
              </tr>
            ) : (
              items.map((it, i) => {
                const isEditing = editingSku === it.sku
                const isSaving = savingSku === it.sku
                const justSaved = savedSku === it.sku
                const semC = it.custo <= 0
                return (
                  <tr
                    key={it.sku}
                    style={{
                      background: i % 2 === 0 ? 'white' : 'var(--psh-bg-secondary, #fafbfc)',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onDoubleClick={() => !isEditing && iniciarEdicao(it)}
                  >
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--psh-text-secondary, #6b7280)',
                      }}
                    >
                      {it.sku}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--psh-text-primary, #111827)' }}>{it.nome}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12 }}>{it.marca}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => salvar(it.sku)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvar(it.sku)
                            if (e.key === 'Escape') cancelarEdicao()
                          }}
                          disabled={isSaving}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            border: '2px solid #3b82f6',
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--psh-text-primary, #111827)',
                            textAlign: 'right',
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => iniciarEdicao(it)}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            border: semC ? '1px dashed #fca5a5' : '1px solid transparent',
                            background: semC ? '#fef2f2' : 'transparent',
                            borderRadius: 4,
                            fontSize: 14,
                            fontWeight: 600,
                            color: semC ? '#991b1b' : 'var(--psh-text-primary, #111827)',
                            cursor: 'pointer',
                            textAlign: 'right',
                          }}
                          title="Clique para editar"
                        >
                          {semC ? '— sem custo' : fmtBRL(it.custo)}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--psh-text-secondary, #6b7280)' }}>
                      {it.preco_venda > 0 ? fmtBRL(it.preco_venda) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {isSaving ? (
                        <span style={{ color: '#1e40af', fontSize: 12 }}>⏳ salvando</span>
                      ) : justSaved ? (
                        <span style={{ color: '#15803d', fontSize: 12, fontWeight: 600 }}>✅ salvo</span>
                      ) : semC ? (
                        <span style={{ color: '#991b1b', fontSize: 12 }}>⚠️ falta</span>
                      ) : (
                        <span style={{ color: 'var(--psh-text-secondary, #6b7280)', fontSize: 12 }}>✓ ok</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            style={pgnBtn(page === 1)}
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={pgnBtn(page === 1)}
          >
            ‹ Anterior
          </button>
          <span style={{ padding: '6px 14px', fontSize: 13, color: 'var(--psh-text-primary, #374151)' }}>
            {page} / {totalPaginas}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
            disabled={page === totalPaginas}
            style={pgnBtn(page === totalPaginas)}
          >
            Próxima ›
          </button>
          <button
            onClick={() => setPage(totalPaginas)}
            disabled={page === totalPaginas}
            style={pgnBtn(page === totalPaginas)}
          >
            »
          </button>
        </div>
      )}

      {/* Dicas */}
      <div style={{ marginTop: 24, padding: 14, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
        <strong>💡 Dicas</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Clique (ou duplo-clique na linha) na célula <strong>Custo</strong> pra editar</li>
          <li><kbd>Enter</kbd> salva • <kbd>Esc</kbd> cancela • clicar fora também salva</li>
          <li>Use a busca pra encontrar SKUs rapidamente (ex: <code>ASAD</code>)</li>
          <li>Marque "Só sem custo" pra ver só o que precisa preencher</li>
          <li>O custo é salvo em <code>product_prices.custo</code> e propagado pros items (CMV atualizado)</li>
        </ul>
      </div>
    </div>
  )
}

const pgnBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  background: disabled ? 'var(--psh-bg-secondary, #f3f4f6)' : 'white',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  color: disabled ? 'var(--psh-text-secondary, #9ca3af)' : 'var(--psh-text-primary, #374151)',
  cursor: disabled ? 'not-allowed' : 'pointer',
})