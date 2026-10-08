'use client'

// Painel lateral de detalhes do produto
// Abre ao clicar no card na lista de produtos

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Product = any

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ProductDetailPanel({
  product,
  onClose,
}: {
  product: Product
  onClose: () => void
}) {
  const router = useRouter()

  // Fechar com ESC
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const mlPrice = product.prices?.find((p: any) => p.canal === 'mercado_livre')
  const mlListing = product.marketplace_listings?.[0]
  const listingType = mlListing?.listing_type
  const isCatalog = listingType === 'gold_special' || listingType === 'catalog'
  const vendasTotal = Number(mlListing?.vendas_total ?? 0)
  const estoqueAtual = Number(product.inventory?.quantidade_atual ?? 0)
  const estoqueMinimo = Number(product.inventory?.quantidade_minimo ?? 15)
  const estoqueBaixo = estoqueAtual > 0 && estoqueAtual <= estoqueMinimo
  const semEstoque = estoqueAtual === 0
  const precoAtual = Number(
    mlPrice?.preco_venda ?? mlPrice?.preco ?? mlListing?.preco_atual ?? 0
  )
  const custo = Number(mlPrice?.custo ?? 0)
  const faturamento = vendasTotal * precoAtual
  const margemUnitaria = precoAtual - custo
  const margemPct = precoAtual > 0 ? (margemUnitaria / precoAtual) * 100 : 0
  const notas = product.notas_olfativas
  const hasNotas = notas && (notas.topo || notas.coracao || notas.base || notas.familia || notas.inspiracao)

  return (
    <>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}
      />

      {/* Painel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 540,
          maxWidth: '95vw',
          background: 'white',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.1)',
          zIndex: 1001,
          overflowY: 'auto',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            position: 'sticky',
            top: 0,
            background: 'white',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                {isCatalog && (
                  <span style={badge('#1e88e5', '#fff')}>C</span>
                )}
                {listingType && !isCatalog && (
                  <span style={badge('#22c55e', '#fff')}>T</span>
                )}
                {estoqueBaixo && <span style={badge('#fef3c7', '#92400e')}>⚠️ Baixo</span>}
                {semEstoque && <span style={badge('#fee2e2', '#991b1b')}>❌ Sem estoque</span>}
                {product.destaque && <span style={badge('#fce7f3', '#be185d')}>⭐ Destaque</span>}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.3 }}>
                {product.nome}
              </h2>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                {product.sku}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: 'white',
                cursor: 'pointer',
                fontSize: 18,
                color: '#6b7280',
              }}
              title="Fechar (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Foto */}
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center', background: '#fafbfc' }}>
          {product.foto_principal_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.foto_principal_url}
              alt={product.nome}
              style={{ maxWidth: 240, maxHeight: 240, objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                width: 240,
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#e5e7eb',
                borderRadius: 8,
                fontSize: 64,
              }}
            >
              📦
            </div>
          )}
        </div>

        {/* Performance */}
        <div style={{ padding: 20, borderTop: '1px solid #e5e7eb' }}>
          <h3 style={sectionTitle}>📊 Performance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <BigStat label="🛒 Vendas no Mercado Livre" value={vendasTotal.toLocaleString('pt-BR')} color="#7c3aed" big />
            <BigStat label="💰 Preço Atual" value={precoAtual > 0 ? fmtBRL(precoAtual) : '—'} color="#10b981" />
            <BigStat
              label="📦 Estoque Atual"
              value={`${estoqueAtual} un`}
              color={estoqueBaixo || semEstoque ? '#ef4444' : '#3b82f6'}
            />
            <BigStat
              label="💵 Faturamento Total"
              value={faturamento > 0 ? fmtBRL(faturamento) : '—'}
              color="#8b5cf6"
            />
            {custo > 0 && <BigStat label="💸 Custo" value={fmtBRL(custo)} color="#6b7280" />}
            {custo > 0 && precoAtual > 0 && (
              <BigStat
                label="📈 Margem"
                value={`${margemPct.toFixed(1)}%`}
                color={margemPct >= 30 ? '#10b981' : margemPct >= 15 ? '#f59e0b' : '#ef4444'}
              />
            )}
          </div>
        </div>

        {/* Identificação */}
        <div style={{ padding: 20, borderTop: '1px solid #e5e7eb' }}>
          <h3 style={sectionTitle}>🏷️ Identificação</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <InfoCard label="🏷️ Marca" value={product.brands?.nome || '—'} />
            <InfoCard label="🏷️ Categoria" value={product.categories?.nome || '—'} />
            <InfoCard label="💧 Volume" value={product.volume || '—'} />
            <InfoCard label="👤 Gênero" value={product.genero || '—'} />
            <InfoCard label="🔢 EAN" value={product.ean || '—'} mono />
            <InfoCard label="📋 NCM" value={product.ncm || '—'} mono />
            {product.suppliers?.nome && <InfoCard label="🏭 Fornecedor" value={product.suppliers.nome} />}
          </div>
        </div>

        {/* Notas Olfativas */}
        {hasNotas && (
          <div style={{ padding: 20, borderTop: '1px solid #e5e7eb' }}>
            <h3 style={sectionTitle}>🌸 Notas Olfativas</h3>
            {notas.familia && (
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                Família: {notas.familia}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <NotaCard label="🌿 Topo" valor={notas.topo} cor="#60a5fa" />
              <NotaCard label="💗 Coração" valor={notas.coracao} cor="#f472b6" />
              <NotaCard label="🪵 Base" valor={notas.base} cor="#eab308" />
            </div>
            {notas.inspiracao && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: '#fdf2f8',
                  border: '1px solid #fbcfe8',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#be185d',
                }}
              >
                <strong>💡 Inspiração:</strong> {notas.inspiracao}
              </div>
            )}
          </div>
        )}

        {/* Estoque */}
        {product.inventory && (
          <div style={{ padding: 20, borderTop: '1px solid #e5e7eb' }}>
            <h3 style={sectionTitle}>📦 Estoque</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <InfoCard label="Atual" value={`${estoqueAtual} un`} />
              <InfoCard label="Mínimo" value={`${estoqueMinimo} un`} />
              {product.inventory.localizacao_fisica && (
                <InfoCard label="📍 Localização" value={product.inventory.localizacao_fisica} />
              )}
              {product.inventory.custo_medio && (
                <InfoCard label="💰 Custo Médio" value={fmtBRL(Number(product.inventory.custo_medio))} />
              )}
            </div>
          </div>
        )}

        {/* Footer com ações */}
        <div
          style={{
            padding: 20,
            borderTop: '1px solid #e5e7eb',
            background: '#fafbfc',
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              background: 'white',
              border: '1px solid #d1d5db',
              color: '#374151',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Fechar
          </button>
          <button
            onClick={() => router.push(`/admin/produtos/${product.sku}`)}
            style={{
              flex: 2,
              padding: '10px',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            📄 Ver página completa
          </button>
        </div>
      </div>
    </>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  margin: '0 0 12px 0',
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    background: bg,
    color,
  }
}

function BigStat({
  label,
  value,
  color,
  big,
}: {
  label: string
  value: string
  color: string
  big?: boolean
}) {
  return (
    <div
      style={{
        background: '#fafbfc',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: 10,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 16, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: '#fafbfc', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: '#111827',
          fontWeight: 500,
          fontFamily: mono ? 'monospace' : 'inherit',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function NotaCard({ label, valor, cor }: { label: string; valor?: string; cor: string }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${cor}30`, borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 11, color: cor, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#374151', minHeight: 32 }}>{valor || '—'}</div>
    </div>
  )
}
