'use client'

/**
 * /admin/empresas - Gestão multi-company
 * - Lista todas as companies com métricas
 * - Cadastrar nova empresa (parceiro, filial, etc)
 * - Importar vendas ML de uma empresa parceira (via order_number)
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Company = {
  id: string
  cnpj: string
  nome_fantasia: string | null
  razao_social: string
  account_type: string
  ativa: boolean
  email: string | null
  vendas_30d: number
  receita_30d: number
  total_orders: number
  total_products: number
  total_ml_accounts: number
  created_at: string
}

const ICON_BY_TYPE: Record<string, string> = {
  matriz: '👑',
  filial: '🏢',
  parceiro: '🤝',
  cliente: '🛒',
  fornecedor: '📦',
}

const COLOR_BY_TYPE: Record<string, string> = {
  matriz: '#7c3aed',
  filial: '#0ea5e9',
  parceiro: '#10b981',
  cliente: '#f59e0b',
  fornecedor: 'var(--psh-text-secondary, #6b7280)',
}

export default function EmpresasPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showCadastro, setShowCadastro] = useState(false)
  const [showImportar, setShowImportar] = useState<string | null>(null) // company_id
  const [editCompany, setEditCompany] = useState<Company | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/companies', {
        credentials: 'include',
        headers: { Authorization: `Basic ${auth}` },
      })
      const data = await res.json()
      if (data.ok) setCompanies(data.companies || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
            🏢 Empresas
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--psh-text-secondary)' }}>
            Gestão multi-company · cada empresa importa suas vendas, cadastra custos e opera de forma independente
          </p>
        </div>
        <button
          onClick={() => { setEditCompany(null); setShowCadastro(true) }}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            color: 'var(--psh-bg-primary, #fff)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ➕ Cadastrar Empresa
        </button>
      </div>

      {/* Cards resumo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        <ResumoCard label="Total Empresas" value={companies.length} color="#7c3aed" emoji="🏢" />
        <ResumoCard label="Matrizes" value={companies.filter(c => c.account_type === 'matriz').length} color="#7c3aed" emoji="👑" />
        <ResumoCard label="Filiais" value={companies.filter(c => c.account_type === 'filial').length} color="#0ea5e9" emoji="🏢" />
        <ResumoCard label="Parceiros" value={companies.filter(c => c.account_type === 'parceiro').length} color="#10b981" emoji="🤝" />
        <ResumoCard
          label="Vendas 30d"
          value={companies.reduce((s, c) => s + (c.vendas_30d || 0), 0)}
          color="#f59e0b"
          emoji="📦"
        />
        <ResumoCard
          label="Receita 30d"
          value={'R$ ' + companies.reduce((s, c) => s + (c.receita_30d || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          color="#10b981"
          emoji="💰"
        />
      </div>

      {/* Tabela de companies */}
      <div style={{
        background: 'var(--psh-bg-secondary)',
        border: '1px solid var(--psh-border-primary)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--psh-border-primary)',
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--psh-text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          📋 Lista de Empresas Cadastradas
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
            ⏳ Carregando...
          </div>
        ) : companies.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--psh-text-secondary)' }}>
            Nenhuma empresa cadastrada.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--psh-bg-primary)', color: 'var(--psh-text-secondary)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: 600 }}>Empresa</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: 600 }}>CNPJ</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: 600 }}>Tipo</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>Vendas</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>SKUs</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>Receita 30d</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: 600 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const cor = COLOR_BY_TYPE[c.account_type] || 'var(--psh-text-secondary, #6b7280)'
                const icone = ICON_BY_TYPE[c.account_type] || '🏷️'
                return (
                  <tr key={c.id} style={{
                    borderTop: '1px solid var(--psh-border-secondary)',
                    color: 'var(--psh-text-primary)',
                  }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: `${cor}20`,
                          color: cor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16,
                        }}>
                          {icone}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {c.nome_fantasia || c.razao_social}
                          </div>
                          {c.email && (
                            <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)' }}>
                              ✉️ {c.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
                      {c.cnpj}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 12,
                        background: `${cor}20`,
                        color: cor,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>
                        {c.account_type}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {c.total_orders.toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {c.total_products.toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: cor }}>
                      R$ {(c.receita_30d || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          onClick={() => router.push(`/admin/empresas/${c.id}/configuracao`)}
                          title="Configurar OAuth ML, tokens, etc"
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #fde68a',
                            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                            color: '#92400e',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          ⚙️ Config
                        </button>
                        <button
                          onClick={() => setShowImportar(c.id)}
                          title="Importar vendas ML desta empresa"
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--psh-border-primary)',
                            background: 'var(--psh-bg-primary)',
                            color: 'var(--psh-text-primary)',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          📥 Importar ML
                        </button>
                        <button
                          onClick={() => { setEditCompany(c); setShowCadastro(true) }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--psh-border-primary)',
                            background: 'var(--psh-bg-primary)',
                            color: 'var(--psh-text-primary)',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Cadastro / Edição */}
      {showCadastro && (
        <CadastroModal
          company={editCompany}
          onClose={() => { setShowCadastro(false); setEditCompany(null) }}
          onSaved={() => { setShowCadastro(false); setEditCompany(null); load() }}
        />
      )}

      {/* Modal de Importar ML */}
      {showImportar && (
        <ImportarModal
          companyId={showImportar}
          company={companies.find(c => c.id === showImportar)!}
          onClose={() => setShowImportar(null)}
        />
      )}
    </div>
  )
}

