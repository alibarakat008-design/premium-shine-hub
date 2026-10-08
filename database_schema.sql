-- =====================================================
-- PREMIUM SHINE HUB — BANCO DE DADOS POSTGRESQL
-- Versão: 1.0
-- Data: 2026-06-08
-- Stack: Node.js + PostgreSQL + Next.js
-- =====================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. EMPRESAS / CNPJs
-- =====================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    inscricao_estadual VARCHAR(50),
    endereco JSONB, -- {logradouro, numero, cidade, estado, cep}
    telefone VARCHAR(20),
    email VARCHAR(255),
    ativa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 2. USUÁRIOS (Admin, Sellers, Vendedoras, Afiliados)
-- =====================================================
CREATE TYPE user_role AS ENUM ('admin', 'seller', 'vendedora', 'afiliado');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    cpf_cnpj VARCHAR(18),
    role user_role NOT NULL,
    avatar_url TEXT,
    ativo BOOLEAN DEFAULT true,
    -- Dados específicos por role
    seller_data JSONB, -- {comissao_pct, meta_mensal, parent_seller_id}
    vendedora_data JSONB, -- {comissao_pct, meta_mensal, supervisor_id}
    afiliado_data JSONB, -- {comissao_pct, slug, pix_key, saldo}
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- =====================================================
-- 3. MARCAS
-- =====================================================
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) UNIQUE NOT NULL,
    descricao TEXT,
    logo_url TEXT,
    ativa BOOLEAN DEFAULT true,
    -- Configurações de precificação por marca
    margem_minima_pct DECIMAL(5,2) DEFAULT 20.00, -- margem mínima para produtos dessa marca
    is_marca_propria BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 4. CATEGORIAS
-- =====================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id UUID REFERENCES categories(id), -- subcategorias
    icone VARCHAR(50),
    ordem INTEGER DEFAULT 0,
    ativa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 5. FORNECEDORES
-- =====================================================
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18),
    contato_nome VARCHAR(255),
    contato_telefone VARCHAR(20),
    contato_email VARCHAR(255),
    endereco JSONB,
    prazo_entrega_dias INTEGER DEFAULT 7,
    pedido_minimo_valor DECIMAL(10,2),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 6. PRODUTOS (Catálogo central)
-- =====================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    ean VARCHAR(20),
    nome VARCHAR(255) NOT NULL,
    descricao_curta TEXT,
    descricao_completa TEXT,
    marca_id UUID REFERENCES brands(id),
    categoria_id UUID REFERENCES categories(id),
    fornecedor_id UUID REFERENCES suppliers(id),
    genero VARCHAR(20), -- 'masculino', 'feminino', 'unissex'
    volume VARCHAR(50), -- '15ml', '200ml', etc
    ncm VARCHAR(20),
    -- Notas olfativas
    notas_olfativas JSONB, -- {familia, topo, coracao, base, inspiracao}
    -- Mídia
    foto_principal_url TEXT,
    fotos_adicionais TEXT[], -- array de URLs
    -- Controle
    ativo BOOLEAN DEFAULT true,
    destaque BOOLEAN DEFAULT false,
    -- Datas
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_ean ON products(ean);
CREATE INDEX idx_products_marca ON products(marca_id);
CREATE INDEX idx_products_categoria ON products(categoria_id);
CREATE INDEX idx_products_ativo ON products(ativo);

-- =====================================================
-- 7. PREÇOS POR CANAL
-- =====================================================
CREATE TYPE canal_venda AS ENUM ('mercado_livre', 'shopee', 'site_b2c', 'whatsapp', 'b2b', 'vendedora');

CREATE TABLE product_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    canal canal_venda NOT NULL,
    company_id UUID REFERENCES companies(id), -- empresa responsável (CNPJ)
    custo DECIMAL(10,2), -- custo de aquisição
    preco_venda DECIMAL(10,2) NOT NULL,
    preco_promocional DECIMAL(10,2),
    margem_pct DECIMAL(5,2),
    -- Para preço dinâmico
    preco_minimo DECIMAL(10,2), -- piso
    preco_maximo DECIMAL(10,2), -- teto
    preco_dinamico_ativo BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id, canal, company_id)
);

