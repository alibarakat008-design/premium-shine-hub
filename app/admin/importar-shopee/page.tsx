'use client'

import { useState, useRef } from 'react'
import { apiFetch } from '@/lib/api-fetch'

interface Resultado {
  ok: boolean
  mensagem?: string
  total_linhas_raw?: number
  linhas_reconhecidas?: number
  pedidos_unicos?: number
  criados?: number
  atualizados?: number
  erros?: number
  erro_amostra?: string[]
  clientes_criados?: number
  campos_reconhecidos?: string[]
  campos_faltando?: string[]
  amostra_3_linhas?: any[]
  dry_run?: boolean
  error?: string
}

export default function ImportarShopeePage() {
  const [file, setFile] = useState<File | null>(null)
  const [companyId, setCompanyId] = useState('e2633570-74da-4b14-9ca1-ba7b0670e612')
  const [dryRun, setDryRun] = useState(true)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File | null) => {
    setFile(f)
    setResultado(null)
  }

  const importar = async () => {
    if (!file) {
      alert('Selecione um arquivo primeiro')
      return
    }
    setImporting(true)
    setResultado(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('company_id', companyId)
      formData.append('dry_run', String(dryRun))
      const r = await apiFetch('/api/admin/import-shopee-csv', {
        method: 'POST',
        body: formData,
      })
      const data = await r.json()
      setResultado(data)
      if (data.ok && !data.dry_run) {
        // Se importou de verdade, recarrega depois de 2s
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch (e: any) {
      setResultado({ ok: false, error: e.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
        📥 Importar Vendas Shopee (CSV/XLSX)
      </h1>
      <p style={{ margin: '8px 0 24px', fontSize: 14, color: 'var(--psh-text-secondary)' }}>
        Faça download da planilha de vendas no <b>Shopee Seller Center → Pedidos → Exportar</b>,
        e suba aqui. Os dados vão para o painel vendas-ao-vivo com a tag <b>"Shopee"</b>.
      </p>

      {/* Passo a passo */}
      <div style={{
        background: 'var(--psh-bg-secondary, #f9fafb)',
        border: '1px solid var(--psh-border-primary, #e5e7eb)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
        fontSize: 13,
      }}>
        <b>📋 Como pegar a planilha do Shopee:</b>
        <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
          <li>Acesse <a href="https://seller.shopee.com.br" target="_blank" rel="noreferrer" style={{ color: '#ee4d2d' }}>seller.shopee.com.br</a></li>
          <li>Menu lateral → <b>Pedidos → Meus Pedidos</b></li>
          <li>Ou <b>Finanças → Minha Renda → Pedidos Completos</b></li>
          <li>Selecione o período (ex: últimos 30 dias)</li>
          <li>Clique em <b>Exportar</b> → escolha CSV ou XLSX</li>
          <li>Volte aqui e faça upload do arquivo</li>
        </ol>
      </div>

      {/* Formulário */}
      <div style={{
        background: 'var(--psh-bg-primary, white)',
        border: '1px solid var(--psh-border-primary, #e5e7eb)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Empresa (company_id)
          </label>
          <input
            type="text"
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--psh-border-primary, #d1d5db)',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--psh-text-tertiary, #6b7280)', marginTop: 4 }}>
            Default: LIURAESSENCE. Use outro UUID pra outros parceiros.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Arquivo (CSV ou XLSX)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={e => handleFile(e.target.files?.[0] || null)}
            style={{ fontSize: 13 }}
          />
          {file && (
            <p style={{ fontSize: 12, color: 'var(--psh-text-secondary, #6b7280)', marginTop: 4 }}>
              📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
            />
            <span>
              🔍 <b>Modo teste (dry-run)</b> — só mostra o que vai fazer, <b>NÃO</b> grava nada no banco
            </span>
          </label>
        </div>

        <button
          onClick={importar}
          disabled={!file || importing}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: importing ? '#9ca3af' : '#ee4d2d',
            color: 'white',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: importing ? 'wait' : 'pointer',
            width: '100%',
          }}
        >
          {importing ? '⏳ Processando...' : dryRun ? '🔍 Testar (sem gravar)' : '✅ Importar agora'}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <div style={{
          background: resultado.ok ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${resultado.ok ? '#10b981' : '#ef4444'}`,
          borderRadius: 8,
          padding: 20,
        }}>
          {resultado.error ? (
            <>
              <h2 style={{ margin: 0, color: '#dc2626' }}>❌ Erro</h2>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{resultado.error}</pre>
            </>
          ) : resultado.dry_run ? (
            <>
              <h2 style={{ margin: 0, color: '#0891b2' }}>🔍 Modo teste — nada foi gravado</h2>
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <p>📊 <b>{resultado.total_linhas_raw}</b> linhas no total, <b>{resultado.linhas_reconhecidas}</b> reconhecidas, <b>{resultado.pedidos_unicos}</b> pedidos únicos</p>
                <p>✅ <b>Campos reconhecidos:</b> {resultado.campos_reconhecidos?.join(', ') || 'nenhum'}</p>
                {resultado.campos_faltando && resultado.campos_faltando.length > 0 && (
                  <p style={{ color: '#dc2626' }}>⚠️ <b>Campos faltando:</b> {resultado.campos_faltando.join(', ')}</p>
                )}
                {resultado.amostra_3_linhas && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver 3 linhas de amostra (mapeadas)</summary>
                    <pre style={{ background: 'white', padding: 12, borderRadius: 6, marginTop: 8, fontSize: 11, overflow: 'auto' }}>
                      {JSON.stringify(resultado.amostra_3_linhas, null, 2)}
                    </pre>
                  </details>
                )}
                {resultado.campos_faltando && resultado.campos_faltando.length === 0 && (
                  <button
                    onClick={() => { setDryRun(false); setTimeout(importar, 100) }}
                    style={{
                      marginTop: 12, padding: '8px 16px', border: 'none', background: '#10b981', color: 'white', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    ✅ Tá tudo certo — Importar agora
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0, color: '#059669' }}>✅ Importação concluída</h2>
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <p>📊 Linhas: {resultado.total_linhas_raw} → Reconhecidas: {resultado.linhas_reconhecidas} → Pedidos únicos: {resultado.pedidos_unicos}</p>
                <p>✅ <b style={{ color: '#059669' }}>{resultado.criados}</b> criados · <b style={{ color: '#0891b2' }}>{resultado.atualizados}</b> atualizados</p>
                <p>👥 <b>{resultado.clientes_criados}</b> clientes novos</p>
                {resultado.erros && resultado.erros > 0 && (
                  <>
                    <p style={{ color: '#dc2626' }}>❌ <b>{resultado.erros}</b> erros</p>
                    <details>
                      <summary style={{ cursor: 'pointer' }}>Ver amostra de erros</summary>
                      <pre style={{ background: 'white', padding: 12, borderRadius: 6, marginTop: 8, fontSize: 11 }}>
                        {resultado.erro_amostra?.join('\n')}
                      </pre>
                    </details>
                  </>
                )}
                <p style={{ marginTop: 16, fontSize: 12, color: 'var(--psh-text-tertiary, #6b7280)' }}>
                  💡 Indo pro painel vendas-ao-vivo em 2s...
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Ajuda / Campos */}
      <details style={{ marginTop: 24, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📖 Campos reconhecidos (clique pra ver)</summary>
        <div style={{ background: 'var(--psh-bg-secondary, #f9fafb)', padding: 16, borderRadius: 8, marginTop: 8 }}>
          <p>O sistema tenta reconhecer várias variações de nomes de colunas (PT/EN):</p>
          <ul style={{ fontSize: 12, lineHeight: 1.8 }}>
            <li><b>ID do Pedido</b> → order_number</li>
            <li><b>Status</b> → status (mapeado: A Enviar/Pago = confirmado, Cancelado = cancelado, etc)</li>
            <li><b>Data do Pedido / Data de Criação</b> → data_pedido</li>
            <li><b>Nome do Comprador / Username</b> → cliente_nome</li>
            <li><b>Telefone / Celular</b> → cliente_telefone</li>
            <li><b>CPF / CNPJ</b> → cliente_cpf</li>
            <li><b>Endereço de Entrega</b> → endereco_completo</li>
            <li><b>Nome do Produto</b> → produto_nome</li>
            <li><b>SKU / Referência</b> → produto_sku</li>
            <li><b>Quantidade / Qtd</b> → quantidade</li>
            <li><b>Preço Unitário</b> → preco_unitario</li>
            <li><b>Total do Pedido</b> → total</li>
            <li><b>Frete</b> → frete_valor</li>
            <li><b>Código de Rastreio / Tracking</b> → codigo_rastreio</li>
            <li><b>Transportadora / Carrier</b> → transportadora</li>
          </ul>
          <p style={{ fontSize: 12, color: 'var(--psh-text-tertiary, #6b7280)' }}>
            Se a planilha tem colunas com nomes diferentes, abre o <code>modo teste</code> primeiro
            pra ver o que ele reconheceu. Se faltar campo, renomeia a coluna na planilha e reimporta.
          </p>
        </div>
      </details>
    </div>
  )
}
