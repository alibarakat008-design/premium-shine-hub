'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'

export default function FretePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [cepOrigem, setCepOrigem] = useState('01310100')
  const [cepDestino, setCepDestino] = useState('')
  const [peso, setPeso] = useState(0.3)
  const [altura, setAltura] = useState(5)
  const [largura, setLargura] = useState(15)
  const [profundidade, setProfundidade] = useState(20)
  const [qtd, setQtd] = useState(1)
  const [resultado, setResultado] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  if (status === 'unauthenticated') {
    router.push('/login')
    return null
  }

  async function calcular() {
    if (!cepDestino) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/frete/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cep_origem: cepOrigem.replace(/\D/g, ''),
          cep_destino: cepDestino.replace(/\D/g, ''),
          peso_kg: peso,
          altura_cm: altura,
          largura_cm: largura,
          profundidade_cm: profundidade,
          quantidade: qtd,
        }),
      })
      const j = await res.json()
      if (j.success) setResultado(j.data)
      else alert(j.error)
    } catch (err: any) {
      alert('Erro: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e8e8f0', padding: 20 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ color: '#d0c0ff', fontSize: '1.8em', marginBottom: 8 }}>🚚 Calculadora de Frete</h1>
        <p style={{ color: '#7070a0', marginBottom: 24, fontSize: '0.9em' }}>
          Compare PAC, SEDEX e Mercado Envios. Cálculo aproximado baseado em distância e peso.
        </p>

        <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>CEP Origem</label>
              <input
                type="text" value={cepOrigem} onChange={(e) => setCepOrigem(e.target.value)}
                placeholder="01310100"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>CEP Destino</label>
              <input
                type="text" value={cepDestino} onChange={(e) => setCepDestino(e.target.value)}
                placeholder="20040020"
                style={{ ...inputStyle, borderColor: '#a78bfa' }}
              />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>Peso (kg)</label>
              <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>Quantidade</label>
              <input type="number" value={qtd} onChange={(e) => setQtd(parseInt(e.target.value) || 1)} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>Altura (cm)</label>
              <input type="number" value={altura} onChange={(e) => setAltura(parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>Largura (cm)</label>
              <input type="number" value={largura} onChange={(e) => setLargura(parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#7070a0', fontSize: '0.8em', display: 'block', marginBottom: 4 }}>Profundidade (cm)</label>
              <input type="number" value={profundidade} onChange={(e) => setProfundidade(parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
          </div>
          <button
            onClick={calcular}
            disabled={!cepDestino || loading}
            style={{
              padding: '12px 24px', background: '#a78bfa', border: 'none', color: '#000',
              borderRadius: 8, cursor: !cepDestino ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '0.9em', opacity: !cepDestino ? 0.5 : 1,
            }}
          >
            {loading ? '⏳ Calculando...' : '🧮 Calcular Frete'}
          </button>
        </div>

        {resultado && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Distância</div>
                <div style={{ color: '#a78bfa', fontSize: '1.2em', fontWeight: 700 }}>{resultado.distancia_estimada_km} km</div>
              </div>
              <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Peso Total</div>
                <div style={{ color: '#a78bfa', fontSize: '1.2em', fontWeight: 700 }}>{resultado.peso_kg.toFixed(2)} kg</div>
              </div>
              <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#7070a0', fontSize: '0.75em' }}>Mais barato</div>
                <div style={{ color: '#22c55e', fontSize: '1.1em', fontWeight: 700 }}>R$ {resultado.mais_barato.valor.toFixed(2)}</div>
                <div style={{ color: '#7070a0', fontSize: '0.75em' }}>{resultado.mais_barato.servico}</div>
              </div>
            </div>

            <div style={{ background: '#12122a', border: '1px solid #2a2a4a', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: 12, background: '#0d0d25', color: '#a78bfa', fontWeight: 600 }}>📦 Opções de Frete</div>
              {resultado.opcoes.map((o: any) => (
                <div key={o.servico} style={{ display: 'flex', alignItems: 'center', padding: 14, borderTop: '1px solid #2a2a4a', gap: 12 }}>
                  <div style={{ fontSize: '2em' }}>{o.icone}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#d0c0ff', fontWeight: 600 }}>{o.servico}</div>
                    <div style={{ color: '#7070a0', fontSize: '0.85em' }}>
                      ⏱️ {o.prazo_dias} {o.prazo_dias === 1 ? 'dia útil' : 'dias úteis'}
                      {o.nota && <span style={{ color: '#eab308' }}> • {o.nota}</span>}
                    </div>
                  </div>
                  <div style={{ color: '#a78bfa', fontSize: '1.3em', fontWeight: 700 }}>R$ {o.valor.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 12px', background: '#0a0a1a',
  border: '1px solid #2a2a4a', color: '#e8e8f0', borderRadius: 6, fontSize: '0.9em',
} as const