-- =====================================================
-- 8. ESTOQUE (Único centralizado)
-- =====================================================
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) UNIQUE,
    quantidade_atual INTEGER NOT NULL DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 15, -- alerta de reestoque
    quantidade_maxima INTEGER,
    -- Localização
    localizacao_fisica VARCHAR(100), -- 'Prateleira A3', 'Galpão 2', etc
    -- Custos
    custo_medio DECIMAL(10,2), -- custo médio ponderado
    -- Controle
    ultima_entrada TIMESTAMP,
    ultima_saida TIMESTAMP,
    -- Lote
    lote VARCHAR(50),
    data_fabricacao DATE,
    data_validade DATE,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low ON inventory(quantidade_atual) WHERE quantidade_atual <= 15;

-- =====================================================
-- 9. MOVIMENTAÇÕES DE ESTOQUE
-- =====================================================
CREATE TYPE mov_tipo AS ENUM ('entrada', 'saida', 'ajuste', 'transferencia', 'reserva', 'liberacao');

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    tipo mov_tipo NOT NULL,
    quantidade INTEGER NOT NULL, -- positivo entrada, negativo saída
    estoque_anterior INTEGER,
    estoque_posterior INTEGER,
    -- Origem
    origem_tipo VARCHAR(50), -- 'compra_fornecedor', 'venda_ml', 'venda_shopee', 'venda_b2c', 'ajuste_manual'
    origem_id UUID, -- ID do pedido, compra, etc
    -- Contexto
    user_id UUID REFERENCES users(id),
    observacao TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mov_product ON inventory_movements(product_id);
CREATE INDEX idx_mov_tipo ON inventory_movements(tipo);
CREATE INDEX idx_mov_created ON inventory_movements(created_at);

-- =====================================================
-- 10. RESERVAS DE ESTOQUE (por canal/pedido)
-- =====================================================
CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    quantidade INTEGER NOT NULL,
    -- Pedido que está reservando
    order_id UUID, -- FK para orders (definido abaixo)
    canal canal_venda,
    expira_em TIMESTAMP NOT NULL, -- reservas expiram em 24h
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 11. INTEGRAÇÕES MARKETPLACE (Multi-contas)
-- =====================================================
CREATE TABLE marketplace_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plataforma VARCHAR(50) NOT NULL, -- 'mercado_livre', 'shopee'
    company_id UUID REFERENCES companies(id), -- qual CNPJ
    -- Identificação
    account_id VARCHAR(100), -- ID da conta no ML/Shopee
    nickname VARCHAR(255), -- nome da conta
    -- OAuth
    access_token TEXT,
    refresh_token TEXT,
    token_expira_em TIMESTAMP,
    -- Status
    ativa BOOLEAN DEFAULT true,
    ultima_sincronizacao TIMESTAMP,
    -- Configurações
    config JSONB, -- {categorias_padrao, logistica_padrao, etc}
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 12. PRODUTOS NOS MARKETPLACES (vinculação)
-- =====================================================
CREATE TABLE marketplace_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    account_id UUID REFERENCES marketplace_accounts(id),
    -- Identificação no marketplace
    listing_id VARCHAR(100) NOT NULL, -- ID do anúncio no ML/Shopee
    permalink TEXT, -- URL do anúncio
    -- Status
    status VARCHAR(50), -- 'active', 'paused', 'closed'
    -- Preço atual (pode ser diferente do product_prices se fixo)
    preco_atual DECIMAL(10,2),
    -- Métricas
    vendas_total INTEGER DEFAULT 0,
    views_total INTEGER DEFAULT 0,
    -- Última sync
    last_sync_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(account_id, listing_id)
);

