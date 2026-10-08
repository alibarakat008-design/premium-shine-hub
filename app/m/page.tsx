'use client'

/**
 * MOBILE / PWA — Premium Shine Hub
 * - Bottom navigation (estilo app nativo)
 * - Cards compactos pra leitura em tela pequena
 * - Tabs horizontais scrolláveis
 * - PWA installable (manifest + service worker)
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function MobilePage() {
  const [tab, setTab] = useState<'home' | 'vendas' | 'clientes' | 'mais'>('home')
  const [vendasData, setVendasData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/dashboard-leve?meses=1', { headers: { Authorization: 'Basic ' + btoa('premium:shine2026') } })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setVendasData(j); setLoading(false) })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', paddingBottom: 70, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', padding: '20px 16px 16px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>Premium Shine</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>LIURAESSENCE</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'white' }}>🖥️</Link>
            <Link href="/admin/notifications" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'white' }}>🔔</Link>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 12px 0' }}>
        {tab === 'home' && <HomeTab vendasData={vendasData} loading={loading} />}
        {tab === 'vendas' && <VendasTab />}
        {tab === 'clientes' && <ClientesTab />}
        {tab === 'mais' && <MaisTab />}
      </div>

      {/* Bottom Navigation */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 50 }}>
        {([
          { key: 'home', emoji: '🏠', label: 'Home' },
          { key: 'vendas', emoji: '💰', label: 'Vendas' },
          { key: 'clientes', emoji: '👥', label: 'Clientes' },
          { key: 'mais', emoji: '⚙️', label: 'Mais' },
        ] as const).map((t) => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px', cursor: 'pointer' }}>
            <div style={{ fontSize: 24, opacity: tab === t.key ? 1 : 0.4 }}>{t.emoji}</div>
            <div style={{ fontSize: 10, color: tab === t.key ? '#3b82f6' : '#9ca3af', fontWeight: tab === t.key ? 700 : 500 }}>{t.label}</div>
          </div>
        ))}
      </nav>
    </div>
  )
}

