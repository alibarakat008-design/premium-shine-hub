'use client'

/**
 * B2B RELATÓRIOS (BI)
 * - Gera relatórios sob demanda em CSV
 * - Templates prontos: vendas_diarias, top_produtos, vendas_por_marketplace
 */

import { useState } from 'react'
import Link from 'next/link'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const RELATORIOS = [
  { key: 'vendas_diarias', emoji: '📅', label: 'Vendas Diárias', desc: 'Todas as vendas dia a dia, com cliente e marketplace' },
  { key: 'top_produtos', emoji: '🏆', label: 'Top Produtos', desc: 'Produtos mais vendidos, ranking por receita' },
  { key: 'vendas_marketplace', emoji: '🏪', label: 'Vendas por Marketplace', desc: 'Performance de cada conta vinculada' },
  { key: 'vendas_uf', emoji: '🗺️', label: 'Vendas por Estado', desc: 'Distribuição geográfica das vendas' },
  { key: 'vendas_cliente', emoji: '👥', label: 'Vendas por Cliente', desc: 'Ranking de clientes, ticket e frequência' },
  { key: 'resumo_financeiro', emoji: '💰', label: 'Resumo Financeiro', desc: 'Receita, comissões, fretes, lucro estimado' },
]

export default function B2bRelatoriosPage() {
  const [gerando, setGerando] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<{ key: string; rows: number; timestamp: string } | null>(null)

  const gerar = async (key: string) => {
    setGerando(key)
    try {
      const r = await fetch(`/api/b2b/relatorio?type=${key}`)
      if (!r.ok) { alert('Erro ao gerar relatório'); return }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${key}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setUltimo({ key, rows: 0, timestamp: new Date().toLocaleString('pt-BR') })
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setGerando(null)
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>📑 Relatórios</h1>
        <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0 0' }}>Gere relatórios em CSV pra abrir no Excel/Sheets</p>
      </div>

      {ultimo && (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#065f46' }}>
          ✓ Último download: <strong>{ultimo.key}</strong> às {ultimo.timestamp}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {RELATORIOS.map((r) => (
          <div key={r.key} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 28 }}>{r.emoji}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{r.label}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>{r.desc}</div>
            <button onClick={() => gerar(r.key)} disabled={gerando === r.key} style={{ width: '100%', padding: 8, background: gerando === r.key ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: gerando === r.key ? 'not-allowed' : 'pointer' }}>
              {gerando === r.key ? '⏳ Gerando...' : '📥 Baixar CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