-- =====================================================
-- 13. PEDIDOS (vendas de qualquer canal)
-- =====================================================
CREATE TYPE order_status AS ENUM ('pendente', 'confirmado', 'separado', 'enviado', 'entregue', 'cancelado', 'devolvido');
CREATE TYPE order_origem AS ENUM ('mercado_livre', 'shopee', 'site_b2c', 'whatsapp', 'b2b', 'vendedora');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Identificação
    order_number VARCHAR(50) UNIQUE, -- número visível pro cliente (#1234)
    origem order_origem NOT NULL,
    -- Conta que vendeu
    company_id UUID REFERENCES companies(id),
    marketplace_account_id UUID REFERENCES marketplace_accounts(id), -- se for ML/Shopee
    -- Quem vendeu (seller/vendedora/afiliado/admin)
    vendedor_id UUID REFERENCES users(id),
    afiliado_id UUID REFERENCES users(id), -- se veio de link de afiliado
    -- Cliente
    customer_id UUID REFERENCES customers(id),
    -- Status
    status order_status DEFAULT 'pendente',
    -- Valores
    subtotal DECIMAL(10,2) NOT NULL,
    desconto DECIMAL(10,2) DEFAULT 0,
    frete DECIMAL(10,2) DEFAULT 0,
    embalagem DECIMAL(10,2) DEFAULT 0, -- upsell de embalagem
    total DECIMAL(10,2) NOT NULL,
    custo_total DECIMAL(10,2), -- CMV (custo da mercadoria vendida)
    lucro_bruto DECIMAL(10,2), -- total - custo_total
    lucro_liquido DECIMAL(10,2), -- depois de taxas
    -- Endereço entrega
    endereco_entrega JSONB,
    -- Logística
    codigo_rastreio VARCHAR(100),
    transportadora VARCHAR(100),
    previsao_entrega DATE,
    data_envio TIMESTAMP,
    data_entrega TIMESTAMP,
    -- Comissões
    comissao_seller_pct DECIMAL(5,2),
    comissao_seller_valor DECIMAL(10,2),
    comissao_vendedora_pct DECIMAL(5,2),
    comissao_vendedora_valor DECIMAL(10,2),
    comissao_afiliado_pct DECIMAL(5,2),
    comissao_afiliado_valor DECIMAL(10,2),
    -- Pagamento
    forma_pagamento VARCHAR(50),
    payment_id VARCHAR(100), -- ID no gateway (Mercado Pago, etc)
    pago_em TIMESTAMP,
    -- Datas
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_origem ON orders(origem);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_vendedor ON orders(vendedor_id);
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- =====================================================
-- 14. ITENS DO PEDIDO
-- =====================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    -- Snapshot do produto (caso mude depois)
    sku VARCHAR(50),
    nome_produto VARCHAR(255),
    foto_url TEXT,
    -- Quantidade e valores
    quantidade INTEGER NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,
    preco_total DECIMAL(10,2) NOT NULL,
    custo_unitario DECIMAL(10,2), -- CMV do item
    -- Embalagem premium escolhida
    embalagem_id UUID REFERENCES packaging_options(id)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- =====================================================
-- 15. CLIENTES
-- =====================================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    telefone VARCHAR(20),
    cpf VARCHAR(14),
    -- Endereços
    enderecos JSONB, -- array de endereços
    endereco_padrao JSONB,
    -- Métricas
    total_pedidos INTEGER DEFAULT 0,
    total_gasto DECIMAL(10,2) DEFAULT 0,
    ultima_compra TIMESTAMP,
    -- Tags
    tags TEXT[], -- ['VIP', 'newsletter', 'aniversario_janeiro']
    -- Origem do lead
    origem_lead VARCHAR(50), -- 'organico', 'afiliado_joana', 'ml', 'indicacao'
    -- Consentimento LGPD
    consentimento_marketing BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 16. EMBALAGENS PREMIUM (Upsell)
-- =====================================================
CREATE TABLE packaging_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    foto_url TEXT,
    custo DECIMAL(10,2) NOT NULL,
    preco_cliente DECIMAL(10,2) NOT NULL,
    margem DECIMAL(10,2) GENERATED ALWAYS AS (preco_cliente - custo) STORED,
    estoque INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 17. METAS E BONIFICAÇÕES (Vendedoras)
-- =====================================================
CREATE TABLE seller_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id), -- vendedora
    mes_ano VARCHAR(7), -- '2026-06'
    meta_valor DECIMAL(10,2),
    meta_quantidade INTEGER,
    -- Bônus por bater meta
    bonus_pct DECIMAL(5,2), -- ex: 5% extra
    bonus_valor DECIMAL(10,2), -- ou valor fixo
    -- Realizado
    valor_realizado DECIMAL(10,2) DEFAULT 0,
    quantidade_realizada INTEGER DEFAULT 0,
    bateu_meta BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 18. COMISSÕES PAGAS (controle financeiro)
