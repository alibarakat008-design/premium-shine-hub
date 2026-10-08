# 📚 Manual de Uso — Premium Shine Hub

Guia completo pra você usar o sistema no dia-a-dia.

---

## 🚀 Primeiros Passos

### 1. Login como Admin
- URL: `https://seu-dominio.com.br/login`
- Email: `admin@premiumshine.com.br`
- Senha: a que você definiu (se usou o seed: `admin123456`)
- **⚠️ TROQUE A SENHA IMEDIATAMENTE** (em Configurações > Perfil)

### 2. Visão geral do Dashboard
Ao logar, você vê:
- **Cards de KPIs** — faturamento, pedidos, ticket médio, alertas
- **Gráfico de vendas** dos últimos 7 dias
- **Vendas por canal** — ML, Shopee, WhatsApp, Site, B2B
- **Top 5 mais vendidos** da semana
- **Alertas** — produtos críticos, metas batidas, etc
- **P&L por marca**
- **Últimos pedidos**
- **Status das integrações** (ML, Shopee)

---

## 📦 Módulo 1: Catálogo de Produtos

### Como cadastrar um produto novo
1. Vá em **Produtos** (menu lateral)
2. Clique **+ Novo Produto**
3. Preencha:
   - **SKU** (código único, ex: `ISABELLE-ASAD-15ML`)
   - **EAN** (se tiver, código de barras)
   - **Nome** (ex: "ASAD - Perfume 15ml")
   - **Marca** (selecione do dropdown)
   - **Categoria**
   - **Gênero** (Masculino, Feminino, Unissex)
   - **Volume** (15ml, 200ml, etc)
   - **NCM** (geralmente 33030000 pra cosméticos)
4. **Notas olfativas** (essa é a parte que destaca você!):
   - **Família** — Oriental, Floral, Amadeirado, Cítrico...
   - **Topo** — Bergamota, Lavanda, Pimenta...
   - **Coração** — Rosa, Jasmim, Âmbar...
   - **Base** — Baunilha, Sândalo, Almíscar...
   - **Inspiração** — qual perfume original (ex: "Lattafa Asad")
5. **Foto principal** — arraste e solte (ou clique pra selecionar)
6. **Preços por canal** (Mercado Livre, Shopee, Site, etc)
7. **Estoque inicial**
8. Marque "⭐ Destaque" se quiser que apareça na home
9. Clique **Criar Produto**

### Como editar um produto
1. Vá em **Produtos**
2. Clique no produto (ou busque)
3. Você verá 4 abas:
   - **🌸 Informações** — notas olfativas, descrição
   - **💰 Preços** — valores por canal
   - **📦 Estoque** — quantidade, mínimo, custo médio
   - **📊 Vendas** — histórico, top clientes
4. No topo tem botões:
   - **⭐ Marcar/Remover destaque** (toggle rápido)
   - **✏️ Editar** (vai pra formulário de edição)
   - **🗑️ Desativar** (soft delete)

### Como fazer upload de foto em massa
- Vá em **Produtos** > selecione vários > **Upload em massa**
- (Funcionalidade adicional — pode ser feita via API)

---

## 🏪 Módulo 2: Mercado Livre

### Conectar sua conta
1. Vá em **Mercado Livre** (menu lateral)
2. Clique **+ Conectar Nova Conta**
3. Você será redirecionado pro ML
4. Faça login e autorize o app
5. Sistema volta com confirmação
6. Status muda para 🟢 Online

### Sincronizar produtos
1. Na página do ML, clique **🔄 Sincronizar Produtos**
2. Sistema puxa todos os seus produtos do ML
3. Cria novos ou atualiza existentes
4. **Tempo:** depende da quantidade (100 produtos = ~30s)

### Sincronizar pedidos
1. Clique **📦 Sincronizar Pedidos**
2. Sistema puxa vendas dos últimos 7 dias
3. Cria pedidos no sistema
4. **Baixa estoque automaticamente**
5. Aparece no dashboard consolidado

