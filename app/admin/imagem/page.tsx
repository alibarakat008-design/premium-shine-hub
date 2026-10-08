'use client'

import { useState } from 'react'

export default function ImagemPage() {
  const [activeTab, setActiveTab] = useState<'compressor' | 'conversor'>('compressor')

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0' }}>
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', margin: 0 }}>🖼️ Imagem</h1>
            <p style={{ color: '#7070a0', fontSize: '0.85em', margin: '4px 0 0' }}>
              Ferramentas para compressão e conversão de imagens
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px 0', display: 'flex', gap: 8 }}>
        <button
          onClick={() => setActiveTab('compressor')}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, background: activeTab === 'compressor' ? '#22c55e' : '#1a1a2e',
            color: activeTab === 'compressor' ? '#000' : '#7070a0',
            boxShadow: activeTab === 'compressor' ? '0 4px 16px rgba(34,197,94,0.3)' : 'none',
          }}
        >
          🗜️ Compressor de Imagem
        </button>
        <button
          onClick={() => setActiveTab('conversor')}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, background: activeTab === 'conversor' ? '#6366f1' : '#1a1a2e',
            color: activeTab === 'conversor' ? '#fff' : '#7070a0',
            boxShadow: activeTab === 'conversor' ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
          }}
        >
          🔄 Conversor de Tipo (em breve)
        </button>
      </div>

      {/* Compressor iframe */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 24px 24px' }}>
        {activeTab === 'compressor' && (
          <iframe
            src="/simuladores/Compressor de Imagem.html"
            title="Compressor de Imagem"
            style={{
              width: '100%',
              height: 'calc(100vh - 240px)',
              minHeight: 500,
              border: '2px solid #22c55e44',
              borderRadius: 16,
              background: '#0a0a1a',
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          />
        )}
        {activeTab === 'conversor' && (
          <div style={{ padding: 40, textAlign: 'center', color: '#7070a0', fontSize: 14 }}>
            🔄 Conversor de tipo de arquivo — em breve!<br />
            <span style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              Converter PNG para JPG, WEBP para PNG, etc.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