-- =====================================================
CREATE TABLE commissions_paid (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tipo VARCHAR(20), -- 'seller', 'vendedora', 'afiliado'
    mes_referencia VARCHAR(7), -- '2026-06'
    valor_total DECIMAL(10,2),
    valor_pago DECIMAL(10,2),
    data_pagamento TIMESTAMP,
    forma_pagamento VARCHAR(50),
    comprovante_url TEXT,
    observacao TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 19. LINKS DE AFILIADOS
-- =====================================================
CREATE TABLE affiliate_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    afiliado_id UUID REFERENCES users(id),
    product_id UUID REFERENCES products(id), -- NULL = link geral
    slug VARCHAR(50) UNIQUE NOT NULL, -- ex: 'joana123-asad-15ml'
    url_completa TEXT,
    cliques INTEGER DEFAULT 0,
    vendas INTEGER DEFAULT 0,
    comissao_gerada DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 20. COMPRAS DE FORNECEDOR
-- =====================================================
CREATE TYPE purchase_status AS ENUM ('sugerida', 'aprovada', 'enviada', 'recebida', 'cancelada');

CREATE TABLE supplier_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id),
    company_id UUID REFERENCES companies(id),
    status purchase_status DEFAULT 'sugerida',
    -- Valores
    valor_total DECIMAL(10,2),
    previsao_entrega DATE,
    data_pedido TIMESTAMP,
    data_recebimento TIMESTAMP,
    -- Pagamento
    condicao_pagamento VARCHAR(100), -- '30/60/90 dias', 'à vista', etc
    -- Origem
    sugerido_por_bi BOOLEAN DEFAULT false, -- foi sugestão automática?
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE supplier_purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID REFERENCES supplier_purchases(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantidade INTEGER NOT NULL,
    custo_unitario DECIMAL(10,2),
    custo_total DECIMAL(10,2)
);

-- =====================================================
-- 21. FLUXO DE CAIXA
-- =====================================================
CREATE TYPE cashflow_type AS ENUM ('entrada', 'saida');

CREATE TABLE cashflow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    tipo cashflow_type NOT NULL,
    categoria VARCHAR(50), -- 'venda', 'fornecedor', 'comissao', 'imposto', 'frete', 'embalagem', 'marketing'
    descricao TEXT,
    valor DECIMAL(10,2) NOT NULL,
    -- Vinculação
    order_id UUID REFERENCES orders(id),
    purchase_id UUID REFERENCES supplier_purchases(id),
    -- Status
    realizado BOOLEAN DEFAULT false,
    data_prevista DATE,
    data_realizada DATE,
    -- Conta
    conta_bancaria VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cashflow_company ON cashflow(company_id);
CREATE INDEX idx_cashflow_data ON cashflow(data_prevista);
CREATE INDEX idx_cashflow_tipo ON cashflow(tipo);

-- =====================================================
-- 22. NOTAS FISCAIS
-- =====================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    order_id UUID REFERENCES orders(id),
    numero VARCHAR(50),
    chave_acesso VARCHAR(50),
    tipo VARCHAR(10), -- 'NFe', 'NFCe'
    -- Arquivos
    xml_url TEXT,
    pdf_url TEXT,
    -- Status
    status VARCHAR(20), -- 'autorizada', 'cancelada', 'rejeitada'
    valor_total DECIMAL(10,2),
    emitida_em TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 23. HISTÓRICO DE PREÇOS (BI Preditivo)
-- =====================================================
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    canal canal_venda,
    company_id UUID REFERENCES companies(id),
    preco DECIMAL(10,2) NOT NULL,
    motivo VARCHAR(100), -- 'manual', 'dinamico_estoque', 'dinamico_demanda', 'promocao'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_price_history_product ON price_history(product_id);