function ResumoCard({ label, value, color, emoji }: { label: string; value: any; color: string; emoji: string }) {
  return (
    <div style={{
      padding: 16,
      background: 'var(--psh-bg-secondary)',
      border: '1px solid var(--psh-border-primary)',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${color}20`,
        color: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {emoji}
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--psh-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--psh-text-primary)', marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

function CadastroModal({ company, onClose, onSaved }: {
  company: Company | null
  onClose: () => void
  onSaved: () => void
}) {
  const [cnpj, setCnpj] = useState(company?.cnpj || '')
  const [razaoSocial, setRazaoSocial] = useState(company?.razao_social || '')
  const [nomeFantasia, setNomeFantasia] = useState(company?.nome_fantasia || '')
  const [email, setEmail] = useState(company?.email || '')
  const [telefone, setTelefone] = useState('')
  const [accountType, setAccountType] = useState(company?.account_type || 'parceiro')
  const [ativa, setAtiva] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatCNPJ = (v: string) => {
    v = v.replace(/\D/g, '').slice(0, 14)
    return v
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  const submit = async () => {
    setError(null)
    if (!cnpj || !razaoSocial) {
      setError('CNPJ e Razão Social são obrigatórios')
      return
    }
    setSaving(true)
    try {
      const auth = btoa('premium:shine2026')
      const url = company ? `/api/admin/empresas/${company.id}` : '/api/admin/empresas'
      const method = company ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          cnpj, razao_social: razaoSocial, nome_fantasia: nomeFantasia,
          email, telefone, account_type: accountType, ativa,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar')
      onSaved()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{
        background: 'var(--psh-bg-secondary)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 560,
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          {company ? '✏️ Editar Empresa' : '➕ Cadastrar Nova Empresa'}
        </h2>

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#fee2e2', color: '#991b1b',
            fontSize: 12, marginBottom: 12,
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="CNPJ *" value={cnpj} onChange={(v) => setCnpj(formatCNPJ(v))} placeholder="11.222.333/0001-81" />
          <Field label="Razão Social *" value={razaoSocial} onChange={setRazaoSocial} placeholder="LTDA COMERCIO DE PERFUMES" />
          <Field label="Nome Fantasia" value={nomeFantasia} onChange={setNomeFantasia} placeholder="Nome curto (opcional)" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="contato@empresa.com" type="email" />
          <Field label="Telefone" value={telefone} onChange={(v) => setTelefone(v.replace(/\D/g, '').slice(0, 11))} placeholder="11999998888" />

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
              Tipo de Conta
            </label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '10px 12px',
                border: '1px solid var(--psh-border-primary)',
                borderRadius: 8,
                background: 'var(--psh-bg-primary)',
                color: 'var(--psh-text-primary)',
                fontSize: 13,
              }}
            >
              <option value="parceiro">🤝 Parceiro — vende produtos, quer acompanhar vendas</option>
              <option value="filial">🏢 Filial — empresa controlada</option>
              <option value="cliente">🛒 Cliente — só compra de mim</option>
              <option value="fornecedor">📦 Fornecedor — vende pra mim</option>
              <option value="matriz">👑 Matriz — sede (multi-unidade)</option>
            </select>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'var(--psh-text-primary)',
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            Empresa ativa (pode operar no sistema)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: 'none',
              background: saving ? 'var(--psh-text-secondary, #9ca3af)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: 'var(--psh-bg-primary, #fff)', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '⏳ Salvando...' : company ? '💾 Atualizar' : '➕ Cadastrar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function ImportarModal({ companyId, company, onClose }: {
  companyId: string
  company: Company
  onClose: () => void
}) {
  const [orderNumbers, setOrderNumbers] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setResult(null)
    const nums = orderNumbers.split(/[\s,;]+/).filter(n => n.trim().length > 0)
    if (nums.length === 0) {
      setError('Digite pelo menos 1 número de pedido ML')
      return
    }
    setImporting(true)
    try {
      const auth = btoa('premium:shine2026')
      const res = await fetch('/api/admin/importar-vendas-parceiro', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ company_id: companyId, order_numbers: nums }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erro ao importar')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{
        background: 'var(--psh-bg-secondary)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 640,
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--psh-text-primary)' }}>
          📥 Importar Vendas ML
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--psh-text-secondary)' }}>
          Empresa: <b>{company.nome_fantasia || company.razao_social}</b> ({company.cnpj})
        </p>

        {error && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#fee2e2', color: '#991b1b',
            fontSize: 12, marginBottom: 12,
          }}>
            ⚠️ {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
            Números de Pedido ML (separados por vírgula, espaço ou linha)
          </label>
          <textarea
            value={orderNumbers}
            onChange={(e) => setOrderNumbers(e.target.value)}
            placeholder={`2000017237932392\n2000017237820564\n2000017237721620`}
            rows={8}
            style={{
              width: '100%',
              marginTop: 4,
              padding: 12,
              border: '1px solid var(--psh-border-primary)',
              borderRadius: 8,
              background: 'var(--psh-bg-primary)',
              color: 'var(--psh-text-primary)',
              fontSize: 13,
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--psh-text-secondary)', marginTop: 6 }}>
            💡 Cada pedido será buscado via API do Mercado Livre e criado com company_id desta empresa.
            Processa até 50 pedidos por vez.
          </p>
        </div>

        {result && (
          <div style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: result.failed?.length > 0 ? '#fef3c7' : '#d1fae5',
            color: result.failed?.length > 0 ? '#92400e' : '#065f46',
            fontSize: 12,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              ✅ Importação concluída!
            </div>
            <div>✓ Sucesso: {result.imported?.length || 0}</div>
            <div>✗ Falhas: {result.failed?.length || 0}</div>
            {result.failed?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Ver detalhes das falhas
                </summary>
                <ul style={{ marginTop: 6, fontSize: 11 }}>
                  {result.failed.map((f: any, i: number) => (
                    <li key={i}>
                      <b>{f.order_number}</b>: {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {result.imported?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Ver pedidos importados
                </summary>
                <ul style={{ marginTop: 6, fontSize: 11 }}>
                  {result.imported.map((imp: any, i: number) => (
                    <li key={i}>
                      #{imp.order_number}: R$ {imp.total?.toFixed(2)} ({imp.status})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--psh-border-primary)',
              background: 'var(--psh-bg-primary)', color: 'var(--psh-text-primary)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Fechar
          </button>
          <button
            onClick={submit}
            disabled={importing}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: 'none',
              background: importing ? 'var(--psh-text-secondary, #9ca3af)' : 'linear-gradient(135deg, #10b981, #34d399)',
              color: 'var(--psh-bg-primary, #fff)', fontSize: 13, fontWeight: 700,
              cursor: importing ? 'not-allowed' : 'pointer',
            }}
          >
            {importing ? '⏳ Importando...' : '📥 Importar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function Field({ label, value, onChange, placeholder, type }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--psh-text-secondary)', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          marginTop: 4,
          padding: '10px 12px',
          border: '1px solid var(--psh-border-primary)',
          borderRadius: 8,
          background: 'var(--psh-bg-primary)',
          color: 'var(--psh-text-primary)',
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}