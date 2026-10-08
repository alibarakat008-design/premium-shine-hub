export interface MenuItem { href: string; label: string; emoji: string; unavailable?: boolean }
export interface MenuGroup { label: string; items: MenuItem[]; collapsible?: boolean; defaultCollapsed?: boolean }

// Match whole path segments: /devolucao must not select /devolucoes.
export const matchesRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + '/')

export const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()

export const ADMIN_MENU: MenuGroup[] = [
  {
    "label": "Início",
    "items": [
      {
        "href": "/admin/dashboard",
        "label": "Visão geral",
        "emoji": "📊"
      }
    ],
    "collapsible": false,
    "defaultCollapsed": false
  },
  {
    "label": "Catálogo",
    "items": [
      {
        "href": "/admin/marcas",
        "label": "Produtos",
        "emoji": "🏪"
      },
      {
        "href": "/admin/promocoes",
        "label": "Promoções",
        "emoji": "🎉"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Operação",
    "items": [
      {
        "href": "/admin/folha-controle",
        "label": "Folha Controle",
        "emoji": "📋"
      },
      {
        "href": "/admin/etiquetas",
        "label": "Etiquetas",
        "emoji": "🏷️"
      },
      {
        "href": "/admin/devolucao",
        "label": "Devolução",
        "emoji": "🔄"
      },
      {
        "href": "/admin/importar-nota",
        "label": "Importar Nota",
        "emoji": "📥"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Financeiro",
    "items": [
      {
        "href": "/admin/financeiro",
        "label": "Resumo financeiro",
        "emoji": "💰"
      },
      {
        "href": "/admin/gestao-financeira",
        "label": "Gestão financeira",
        "emoji": "📈"
      },
      {
        "href": "/admin/notas-de-compra",
        "label": "Notas de Compra",
        "emoji": "📋"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Ferramentas",
    "items": [
      {
        "href": "/admin/ia-respostas",
        "label": "Assistente de Respostas IA",
        "emoji": "🤖"
      },
      {
        "href": "/admin/simulador",
        "label": "Simulador",
        "emoji": "🧮"
      },
      {
        "href": "/admin/imagem",
        "label": "Imagem",
        "emoji": "🖼️"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Administração",
    "items": [
      {
        "href": "/admin/equipe",
        "label": "Equipe",
        "emoji": "👥"
      },
      {
        "href": "/admin/ml-contas",
        "label": "Contas de marketplaces",
        "emoji": "📡"
      },
      {
        "href": "/admin/empresas",
        "label": "Empresas",
        "emoji": "🏢"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  }
]

export const PARCEIRO_MENU: MenuGroup[] = [
  {
    "label": "Início",
    "items": [
      {
        "href": "/admin/dashboard-parceiro",
        "label": "Meu Dashboard",
        "emoji": "📊"
      }
    ],
    "collapsible": false,
    "defaultCollapsed": false
  },
  {
    "label": "Vendas",
    "items": [
      {
        "href": "/admin/vendas-ao-vivo",
        "label": "Minhas Vendas",
        "emoji": "🔴"
      },
      {
        "href": "/admin/importar",
        "label": "Importar ML",
        "emoji": "📥"
      },
      {
        "href": "/admin/importar-shopee",
        "label": "Importar Shopee",
        "emoji": "🛍️"
      },
      {
        "href": "/admin/devolucoes",
        "unavailable": true,
        "label": "Devoluções",
        "emoji": "🔄"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Catálogo e estoque",
    "items": [
      {
        "href": "/admin/marcas",
        "label": "Catálogo + Produtos",
        "emoji": "🏷️"
      },
      {
        "href": "/admin/meus-produtos",
        "unavailable": true,
        "label": "Meus Produtos",
        "emoji": "🏷️"
      },
      {
        "href": "/admin/catalogo-produtos",
        "label": "Catálogo Produtos",
        "emoji": "🛍️"
      },
      {
        "href": "/admin/estoque-depositos",
        "unavailable": true,
        "label": "Estoque Depósitos",
        "emoji": "📦"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Financeiro",
    "items": [
      {
        "href": "/admin/meus-custos",
        "label": "Meus Custos",
        "emoji": "💰"
      },
      {
        "href": "/admin/custos-notas",
        "label": "Notas de Compra",
        "emoji": "📋"
      },
      {
        "href": "/admin/notas-compra",
        "unavailable": true,
        "label": "Importar NF-e (XML)",
        "emoji": "📄"
      },
      {
        "href": "/admin/rentabilidade",
        "label": "Rentabilidade",
        "emoji": "📈"
      },
      {
        "href": "/admin/top-produtos",
        "label": "Top Produtos",
        "emoji": "🏆"
      },
      {
        "href": "/admin/cobertura-custos",
        "unavailable": true,
        "label": "Cobertura Custos",
        "emoji": "🎯"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Operação",
    "items": [
      {
        "href": "/admin/verificacao-etiquetas",
        "unavailable": true,
        "label": "Verif. Etiquetas",
        "emoji": "✅"
      },
      {
        "href": "/admin/extrair-sku-pdf",
        "unavailable": true,
        "label": "Checklist por SKU",
        "emoji": "📄"
      },
      {
        "href": "/admin/checklist-marketplace",
        "unavailable": true,
        "label": "Checklist MP",
        "emoji": "📝"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Ferramentas",
    "items": [
      {
        "href": "/admin/whatsapp",
        "unavailable": false,
        "label": "WhatsApp",
        "emoji": "📱"
      },
      {
        "href": "/admin/simulador",
        "label": "Simulador",
        "emoji": "🧮"
      },
      {
        "href": "/admin/imagem",
        "label": "Imagem",
        "emoji": "🖼️"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  },
  {
    "label": "Minha conta",
    "items": [
      {
        "href": "/admin/integracoes",
        "label": "Integrações",
        "emoji": "🔌"
      },
      {
        "href": "/admin/plugins",
        "label": "Plugins",
        "emoji": "🧩"
      },
      {
        "href": "/admin/conectar-minha-conta-ml",
        "label": "Conectar Mercado Livre",
        "emoji": "🔗"
      },
      {
        "href": "/admin/conectar-minha-conta-shopee",
        "label": "Conectar Shopee",
        "emoji": "🛍️"
      },
      {
        "href": "/admin/extension-shopee",
        "unavailable": true,
        "label": "Extensão Shopee (Token)",
        "emoji": "🧩"
      }
    ],
    "collapsible": true,
    "defaultCollapsed": true
  }
]