### Atualizar estoque do sistema → ML
- Automático via webhook (venda no sistema empurra pro ML)
- Manual: no detalhe do produto, clique "Push to ML"

### Tokens expirados
- Sistema renova automaticamente (6h de validade)
- Se aparecer "Token expirado", reconecte a conta

---

## 🛒 Módulo 3: Shopee

Similar ao Mercado Livre:
1. **Shopee** (menu lateral) > **+ Conectar**
2. Autoriza o app
3. **Sincroniza produtos** e **pedidos**

Diferenças:
- Token expira em 4h (sistema renova)
- API é mais restritiva (100 req/min)
- Preço vem em centavos (sistema já converte)

---

## 📋 Módulo 4: Pedidos

### Ver todos os pedidos
1. **Pedidos** (menu lateral)
2. Você vê tabela consolidada com:
   - **Filtros**: canal, status, busca por cliente
   - **Stats**: faturamento, custo, lucro, ticket médio
   - **Lista** de pedidos de todos os canais

### Status dos pedidos
- **🟡 Pendente** — Aguardando pagamento
- **🔵 Confirmado** — Pago, aguardando separação
- **🟣 Separado** — Produtos separados
- **🌸 Enviado** — Postado nos Correios/transportadora
- **🟢 Entregue** — Cliente recebeu
- **🔴 Cancelado** — Pedido cancelado

### Mudar status de um pedido
1. Clique no pedido
2. No topo, botões de ação:
   - **✓ Confirmar** (pendente → confirmado)
   - **📦 Marcar como Separado** (confirmado → separado)
   - **🚚 Marcar como Enviado** (separado → enviado)
   - **✅ Marcar como Entregue** (enviado → entregue)
   - **❌ Cancelar** (voltar estoque)

### Adicionar código de rastreio
1. No detalhe do pedido
2. Preencha "Transportadora" + "Código de Rastreio"
3. Sistema gera link público automaticamente
4. Cliente acessa `/rastreio/BR123` pra ver status

---

## 👩‍💼 Módulo 5: Vendedoras

### Cadastrar nova vendedora
1. **Vendedoras** (menu lateral) > **+ Nova**
2. Preencha:
   - Nome, email, telefone, CPF
   - Senha (pra ela logar)
   - **Comissão** (padrão 10% — ajustável)
   - **Meta mensal** (padrão R$ 5.000)
   - **Bônus** por bater meta (5% se 100%, 10% se 150%)
   - **Chave PIX** (pra pagar ela)
   - **Supervisor** (opcional, pra hierarquia)
3. Salvar

### Como a vendedora usa
- Login em `/vendedora` (com email e senha)
- Dashboard mostra:
  - Vendas do mês
  - Meta (com barra de progresso)
  - Comissão ganha
  - Ranking
  - Botão "Fazer Pedido"

### Pagar comissões
- Manual: admin acessa `/admin/comissoes`
- Lista todas as comissões pendentes
- Marca como "pago" e adiciona comprovante

### Ranking
- Atualiza diariamente às 6h
- Top 3 recebem badge (🥇🥈🥉)
- Top 1 do mês ganha prêmio especial

---

## 🔗 Módulo 6: Afiliados

### Como alguém vira afiliado
1. Acessa `/afiliado/cadastro`
2. Preenche: nome, email, slug (apelido único)
3. Define a chave PIX (pra receber pagamentos)
4. Sistema gera link único: `premiumshine.com.br/?ref=joana123`
5. Pronto pra divulgar!

### Dashboard do afiliado
- Login em `/afiliado`
- Vê:
  - Saldo disponível (mínimo R$ 50 pra saque)
  - Total de vendas atribuídas
  - Comissão total ganha
  - Links personalizados
  - Banner pronto pra Instagram/WhatsApp
  - Ranking