function HomeTab({ vendasData, loading }: { vendasData: any; loading: boolean }) {
  return (
    <div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <KpiMobile label="Hoje" value={fmtBRL(vendasData?.hoje?.receita || 0)} sub={`${vendasData?.hoje?.pedidos || 0} pedidos`} color="#10b981" />
            <KpiMobile label="Mês" value={fmtBRL(vendasData?.mes_atual?.receita || 0)} sub={`${vendasData?.mes_atual?.pedidos || 0} pedidos`} color="#3b82f6" />
            <KpiMobile label="Ticket" value={fmtBRL(vendasData?.ticket_medio || 0)} sub="mês" color="#8b5cf6" />
            <KpiMobile label="Meta" value={`${vendasData?.meta_pct || 0}%`} sub={fmtBRL(vendasData?.meta || 0)} color="#f59e0b" />
          </div>

          {/* Atalhos */}
          <div style={{ background: 'white', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>⚡ Atalhos rápidos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { emoji: '🔴', label: 'Ao Vivo', href: '/admin/vendas-ao-vivo', color: '#ef4444' },
                { emoji: '💬', label: 'WhatsApp', href: '/admin/campanhas-whatsapp', color: '#10b981' },
                { emoji: '🔮', label: 'Forecast', href: '/admin/forecast-demanda', color: '#3b82f6' },
                { emoji: '💔', label: 'Churn', href: '/admin/churn', color: '#f59e0b' },
                { emoji: '🎯', label: 'RFM', href: '/admin/rfm', color: '#8b5cf6' },
                { emoji: '🛒', label: 'Carrinho', href: '/admin/carrinho-abandonado', color: '#06b6d4' },
                { emoji: '🛡️', label: 'Fraude', href: '/admin/fraude', color: '#dc2626' },
                { emoji: '💰', label: 'Lucro', href: '/admin/lucro-real', color: '#10b981' },
              ].map((a) => (
                <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fafbfc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 24 }}>{a.emoji}</div>
                    <div style={{ fontSize: 10, color: '#374151', fontWeight: 500, textAlign: 'center' }}>{a.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Vendas dos últimos 7 dias */}
          {vendasData?.evolucao_7d && (
            <div style={{ background: 'white', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 8 }}>📈 Últimos 7 dias</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
                {vendasData.evolucao_7d.map((d: any, i: number) => {
                  const max = Math.max(...vendasData.evolucao_7d.map((x: any) => x.receita), 1)
                  const h = (d.receita / max) * 70
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ fontSize: 8, color: '#6b7280' }}>{fmtBRL(d.receita)}</div>
                      <div style={{ width: '100%', height: `${Math.max(h, 4)}px`, background: 'linear-gradient(180deg, #3b82f6, #8b5cf6)', borderRadius: 4 }} />
                      <div style={{ fontSize: 9, color: '#9ca3af' }}>{d.dia?.slice(5) || ''}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function VendasTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link href="/admin/vendas-ao-vivo" style={cardLinkStyle}>
        <div style={cardEmoji}>🔴</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Vendas ao Vivo</div>
          <div style={cardSub}>Atualiza a cada 15s</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/insights" style={cardLinkStyle}>
        <div style={cardEmoji}>💡</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Insights do Dia</div>
          <div style={cardSub}>Achados automáticos</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/pedidos" style={cardLinkStyle}>
        <div style={cardEmoji}>📦</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Pedidos</div>
          <div style={cardSub}>Lista + busca</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/rastreamento" style={cardLinkStyle}>
        <div style={cardEmoji}>🚚</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Rastreamento</div>
          <div style={cardSub}>Status de envio</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/inspecao-vendas" style={cardLinkStyle}>
        <div style={cardEmoji}>🔍</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Inspeção por Dia</div>
          <div style={cardSub}>Calendário + heatmap</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
    </div>
  )
}

function ClientesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link href="/admin/churn" style={cardLinkStyle}>
        <div style={cardEmoji}>💔</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Churn</div>
          <div style={cardSub}>Clientes que sumiram</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/rfm" style={cardLinkStyle}>
        <div style={cardEmoji}>🎯</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>RFM</div>
          <div style={cardSub}>11 segmentos</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/ltv-avancado" style={cardLinkStyle}>
        <div style={cardEmoji}>💰</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>LTV Avançado</div>
          <div style={cardSub}>Curva ABC</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/campanhas-whatsapp" style={cardLinkStyle}>
        <div style={cardEmoji}>💬</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Campanhas WhatsApp</div>
          <div style={cardSub}>6 templates</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/carrinho-abandonado" style={cardLinkStyle}>
        <div style={cardEmoji}>🛒</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Carrinho Abandonado</div>
          <div style={cardSub}>Recuperar vendas</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
    </div>
  )
}

function MaisTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link href="/admin/produtos" style={cardLinkStyle}>
        <div style={cardEmoji}>🛍️</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Produtos</div>
          <div style={cardSub}>Lista completa</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/geografico" style={cardLinkStyle}>
        <div style={cardEmoji}>📍</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Geografia</div>
          <div style={cardSub}>Estados + cidades</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/cross-sell" style={cardLinkStyle}>
        <div style={cardEmoji}>🤝</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Cross-Sell</div>
          <div style={cardSub}>Produtos juntos</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/fraude" style={cardLinkStyle}>
        <div style={cardEmoji}>🛡️</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Detecção de Fraude</div>
          <div style={cardSub}>Alertas + score</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/lucro-real" style={cardLinkStyle}>
        <div style={cardEmoji}>💰</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Lucro Real</div>
          <div style={cardSub}>Margem por pedido</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/conciliacao" style={cardLinkStyle}>
        <div style={cardEmoji}>🏦</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Conciliação</div>
          <div style={cardSub}>Recebimentos ML</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <Link href="/admin/financeiro" style={cardLinkStyle}>
        <div style={cardEmoji}>💼</div>
        <div style={{ flex: 1 }}>
          <div style={cardTitle}>Financeiro</div>
          <div style={cardSub}>DRE + custos</div>
        </div>
        <div style={{ color: '#9ca3af' }}>→</div>
      </Link>
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>📱 App Mobile (PWA)</div>
        <div style={{ fontSize: 11, color: '#0c4a6e', marginTop: 4, lineHeight: 1.4 }}>
          Você está usando a versão mobile. Adicione à tela inicial do celular pra acesso rápido: iOS (Safari: Compartilhar → Adicionar à Tela Inicial) ou Android (Chrome: Menu → Instalar App).
        </div>
      </div>
    </div>
  )
}

function KpiMobile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 12, borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>{sub}</div>
    </div>
  )
}

const cardLinkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 10, padding: 14, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const cardEmoji: React.CSSProperties = { fontSize: 24, width: 40, height: 40, borderRadius: 8, background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#111827' }
const cardSub: React.CSSProperties = { fontSize: 11, color: '#6b7280' }
