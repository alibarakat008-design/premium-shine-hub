'use client'

/**
 * OrigemBadge — badge colorido da plataforma/marketplace
 *
 * Cores:
 *   - shopee        → laranja (cor oficial Shopee)
 *   - mercado_livre → amarelo (cor oficial ML)
 *   - tiktok        → preto (cor oficial TikTok)
 *   - shopify       → verde
 *   - site_b2c      → azul
 *   - b2b           → roxo
 *   - manual        → cinza
 *
 * Mostra a sigla (SHPE, ML, TKTK, etc) e full no title
 */

const CORES: Record<string, { bg: string; fg: string; sigla: string; nome: string }> = {
  shopee:        { bg: '#ee4d2d', fg: '#ffffff', sigla: 'SHPE', nome: 'Shopee' },
  mercado_livre: { bg: '#ffe600', fg: '#000000', sigla: 'ML',   nome: 'Mercado Livre' },
  tiktok:        { bg: '#000000', fg: '#ffffff', sigla: 'TKTK', nome: 'TikTok Shop' },
  shopify:       { bg: '#5e8e3e', fg: '#ffffff', sigla: 'SHFY', nome: 'Shopify' },
  site_b2c:      { bg: '#2563eb', fg: '#ffffff', sigla: 'B2C',  nome: 'Site B2C' },
  b2b:           { bg: '#7c3aed', fg: '#ffffff', sigla: 'B2B',  nome: 'B2B' },
  whatsapp:      { bg: '#25d366', fg: '#ffffff', sigla: 'WPP',  nome: 'WhatsApp' },
  manual:        { bg: '#6b7280', fg: '#ffffff', sigla: 'MAN',  nome: 'Manual' },
  varejo:        { bg: '#0ea5e9', fg: '#ffffff', sigla: 'VRJ',  nome: 'Varejo' },
}

export default function OrigemBadge({
  origem,
  size = 'sm',
}: {
  origem: string
  size?: 'xs' | 'sm' | 'md'
}) {
  const key = (origem || 'manual').toLowerCase()
  const config = CORES[key] || CORES.manual
  const sizes = {
    xs: { fontSize: 9, padding: '1px 5px', height: 16 },
    sm: { fontSize: 10, padding: '2px 7px', height: 18 },
    md: { fontSize: 12, padding: '3px 10px', height: 22 },
  }[size]
  return (
    <span
      title={config.nome}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: config.bg,
        color: config.fg,
        borderRadius: 3,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        ...sizes,
      }}
    >
      {config.sigla}
    </span>
  )
}

export { CORES as CORES_ORIGEM }
