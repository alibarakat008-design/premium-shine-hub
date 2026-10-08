'use client'

import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

export default function ImportarCSVPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (status === 'unauthenticated') {
    router.push('/login')
    return null
  }

  async function downloadTemplate() {
    const res = await fetch('/api/products/import-csv?template=true')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'produtos-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function upload() {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const text = await file.text()
      const res = await apiFetch('/api/products/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })
      const json = await res.json()
      setResult(json)
    } catch (err: any) {
      setResult({ success: false, error: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 8 }}>📥 Importar Produtos via CSV</h1>
        <p style={{ color: '#7070a0', marginBottom: 24, fontSize: '0.9em' }}>
          Cadastre produtos em massa. Suporta criação e atualização (por SKU).
        </p>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>📋 Colunas do CSV</h3>
          <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8em', color: '#a78bfa', overflow: 'auto' }}>
            <div>sku, ean, nome, marca, categoria, volume, genero, custo, preco_venda, estoque</div>
          </div>
          <p style={{ color: '#7070a0', fontSize: '0.8em', marginTop: 8 }}>
            <strong style={{ color: '#eab308' }}>*</strong> Obrigatórias: <code style={{ color: '#a78bfa' }}>sku</code>, <code style={{ color: '#a78bfa' }}>nome</code>. Demais opcionais.
            <br />Marcas e categorias novas são criadas automaticamente.
            <br />Estoque inicial vai pra <code style={{ color: '#a78bfa' }}>inventory</code>. Custo + preço vão pra <code style={{ color: '#a78bfa' }}>product_prices</code> no canal Mercado Livre.
          </p>
        </div>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>📥 1. Baixar template</h3>
          <button onClick={downloadTemplate} style={{
            padding: '12px 24px', background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa',
            color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: '0.9em', fontWeight: 600,
          }}>
            📋 Baixar template CSV
          </button>
        </div>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ color: '#a78bfa', marginBottom: 12 }}>📤 2. Enviar seu CSV</h3>
          <input
            ref={fileInputRef} type="file" accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginBottom: 12, color: '#d0c0ff' }}
          />
          {file && (
            <div style={{ marginBottom: 12, color: '#7070a0', fontSize: '0.85em' }}>
              Arquivo: <strong style={{ color: '#a78bfa' }}>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
          <button
            onClick={upload}
            disabled={!file || uploading}
            style={{
              padding: '12px 24px', background: '#22c55e', border: 'none', color: '#000',
              borderRadius: 8, cursor: file && !uploading ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '0.9em', opacity: file && !uploading ? 1 : 0.5,
            }}
          >
            {uploading ? '⏳ Importando...' : '🚀 Importar'}
          </button>
        </div>

        {result && (
          <div style={{
            background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.success ? '#22c55e' : '#ef4444'}`,
            borderRadius: 12, padding: 20,
          }}>
            <h3 style={{ color: result.success ? '#22c55e' : '#ef4444', marginBottom: 12 }}>
              {result.success ? '✅ Importação concluída' : '❌ Erro'}
            </h3>
            {result.success ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                  <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Criados</div>
                    <div style={{ color: '#22c55e', fontSize: '1.5em', fontWeight: 700 }}>{result.criados}</div>
                  </div>
                  <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Atualizados</div>
                    <div style={{ color: '#a78bfa', fontSize: '1.5em', fontWeight: 700 }}>{result.atualizados}</div>
                  </div>
                  <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Erros</div>
                    <div style={{ color: result.erros?.length > 0 ? '#ef4444' : '#22c55e', fontSize: '1.5em', fontWeight: 700 }}>{result.erros?.length || 0}</div>
                  </div>
                </div>
                {result.erros?.length > 0 && (
                  <div style={{ background: '#0a0a1a', padding: 12, borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                    <div style={{ color: '#ef4444', fontSize: '0.85em', fontWeight: 600, marginBottom: 8 }}>Erros:</div>
                    {result.erros.map((err: string, i: number) => (
                      <div key={i} style={{ color: '#ef4444', fontSize: '0.8em', fontFamily: 'monospace' }}>• {err}</div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#ef4444' }}>{result.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
