'use client'

/**
 * PIE CHART - Gráfico de Pizza em SVG (sem dependência externa)
 *
 * Props:
 * - data: [{ label, value, color }]
 * - size: número (tamanho em pixels)
 * - thickness: 0-100 (% do raio que o anel ocupa, 0 = pizza cheia, 50 = donut)
 * - centerLabel: texto central
 * - centerValue: valor central
 */

interface Slice {
  label: string
  value: number
  color: string
}

interface Props {
  data: Slice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  showLegend?: boolean
}

export function PieChart({ data, size = 180, thickness = 50, centerLabel, centerValue, showLegend = true }: Props) {
  const total = data.reduce((acc, d) => acc + d.value, 0)

  if (total === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.8em' }}>
          Sem dados
        </div>
      </div>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4
  const innerR = r * (thickness / 100)

  // Gerar arcos
  let acc = 0
  const slices = data.map((d) => {
    const startAngle = (acc / total) * 360 - 90 // começa em -90 (topo)
    acc += d.value
    const endAngle = (acc / total) * 360 - 90
    const path = describeArc(cx, cy, r, innerR, startAngle, endAngle)
    return { ...d, path, pct: (d.value / total) * 100 }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={1.5} />
          ))}
        </svg>
        {(centerLabel || centerValue) && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            {centerValue && <div style={{ color: '#1f2937', fontSize: '1.3em', fontWeight: 700 }}>{centerValue}</div>}
            {centerLabel && <div style={{ color: '#6b7280', fontSize: '0.7em' }}>{centerLabel}</div>}
          </div>
        )}
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75em', width: '100%' }}>
          {slices.sort((a, b) => b.value - a.value).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ color: '#374151', flex: 1 }}>{s.label}</span>
              <span style={{ color: '#1f2937', fontWeight: 600 }}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  // Se for 360 (pizza cheia), força um pequeno gap para evitar SVG inválido
  if (endAngle - startAngle >= 360) endAngle = startAngle + 359.99

  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle)
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle)
  const startInner = polarToCartesian(cx, cy, rInner, startAngle)
  const endInner = polarToCartesian(cx, cy, rInner, endAngle)

  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  // Anel (donut)
  if (rInner > 0) {
    return [
      'M', startOuter.x, startOuter.y,
      'A', rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
      'L', startInner.x, startInner.y,
      'A', rInner, rInner, 0, largeArc, 1, endInner.x, endInner.y,
      'Z',
    ].join(' ')
  }

  // Pizza cheia
  return [
    'M', cx, cy,
    'L', startOuter.x, startOuter.y,
    'A', rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
    'Z',
  ].join(' ')
}

// Cores padrão por canal
export const CANAL_COLORS: Record<string, string> = {
  mercado_livre: '#f59e0b', // amarelo ML
  shopee: '#ee4d2d', // laranja Shopee
  site_b2c: '#ec4899', // rosa Site
  b2b: '#3b82f6', // azul B2B
  whatsapp: '#10b981', // verde WhatsApp
  vendedora: '#a78bfa', // roxo Vendedoras
  outros: '#6b7280',
}