### Como funciona o tracking
1. Cliente clica no link `?ref=joana123`
2. Sistema marca cookie de 30 dias
3. Cliente navega, adiciona ao carrinho, compra
4. Sistema atribui a venda à Joana
5. Comissão é creditada após confirmação de pagamento

### Saque via PIX
- Afiliado clica "💸 Sacar via PIX"
- Sistema cria solicitação
- Admin recebe alerta
- Admin faz o PIX manualmente
- Saldo é zerado

---

## 💰 Módulo 7: Financeiro

### DRE Mensal
- Gerado automaticamente dia 1 de cada mês
- Salvo como PDF no Google Drive
- Notificação por email com link
- Disponível em `/admin/financeiro` (em construção)

### Fluxo de Caixa
- Previsto em 30/60/90 dias
- Baseado em:
  - Vendas passadas
  - Contas a pagar
  - Compras de fornecedor pendentes
  - Comissões a pagar

### P&L por Marca
- Mostra qual marca dá mais lucro
- Compare ISABELLE vs POKOLOKA vs SUA MARCA
- Use pra decidir qual comprar mais

### Custo do produto
- Atualiza automaticamente quando você dá entrada de estoque
- Custo médio ponderado
- Cálculo de margem automático

---

## 🏢 Módulo 8: Empresas (CNPJs)

Você tem 3 CNPJs configurados:
- **Premium Shine** (CNPJ 1)
- **Liura Essence** (CNPJ 2)
- **Atacado Brilho** (CNPJ 3)

Cada venda é automaticamente vinculada ao CNPJ correto baseado na conta de marketplace usada.

---

## ⚙️ Módulo 9: Configurações

### API Keys (pra site externo)
- **Admin** > **Configurações** > **API Keys**
- Gera chave por site
- Limita por domínio (origem)
- Pode revogar a qualquer momento

### Webhooks
- Configure as URLs nos painéis do ML/Shopee/Asaas
- Sistema valida automaticamente

### Cron Jobs
- Veja em `/admin/cron-logs`
- Cada job tem horário fixo
- Monitora execuções

---

## 📊 Relatórios e Analytics

### Relatórios disponíveis
- Vendas por período (dia, semana, mês)
- Vendas por canal
- Vendas por marca
- Vendas por vendedor(a)
- Vendas por afiliado
- Top produtos
- Clientes top
- P&L por marca
- DRE mensal

### Como exportar
- (Funcionalidade adicional — pode ser feita via API)
- `GET /api/orders?format=csv` (em construção)

---

## 🔧 Solução de Problemas

### Estoque negativo
- Indica que vendeu mais do que tinha
- **Causa:** venda manual sem estoque
- **Solução:** ajustar manualmente, criar pedido de compra

### Produto com preço R$ 0
- Significa que não cadastrou preço nesse canal
- Vá em **Produtos** > **Preços** > preencha o que falta

### Venda não apareceu
- Verifique se a integração está conectada
- Clique "Sincronizar Pedidos"
- Veja logs em `/admin/cron-logs`

### Afiliado não recebe comissão
- Verifique se cookie foi marcado (acessou pelo link)
- Compra deve acontecer em até 30 dias
- Venda não pode ser cancelada
- Pagamento precisa ser confirmado

### Estoque não baixou
- Verifique se produto tem vínculo com listing
- Logs em `/admin/inventory` (em construção)

---

## 📱 Atalhos do Teclado

- `/` — Volta ao dashboard
- `/p` — Produtos
- `/pedidos` — Pedidos
- `/ml` — Mercado Livre
- `/shopee` — Shopee
- `/vendedoras` — Vendedoras
- `/afiliados` — Afiliados

---

## 🆘 Precisa de ajuda?

- **Documentação completa:** Pasta `/docs/`
- **Guias de homologação:** ML e Shopee
- **Logs de erro:** Vercel Dashboard > Logs
- **Banco de dados:** Supabase Dashboard > SQL Editor

---

**Bom uso! 🚀**
