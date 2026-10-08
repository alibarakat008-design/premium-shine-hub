# ✨ Premium Shine Hub

> **Sistema Omnichannel para Distribuidora de Perfumaria**
> 528 SKUs · 14 marcas · Multi-CNPJ · Multi-Canal · Vendedoras · Afiliados

Sistema completo de gestão para distribuidora de perfumes, com integração a Mercado Livre, Shopee, PIX (Asaas), NF-e (Focus NFe), rastreio de pedidos, painel de vendedoras, programa de afiliados e DRE automático mensal.

---

## 🚀 Quick Start

### 1) Instalar dependências
```bash
npm install
```

### 2) Configurar variáveis de ambiente
```bash
cp .env.example .env
# Edite o .env com suas credenciais reais
```

### 3) Criar banco de dados
- Crie um projeto no [Supabase](https://supabase.com) ou use Docker local
- Copie a connection string pro `DATABASE_URL` no .env
- Rode o schema:
  ```bash
  psql $DATABASE_URL -f database_schema.sql
  ```

### 4) Popular banco com dados iniciais
```bash
npm run seed
```
Vai criar admin, 3 vendedoras, 2 afiliados, 3 CNPJs, 15 marcas, 7 categorias, etc.

### 5) Importar catálogo (528 produtos)
```bash
npm run import-catalog
```

### 6) Rodar em desenvolvimento
```bash
npm run dev
```
Acesse: http://localhost:3000

**Credenciais iniciais (após seed):**
- Admin: `admin@premiumshine.com.br` / `admin123456`
- Vendedora: `maria@premiumshine.com.br` / `maria123`
- Afiliado: `carla@email.com` / `carla123`

⚠️ **TROQUE A SENHA DO ADMIN NO PRIMEIRO LOGIN!**

---

## 📚 Documentação Completa

| Arquivo | O que tem |
|---------|-----------|
| `MANUAL_DE_USO.md` | Manual de uso do dia-a-dia |
| `GUIA_DEPLOY_PRODUCAO.md` | Como colocar em produção |
| `GUIA_HOMOLOGACAO_ML.html` | Como criar app no Mercado Livre |
| `GUIA_HOMOLOGACAO_SHOPEE.html` | Como criar app na Shopee |
| `GUIA_SEM_PROGRAMADOR.html` | Guia pra quem não é dev |
| `INDICE_PROJETO.html` | Índice de todos os documentos |

---

## 🏗️ Estrutura do Projeto

```
premium-shine-hub/
├── app/                    # Páginas e APIs (Next.js App Router)
│   ├── api/                # Endpoints da API
│   │   ├── auth/           # NextAuth
│   │   ├── products/       # CRUD de produtos
│   │   ├── orders/         # Pedidos
│   │   ├── ml/             # Mercado Livre (OAuth + sync)
│   │   ├── shopee/         # Shopee (OAuth + sync)
│   │   ├── payment/        # PIX / Asaas
│   │   ├── nfe/            # Nota Fiscal
│   │   ├── vendedoras/     # Vendedoras
│   │   ├── afiliados/      # Afiliados
│   │   ├── public/         # API pública (site externo)
│   │   └── cron/           # Jobs automáticos
│   ├── admin/              # Páginas administrativas
│   ├── vendedora/          # Dashboard da vendedora
│   ├── afiliado/           # Dashboard do afiliado
│   ├── rastreio/           # Página pública de rastreio
│   └── login/              # Tela de login
├── lib/                    # Bibliotecas de integração
│   ├── asaas/              # Cliente Asaas (PIX)
│   ├── focus-nfe/          # Cliente Focus NFe
│   ├── mercadolivre/       # Sync ML
│   ├── shopee/             # Sync Shopee
│   ├── r2/                 # Upload Cloudflare R2
│   └── integracao-site/    # Vinculação com site externo
├── scripts/                # Scripts utilitários
│   ├── seed-completo.ts    # Popular banco
│   ├── import-catalog.ts   # Importar 528 SKUs
│   ├── dre-report.ts       # Gerar DRE
│   └── dre-cron-monthly.ts # Cron DRE mensal
├── public/                 # Assets estáticos
│   └── widget.js           # Widget de catálogo pro site
├── database_schema.sql     # Schema completo do banco
├── vercel.json             # Configuração Vercel + Crons
├── package.json            # Dependências
└── .env.example            # Modelo de variáveis de ambiente
```

---

## 💎 Funcionalidades

### 🛍️ Catálogo (528 SKUs)
- Cadastro com notas olfativas (topo/coração/base/família)
- Upload de foto (drag & drop)
- 17 filtros de busca
- EAN validado
- Destaque por produto

### 🌐 Integrações Marketplace
- **Mercado Livre** — multi-contas, sync produtos/pedidos/estoque
- **Shopee** — multi-contas com HMAC-SHA256
- Webhooks em tempo real
- Sincronização automática a cada 1h (cron)

### 💳 Pagamentos
- **PIX via Asaas** (taxa zero, D+0)
- Cartão de crédito (taxa 2,5%)
- Webhook confirma em 1-5 segundos
- Estoque baixa automático

### 📄 Nota Fiscal
- **NF-e automática via Focus NFe**
- Geração a partir do pedido
- XML + PDF salvos
- Suporte a Simples Nacional

### 📦 Estoque
- **Único centralizado** entre todos os canais
- Alerta de reestoque (mínimo)
- Histórico de movimentações
- Sugestão automática de compra

### 👩‍💼 Vendedoras
- Cadastro com comissão personalizável (% ou fixo)
- Metas mensais (valor R$)
- Bônus por bater meta (5% / 10%)
- **Ranking** automático
- Pagamento via PIX

### 🔗 Afiliados
- Cadastro público
- Link único com slug
- Tracking de cliques (cookie 30 dias)
- Dashboard de comissão
- **Saque via PIX** (mínimo R$ 50)

### 📊 Relatórios
- DRE mensal automático (PDF + Google Drive)
- P&L por marca
- Produtos parados (30+ dias)
- Top sellers
- Vendas por canal/marca/período

### 🏢 Multi-CNPJ
- 3 empresas suportadas
- Vinculação automática por canal
- Relatórios separados por CNPJ

### 🔐 Segurança
- NextAuth com 4 roles (admin, seller, vendedora, afiliado)
- Middleware de proteção
- CORS configurável
- API Keys por site externo
- Auditoria de ações

---

## 🚀 Deploy em Produção

Siga o guia completo: [`GUIA_DEPLOY_PRODUCAO.md`](./GUIA_DEPLOY_PRODUCAO.md)

**TL;DR:**
1. Criar projeto no Supabase
2. Rodar `database_schema.sql` no SQL Editor
3. Subir código pro GitHub
4. Importar no Vercel
5. Configurar variáveis de ambiente
6. Deploy automático!

**Custo mensal estimado:**
- Vercel: Grátis
- Supabase: Grátis (até 500MB)
- Cloudflare R2: Grátis (até 10GB)
- Asaas (PIX): R$ 0,00 (PIX é grátis)
- Focus NFe: ~R$ 50/mês (500 NFs)
- **Total: R$ 5-100/mês** dependendo do volume

---

## 🛠️ Scripts Disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Roda o build de produção |
| `npm run seed` | Popula banco com dados iniciais |
| `npm run import-catalog` | Importa 528 SKUs dos JSONs |
| `npm run dre:monthly` | Gera DRE do mês anterior |
| `npm run db:studio` | Abre Prisma Studio (visualizar banco) |

---

## 🆘 Suporte

- **Manual:** `MANUAL_DE_USO.md`
- **Deploy:** `GUIA_DEPLOY_PRODUCAO.md`
- **Homologação ML:** `GUIA_HOMOLOGACAO_ML.html`
- **Homologação Shopee:** `GUIA_HOMOLOGACAO_SHOPEE.html`

---

## 📊 Status do Sistema

✅ Catálogo · ✅ Auth · ✅ ML · ✅ Shopee · ✅ PIX · ✅ NF-e
✅ Vendedoras · ✅ Afiliados · ✅ Crons · ✅ Relatórios
✅ Upload de Fotos · ✅ Rastreamento · ✅ Multi-CNPJ

**Sistema 100% pronto pra produção.**

---

**Boa sorte com o lançamento! 🚀**