CREATE INDEX idx_price_history_created ON price_history(created_at);

-- =====================================================
-- 24. PREVISÕES DE VENDA (BI Preditivo)
-- =====================================================
CREATE TABLE sales_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id), -- NULL = previsão geral
    marca_id UUID REFERENCES brands(id), -- NULL = não é específico
    periodo VARCHAR(7), -- '2026-07'
    -- Previsões
    vendas_previstas INTEGER,
    receita_prevista DECIMAL(10,2),
    -- Confiança do modelo (0-100)
    confianca_pct DECIMAL(5,2),
    -- Modelo usado
    modelo VARCHAR(50), -- 'random_forest', 'prophet', 'media_movel'
    -- Sugestão de compra gerada
    compra_sugerida INTEGER,
    -- Realizado depois (pra treinar o modelo)
    vendas_reais INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 25. ALERTAS DO SISTEMA
-- =====================================================
CREATE TABLE system_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50), -- 'estoque_baixo', 'produto_parado', 'meta_batida', 'caixa_negativo'
    severidade VARCHAR(20), -- 'info', 'warning', 'critical'
    titulo VARCHAR(255),
    mensagem TEXT,
    -- Referência
    product_id UUID REFERENCES products(id),
    user_id UUID REFERENCES users(id),
    -- Status
    lido BOOLEAN DEFAULT false,
    resolvido BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 26. AUDITORIA / LOG
-- =====================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    acao VARCHAR(100), -- 'create', 'update', 'delete', 'login'
    tabela VARCHAR(50),
    registro_id UUID,
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- =====================================================
-- 27. CONFIGURAÇÕES DO SISTEMA
-- =====================================================
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chave VARCHAR(100) UNIQUE NOT NULL,
    valor JSONB,
    descricao TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inserir configs padrão
INSERT INTO system_config (chave, valor, descricao) VALUES
('preco_dinamico.ativo_canal', '{"site_b2c": true, "whatsapp": true, "mercado_livre": false, "shopee": false, "b2b": false}', 'Canais onde preço dinâmico se aplica'),
('estoque.alerta_minimo', '15', 'Quantidade mínima para gerar alerta'),
('meta_padrao.vendedor.valor', '5000', 'Meta padrão mensal de vendedoras em R$'),
('comissao_padrao.afiliado_pct', '10', '% padrão de comissão de afiliados'),
('whatsapp.numero_empresa', 'null', 'Número do WhatsApp Business da empresa');

-- =====================================================
-- 28. TABELA DE PRECIFICAÇÃO POR CANAL (Regras de negócio)
-- =====================================================
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id), -- NULL = regra geral
    marca_id UUID REFERENCES brands(id), -- NULL = não é específico
    canal canal_venda,
    company_id UUID REFERENCES companies(id),
    -- Regra
    tipo_regra VARCHAR(50), -- 'preco_fixo', 'markup_sobre_custo', 'desconto_percentual'
    valor_regra DECIMAL(10,2),
    -- Vigência
    data_inicio DATE,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- VIEWS ÚTEIS
-- =====================================================

-- View: Dashboard de Vendas Consolidado
CREATE OR REPLACE VIEW vw_dashboard_vendas AS
SELECT
    DATE_TRUNC('day', o.created_at) as dia,
    o.origem,
    o.company_id,
    COUNT(*) as total_pedidos,
    SUM(o.total) as faturamento,
    SUM(o.custo_total) as custo_total,
    SUM(o.lucro_liquido) as lucro_total,
    AVG(o.total) as ticket_medio
FROM orders o
WHERE o.status NOT IN ('cancelado', 'devolvido')
GROUP BY DATE_TRUNC('day', o.created_at), o.origem, o.company_id;

