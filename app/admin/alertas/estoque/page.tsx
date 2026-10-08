'use client'
import { useState, useEffect } from 'react'

interface Alerta {
  id: string
  sku: string
  nome: string
  marca?: string
  foto_principal_url?: string
  nivel: 'critico' | 'atencao' | 'ok'
  stock: number
  vendido_periodo: number
  venda_diaria: number
  dias_ate_zerar: number
  sugestao: string
}

export default function EstoquePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(7)
  const [filtro, setFiltro] = useState<'todos' | 'critico' | 'atencao'>('todos')

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/alertas/estoque?dias=${dias}`)
      const json = await r.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [dias])

  const alertas = data?.alertas || []
  const filtrados =
    filtro === 'todos' ? alertas : alertas.filter((a: Alerta) => a.nivel === filtro)

  const corNivel = (n: string) =>
    n === 'critico' ? '#dc2626' : n === 'atencao' ? '#f59e0b' : '#10b981'
  const bgNivel = (n: string) =>
    n === 'critico' ? '#fef2f2' : n === 'atencao' ? '#fffbeb' : '#f0fdf4'

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111', margin: 0 }}>
          📦 Alerta de Estoque
        </h1>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
          Produtos com estoque baixo ou projeção de ruptura (baseado nas vendas dos últimos {dias} dias)
        </p>
      </div>

      <div
        style={{
          background: 'var(--psh-bg-primary, white)',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Período de análise
          </label>
          <select value={dias} onChange={(e) => setDias(parseInt(e.target.value, 10))} style={selectStyle}>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
            <option value="90">90 dias</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Filtro
          </label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} style={selectStyle}>
            <option value="todos">Todos ({alertas.length})</option>
            <option value="critico">🔴 Críticos ({data?.resumo?.criticos || 0})</option>
            <option value="atencao">🟡 Atenção ({data?.resumo?.atencao || 0})</option>
          </select>
        </div>
        <button onClick={carregar} disabled={loading} style={btnPrimary}>
          {loading ? 'Carregando...' : '🔄 Atualizar'}
        </button>
        {data?.resumo && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
            <CardResumo cor="#dc2626" label="Críticos" valor={data.resumo.criticos} />
            <CardResumo cor="#f59e0b" label="Atenção" valor={data.resumo.atencao} />
            <CardResumo cor="#10b981" label="OK com venda" valor={data.resumo.total_com_venda - data.resumo.criticos - data.resumo.atencao} />
          </div>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>}

      {!loading && filtrados.length === 0 && (
        <div
          style={{
            background: 'var(--psh-bg-primary, white)',
            padding: '60px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#999',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '16px' }}>Nenhum produto com alerta de estoque neste filtro</div>
        </div>
      )}

      {!loading && filtrados.length > 0 && (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filtrados.map((a: Alerta) => (
            <div
              key={a.id}
              style={{
                background: 'var(--psh-bg-primary, white)',
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'grid',
                gridTemplateColumns: '60px 1fr auto auto auto',
                gap: '16px',
                alignItems: 'center',
                borderLeft: `4px solid ${corNivel(a.nivel)}`,
              }}
            >
              {a.foto_principal_url ? (
                <img src={a.foto_principal_url} alt={a.nome} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' }} />
              ) : (
                <div style={{ width: '60px', height: '60px', background: 'var(--psh-bg-secondary, #f3f4f6)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📦</div>
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{a.nome}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  SKU: {a.sku} {a.marca && `· ${a.marca}`}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  {a.vendido_periodo} vendidos em {dias} dias · {a.venda_diaria}/dia
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Estoque</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: corNivel(a.nivel) }}>{a.stock}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Dias até zerar</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: corNivel(a.nivel) }}>
                  {a.dias_ate_zerar >= 999 ? '∞' : `${a.dias_ate_zerar}d`}
                </div>
              </div>
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: bgNivel(a.nivel),
                  color: corNivel(a.nivel),
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {a.sugestao}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: 'var(--psh-bg-primary, white)',
  outline: 'none',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  background: '#3b82f6',
  color: 'var(--psh-bg-primary, white)',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  alignSelf: 'flex-end',
}

function CardResumo({ cor, label, valor }: { cor: string; label: string; valor: number }) {
  return (
    <div
      style={{
        background: 'var(--psh-bg-secondary, #fafbfc)',
        padding: '8px 16px',
        borderRadius: '8px',
        borderLeft: `3px solid ${cor}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}
