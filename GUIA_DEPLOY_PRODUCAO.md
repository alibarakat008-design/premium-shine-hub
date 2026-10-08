# 🚀 Guia de Deploy Final — Premium Shine Hub

## Deploy em produção em 60 minutos

---

## 📋 Pré-requisitos

Antes de começar, você precisa ter:

- ✅ **Conta no Supabase** (grátis) — https://supabase.com
- ✅ **Conta no Vercel** (grátis) — https://vercel.com
- ✅ **Conta no GitHub** (grátis) — https://github.com
- ✅ **Conta no Cloudflare** (R2) — https://cloudflare.com
- ✅ **Conta no Asaas** (PIX) — https://asaas.com
- ✅ **Conta na Focus NFe** — https://focusnfe.com.br
- ✅ **App do Mercado Livre** aprovado (siga GUIA_HOMOLOGACAO_ML.html)
- ✅ **App da Shopee** aprovado (siga GUIA_HOMOLOGACAO_SHOPEE.html)
- ✅ **Certificado Digital A1** (.pfx) pra NF-e (compre em valid.com.br)

---

## 🔧 Passo 1: Subir código pro GitHub

```bash
cd premium-shine-hub
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USER/premium-shine-hub.git
git push -u origin main
```

---

## 🗄️ Passo 2: Configurar Supabase

### 2.1) Criar projeto
1. Acesse https://supabase.com/dashboard
2. Clique "New Project"
3. Nome: `premium-shine-hub`
4. Senha do banco: **GERE UMA FORTE** (anote!)
5. Região: **South America (São Paulo)**
6. Clique "Create new project"

### 2.2) Rodar o schema
1. No painel, vá em **SQL Editor** (menu lateral)
2. New query
3. Copie TODO o conteúdo de `database_schema.sql`
4. Cole e clique **Run** (Ctrl+Enter)
5. Deve aparecer: "Success. No rows returned" (criou as tabelas)

### 2.3) Pegar connection string
1. Settings > Database > Connection string > "URI"
2. Copie a URL completa. Formato:
```
postgresql://postgres:SUA_SENHA@db.xxx.supabase.co:5432/postgres
```

---

## ☁️ Passo 3: Configurar Cloudflare R2

### 3.1) Criar bucket
1. Login no Cloudflare
2. R2 > "Create bucket"
3. Nome: `premiumshine-fotos`
4. Location: Automatic
5. Clique "Create bucket"

### 3.2) Configurar domínio público
1. No bucket, aba "Settings"
2. "Public access" > "Allow Access"
3. Em "Custom Domains", conecte: `fotos.premiumshine.com.br` (ou subdomínio)
4. Anote a URL pública: `https://fotos.premiumshine.com.br`

### 3.3) Criar API Token
1. R2 > "Manage R2 API Tokens"
2. "Create API Token"
3. Nome: `premium-shine-app`
4. Permissions: "Object Read & Write"
5. Bucket: `premiumshine-fotos`
6. Salve o **Access Key ID** e **Secret Access Key**

### 3.4) Pegar Account ID
1. R2 > Overview (ou Workers & Pages)
2. "Account ID" — copie

---

## 🚀 Passo 4: Deploy no Vercel

### 4.1) Importar projeto
1. Acesse https://vercel.com/dashboard
2. "Add New" > "Project"
3. Importe o repositório `premium-shine-hub` do GitHub
4. Framework Preset: **Next.js** (já detectado)
5. NÃO clique Deploy ainda

### 4.2) Configurar variáveis de ambiente
Na seção "Environment Variables", adicione:

```bash
# Banco de dados (Supabase)
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.xxx.supabase.co:5432/postgres

# Auth
NEXTAUTH_URL=https://seu-dominio.vercel.app
NEXTAUTH_SECRET=gere-uma-string-aleatoria-aqui-com-32-chars

# Cron Jobs
CRON_SECRET=outra-string-segura-aqui

# Mercado Livre
ML_CLIENT_ID=1234567890123456
ML_CLIENT_SECRET=AbCdEf123456_seu_secret_aqui
ML_REDIRECT_URI=https://seu-dominio.vercel.app/api/ml/callback
ML_WEBHOOK_URL=https://seu-dominio.vercel.app/api/ml/webhook

# Shopee
SHOPEE_PARTNER_ID=123456
SHOPEE_PARTNER_KEY=abcdef1234567890abcdef1234567890
SHOPEE_REDIRECT_URI=https://seu-dominio.vercel.app/api/shopee/callback

# Cloudflare R2
R2_ACCOUNT_ID=sua_account_id
R2_ACCESS_KEY_ID=sua_access_key
R2_SECRET_ACCESS_KEY=sua_secret_key
R2_BUCKET=premiumshine-fotos
R2_PUBLIC_URL=https://fotos.premiumshine.com.br

# Asaas (PIX)
ASAAS_ENV=production
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_WEBHOOK_TOKEN=seu_token_webhook

# Focus NFe
FOCUS_NFE_ENV=production
FOCUS_NFE_TOKEN=sua_token_focus

# Google Drive (DRE mensal)
GOOGLE_DRIVE_DRE_FOLDER_ID=1aBcDeFgHiJk
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### 4.3) Deploy!
1. Clique "Deploy"
2. Vercel vai buildar e deployar (3-5 min)
3. Quando terminar, vai aparecer "Congratulations!"
4. Acesse a URL: `https://premium-shine-hub-xxx.vercel.app`

---

## 🗄️ Passo 5: Rodar seed (popular banco)

Depois do primeiro deploy, popular o banco:

```bash
# No seu PC, com a DATABASE_URL do Supabase:
DATABASE_URL="postgresql://postgres:SUA_SENHA@db.xxx.supabase.co:5432/postgres" npx tsx scripts/seed-completo.ts
```

**Vai criar:**
- Admin (admin@premiumshine.com.br / admin123456)
- 3 Empresas
- 15 Marcas
- 7 Categorias
- 3 Vendedoras
- 2 Afiliados
- 1 API Key

⚠️ **TROQUE A SENHA DO ADMIN NO PRIMEIRO LOGIN!**

### 5.1) Importar catálogo (528 SKUs)
```bash
npx tsx scripts/import-catalog.ts
```

---

## 🌐 Passo 6: Configurar domínio próprio

### 6.1) Comprar domínio (se não tiver)
- Registro.br (nacional)
- Namecheap
- Cloudflare Registrar

### 6.2) Apontar pro Vercel
1. Vercel > seu projeto > Settings > Domains
2. Adicione: `api.premiumshine.com.br` (ou `app.premiumshine.com.br`)
3. Vercel vai pedir pra adicionar registros DNS:
   - Tipo: `CNAME`
   - Nome: `api` (ou `app`)
   - Valor: `cname.vercel-dns.com`
4. Vá no seu provedor de DNS e adicione

### 6.3) Atualizar variáveis
- `NEXTAUTH_URL` → `https://api.seu-dominio.com.br`
- `ML_REDIRECT_URI` → `https://api.seu-dominio.com.br/api/ml/callback`
- (mesmo pra Shopee e webhooks)

Faça novo deploy após mudar.

---

## 🔌 Passo 7: Conectar ML + Shopee

### 7.1) Mercado Livre
1. Acesse `https://seu-dominio.com.br/admin/mercado-livre`
2. Clique "Conectar Nova Conta"
3. Faça login e autorize
4. Sistema puxa seus produtos automaticamente

### 7.2) Shopee
1. Acesse `https://seu-dominio.com.br/admin/shopee`
2. Clique "Conectar"
3. Autorize
4. Sistema puxa produtos

### 7.3) Webhooks
**ML:**
1. Acesse https://www.mercadolivre.com.br/jm/mla/notifications
2. URL: `https://api.seu-dominio.com.br/api/ml/webhook`
3. Marque: Orders, Items

**Shopee:**
1. App Settings > Webhook
2. URL: `https://api.seu-dominio.com.br/api/shopee/webhook`
3. Marque: Order Status, Item Update

---

## 🖼️ Passo 8: Configurar Asaas (PIX)

### 8.1) Criar conta
1. asaas.com/cadastro
2. Conta empresarial (PJ)
3. Aguardar aprovação (1-3 dias)

### 8.2) Webhook
1. Integrações > Webhooks
2. URL: `https://api.seu-dominio.com.br/api/payment/webhook`
3. Evento: `PAYMENT_RECEIVED` + `PAYMENT_OVERDUE`
4. Copie o token e atualize `ASAAS_WEBHOOK_TOKEN` no Vercel

