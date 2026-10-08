'use client'

import { useState, useEffect } from 'react'

type Simulador = 'ml' | 'shopee' | 'tiktok' | 'kit'

const SIMULADORES: { key: Simulador; label: string; emoji: string; desc: string; url: string; color: string }[] = [
  { key: 'ml', label: 'Mercado Livre', emoji: '🟡', desc: 'Simulador de preço para Mercado Livre', url: '/simuladores/Simulador Preço Mercado Livre.html', color: '#ffe600' },
  { key: 'shopee', label: 'Shopee', emoji: '🟠', desc: 'Simulador de preço para Shopee', url: '/simuladores/Simulador Preço Shopee.html', color: '#ee4d2d' },
  { key: 'tiktok', label: 'TikTok', emoji: '⚫', desc: 'Simulador de preço para TikTok Shop', url: '/simuladores/Simulador Preço TIKTOK.html', color: '#ff0050' },
  { key: 'kit', label: 'Kit', emoji: '🧩', desc: 'Simulador de margem para Kits', url: '/simuladores/Simulador KIT.html', color: '#a78bfa' },
]

export default function SimuladorPage() {
  const [active, setActive] = useState<Simulador>('ml')
  const [src, setSrc] = useState('')

  useEffect(() => {
    const s = SIMULADORES.find(s => s.key === active)
    if (s) setSrc(s.url)
  }, [active])

  const current = SIMULADORES.find(s => s.key === active)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0' }}>
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>🧮 Simulador</h1>
            <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>
              Simule preços e margens para diferentes marketplaces
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SIMULADORES.map(sim => (
          <button
            key={sim.key}
            onClick={() => setActive(sim.key)}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s',
              background: active === sim.key ? sim.color : '#1a1a2e',
              color: active === sim.key ? '#000' : '#7070a0',
              boxShadow: active === sim.key ? `0 4px 16px ${sim.color}55` : 'none',
              transform: active === sim.key ? 'translateY(-1px)' : 'none',
            }}
          >
            <span style={{ fontSize: 18 }}>{sim.emoji}</span>
            {sim.label}
          </button>
        ))}
      </div>

      {/* Descrição */}
      {current && (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 24px' }}>
          <p style={{ color: '#7070a0', fontSize: 13, margin: 0 }}>
            {current.desc}
          </p>
        </div>
      )}

      {/* Simulador iframe */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px 24px' }}>
        {src && (
          <iframe
            key={active}
            src={src}
            title={current?.label}
            style={{
              width: '100%',
              height: 'calc(100vh - 220px)',
              minHeight: 600,
              border: `2px solid ${current?.color}44`,
              borderRadius: 16,
              background: '#0a0a1a',
            }}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </div>
  )
}
