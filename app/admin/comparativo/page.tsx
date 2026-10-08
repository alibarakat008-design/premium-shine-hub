'use client'

/**
 * /admin/comparativo
 *
 * Página central de comparativos. Redireciona para os 3 tipos:
 * - /admin/comparativo-periodo (período vs período)
 * - /admin/comparativo-produtos (produto vs produto)
 * - /admin/comparativo-marcas (marca vs marca)
 * + Comparador customizado (any vs any).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ComparativoIndexPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--psh-text-primary)' }}>
        🔄 Comparativos
      </h1>
      <p style={{ color: 'var(--psh-text-secondary)', fontSize: 14, marginTop: 6 }}>
        Compare diferentes dimensões do seu negócio lado a lado.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
        <Link href="/admin/comparativo-periodo" style={card}>
          <div style={emoji}>📅</div>
          <h3 style={title}>Período vs Período</h3>
          <p style={desc}>
            Compare 2 janelas de tempo (ex: este mês vs mês passado, ou 7d vs 7d).
            Receita, pedidos, ticket médio, top produtos.
          </p>
        </Link>

        <Link href="/admin/comparativo-produtos" style={card}>
          <div style={emoji}>📦</div>
          <h3 style={title}>Produto vs Produto</h3>
          <p style={desc}>
            Compare 2 produtos lado a lado: vendas, margem, CMV, giro, tendência.
            Útil pra decidir qual manter em catálogo.
          </p>
        </Link>

        <Link href="/admin/comparativo-marcas" style={card}>
          <div style={emoji}>🏷️</div>
          <h3 style={title}>Marca vs Marca</h3>
          <p style={desc}>
            Performance por marca: receita, market share, produtos top, margem média.
          </p>
        </Link>
      </div>

      <div style={{ marginTop: 32, padding: 20, background: 'var(--psh-bg-secondary)', borderRadius: 12, border: '1px solid var(--psh-border)' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          💡 Dica: use o comparador customizado
        </h3>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--psh-text-secondary)' }}>
          Em cada página de comparativo você pode escolher as 2 dimensões, períodos e métricas. Os números são
          calculados em tempo real direto do banco de dados.
        </p>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  display: 'block',
  background: 'var(--psh-bg-primary)',
  border: '1px solid var(--psh-border)',
  borderRadius: 12,
  padding: 20,
  textDecoration: 'none',
  color: 'inherit',
  transition: 'all 0.2s',
}
const emoji: React.CSSProperties = { fontSize: 32, marginBottom: 8 }
const title: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }
const desc: React.CSSProperties = { marginTop: 8, fontSize: 13, color: 'var(--psh-text-secondary)', lineHeight: 1.5 }