---

## 📄 Passo 9: Configurar Focus NFe (NF-e)

### 9.1) Upload do certificado
1. focusnfe.com.br > Configurações > Certificados
2. Upload do A1 (.pfx) + senha

### 9.2) Teste em homologação
1. Configure `FOCUS_NFE_ENV=homologation` primeiro
2. Emita uma NF-e de teste (venda de R$ 1)
3. Confira no portal da SEFAZ
4. Quando funcionar, mude pra `FOCUS_NFE_ENV=production`

---

## 🗂️ Passo 10: Vincular site premiumshine.com.br

### 10.1) Gerar API Key
1. Acesse `https://api.seu-dominio.com.br/admin/api-keys`
2. Clique "+ Nova Chave"
3. Nome: "Site Premium Shine"
4. Origens: `https://premiumshine.com.br`
5. Escopos: read:products, write:orders
6. Copie a chave gerada

### 10.2) Colar widget no site
No `<head>` ou antes do `</body>` do site atual:
```html
<script src="https://api.seu-dominio.com.br/widget.js"></script>
<script>
  PremiumShine.init({
    apiKey: 'psh_live_SUA_CHAVE_AQUI',
    apiUrl: 'https://api.seu-dominio.com.br',
    containerId: 'catalogo',
    mode: 'catalog'
  })
</script>
<div id="catalogo"></div>
```

---

## ✅ Checklist Final

Antes de sair em produção, verifique:

- [ ] Banco Supabase funcionando (testou SELECT)
- [ ] Site Vercel respondendo
- [ ] Login do admin funciona
- [ ] Vendedoras de teste conseguem logar
- [ ] Afiliados conseguem se cadastrar
- [ ] Catálogo com 528 produtos
- [ ] ML conectado e produtos sincronizados
- [ ] Shopee conectado e produtos sincronizados
- [ ] Webhooks ML e Shopee funcionando
- [ ] Cron de sync rodando (ver /admin/cron-logs)
- [ ] PIX sendo gerado (faz compra teste)
- [ ] NF-e emitindo (faz emissão teste)
- [ ] Site premiumshine.com.br mostrando catálogo
- [ ] Widget de rastreio funcionando
- [ ] DRE mensal sendo gerado (aguarde dia 1)
- [ ] Senhas de admin trocadas
- [ ] .env com credenciais reais (não test)
- [ ] CORS configurado pro seu domínio
- [ ] Backup automático do Supabase ativado

---

## 🆘 Problemas Comuns

### "Erro de conexão com banco"
- Verifique se `DATABASE_URL` está correto
- Confirme que rodou o schema no Supabase

### "Login não funciona"
- Limpe cookies
- Rode o seed novamente
- Verifique se `NEXTAUTH_SECRET` está setado

### "Cron não roda"
- Vercel Cron é grátis até 1x/dia
- Para cada hora, precisa plano Pro
- Veja os logs em /admin/cron-logs

### "Upload de foto falha"
- Verifique credenciais R2
- Confirme que bucket tem permissão de escrita

### "ML/Shopee não conecta"
- Verifique se app foi aprovado
- Confirme que redirect URI é EXATAMENTE igual
- Tokens podem estar expirados — reconecte

---

## 💰 Custos Estimados Mensais

| Serviço | Custo |
|---------|-------|
| Vercel (Hobby) | **Grátis** |
| Supabase (Free tier) | **Grátis** |
| Cloudflare R2 (10GB) | **Grátis** |
| Mercado Pago (não usado) | - |
| Asaas (PIX) | R$0,00 (PIX é grátis) |
| Focus NFe | R$0,10 por NF-e emitida |
| Cloudflare DNS | **Grátis** |
| **Total mensal** | **R$ 5-15** (depende de NFs) |

**Para 1000 vendas/mês com 500 NFs:** ~R$ 50/mês

---

## 📞 Suporte

- **Documentação completa:** Está toda na pasta `/docs/`
- **Issues no GitHub:** https://github.com/SEU_USER/premium-shine-hub/issues
- **Email:** suporte@premiumshine.com.br

---

**Boa sorte com o lançamento! 🚀**