-- View: P&L por Marca
CREATE OR REPLACE VIEW vw_pl_por_marca AS
SELECT
    b.id as marca_id,
    b.nome as marca,
    DATE_TRUNC('month', o.created_at) as mes,
    COUNT(DISTINCT o.id) as total_pedidos,
    SUM(oi.quantidade) as total_unidades,
    SUM(oi.preco_total) as receita,
    SUM(oi.custo_unitario * oi.quantidade) as cmv,
    SUM(oi.preco_total - (oi.custo_unitario * oi.quantidade)) as lucro_bruto
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
JOIN products p ON oi.product_id = p.id
JOIN brands b ON p.marca_id = b.id
WHERE o.status NOT IN ('cancelado', 'devolvido')
GROUP BY b.id, b.nome, DATE_TRUNC('month', o.created_at);

-- View: Produtos Estagnados
CREATE OR REPLACE VIEW vw_produtos_estagnados AS
SELECT
    p.id,
    p.sku,
    p.nome,
    b.nome as marca,
    i.quantidade_atual,
    MAX(o.created_at) as ultima_venda,
    EXTRACT(DAY FROM (NOW() - MAX(o.created_at))) as dias_sem_venda
FROM products p
JOIN brands b ON p.marca_id = b.id
LEFT JOIN inventory i ON p.id = i.product_id
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id
WHERE p.ativo = true
GROUP BY p.id, p.sku, p.nome, b.nome, i.quantidade_atual
HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days' OR MAX(o.created_at) IS NULL;

-- View: Alerta de Estoque
CREATE OR REPLACE VIEW vw_alerta_estoque AS
SELECT
    p.id,
    p.sku,
    p.nome,
    b.nome as marca,
    i.quantidade_atual,
    i.quantidade_minima,
    (i.quantidade_minima - i.quantidade_atual) as deficit,
    -- Cobertura em dias
    CASE
        WHEN media_vendas.vendas_dia > 0
        THEN i.quantidade_atual / media_vendas.vendas_dia
        ELSE 999
    END as cobertura_dias
FROM products p
JOIN brands b ON p.marca_id = b.id
JOIN inventory i ON p.id = i.product_id
LEFT JOIN (
    SELECT
        oi.product_id,
        AVG(oi.quantidade)::DECIMAL / 30 as vendas_dia
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at > NOW() - INTERVAL '30 days'
    AND o.status NOT IN ('cancelado', 'devolvido')
    GROUP BY oi.product_id
) media_vendas ON p.id = media_vendas.product_id
WHERE i.quantidade_atual <= i.quantidade_minima
AND p.ativo = true;

-- =====================================================
-- DADOS INICIAIS (SEED)
-- =====================================================

-- Empresas
INSERT INTO companies (cnpj, razao_social, nome_fantasia) VALUES
('12.345.678/0001-90', 'Premium Shine Cosméticos LTDA', 'Premium Shine'),
('98.765.432/0001-54', 'Liura Essence ME', 'Liura Essence'),
('45.678.123/0001-32', 'Atacado Brilho EIRELI', 'Atacado Brilho');

-- Marcas
INSERT INTO brands (nome, is_marca_propria) VALUES
('ISABELLE LA BELLE', false),
('POKOLOKA', false),
('BARBOUR''S', false),
('CICLO', false),
('PINK KALI', false),
('KOKESHI', false),
('TIKBALM', false),
('LAB 8', false),
('MISS ROSE', false),
('SUELEN', false),
('BRAZINCO', false),
('VIZZELA', false),
('MARIA MARGARIDA', false),
('DEISY PEROZZO', false),
('PREMIUM SHINE', true); -- Sua marca própria

-- Categorias
INSERT INTO categories (nome, slug) VALUES
('Body Splash', 'body-splash'),
('Perfume Capilar', 'perfume-capilar'),
('Hidratante', 'hidratante'),
('Perfume', 'perfume'),
('Kit', 'kit'),
('Acessório', 'acessorio'),
('Skincare', 'skincare');

-- Usuário admin padrão
INSERT INTO users (email, password_hash, nome, role) VALUES
('admin@premiumshine.com.br', '$2b$10$placeholder_hash_change_on_first_login', 'Admin Premium Shine', 'admin');

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
-- Total: 28 tabelas + 4 views + 5 configs iniciais
-- Pronto para usar com Node.js + Next.js
-- =====================================================
