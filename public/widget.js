/**
 * =====================================================
 * WIDGET PREMIUM SHINE — Embed no site
 * =====================================================
 * Cole este <script> no site premiumshine.com.br
 * Mostra catálogo + carrinho + checkout
 *
 * Como usar:
 *   1) Pegue a API Key em /admin/configuracoes/api-keys
 *   2) Cole este código antes do </body> do site:
 *
 *   <script src="https://api.premiumshine.com.br/widget.js"></script>
 *   <script>
 *     PremiumShine.init({
 *       apiKey: 'psh_live_SUA_CHAVE_AQUI',
 *       apiUrl: 'https://api.premiumshine.com.br',
 *       containerId: 'premiumshine-catalogo',
 *       mode: 'full', // 'full' | 'catalog' | 'cart'
 *     })
 *   </script>
 * =====================================================
 */

(function () {
  'use strict'

  // ===== CONFIGURAÇÃO =====
  let config = {
    apiKey: '',
    apiUrl: '',
    containerId: 'premiumshine-catalogo',
    mode: 'catalog', // catalog | cart | full
  }

  // ===== ESTADO =====
  let state = {
    produtos: [],
    carrinho: JSON.parse(localStorage.getItem('psh_cart') || '[]'),
    categoriaAtiva: null,
    busca: '',
  }

  // ===== API HELPER =====
  async function api(path, options = {}) {
    const res = await fetch(config.apiUrl + path, {
      ...options,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro na requisição')
    }
    return res.json()
  }

  // ===== RENDERIZAÇÃO =====
  function render() {
    const container = document.getElementById(config.containerId)
    if (!container) return

    if (config.mode === 'catalog' || config.mode === 'full') {
      container.innerHTML = renderCatalogo()
      attachCatalogoEvents(container)
    }
  }

  function renderCatalogo() {
    const produtos = state.produtos
    return `
      <div class="psh-widget">
        <style>
          .psh-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1200px; margin: 0 auto; }
          .psh-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
          .psh-search { flex: 1; max-width: 400px; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; }
          .psh-cart-icon { position: relative; cursor: pointer; padding: 10px 16px; background: #2563eb; color: white; border-radius: 8px; border: none; font-size: 14px; }
          .psh-cart-count { background: #ef4444; color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; position: absolute; top: -5px; right: -5px; }
          .psh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
          .psh-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: transform 0.2s; cursor: pointer; }
          .psh-card:hover { transform: translateY(-4px); }
          .psh-card-img { width: 100%; aspect-ratio: 1/1; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden; }
          .psh-card-img img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .psh-card-body { padding: 12px; }
          .psh-card-marca { color: #888; font-size: 11px; text-transform: uppercase; }
          .psh-card-nome { color: #1a1a2e; font-size: 14px; font-weight: 600; margin: 4px 0; min-height: 40px; }
          .psh-card-preco { color: #2563eb; font-size: 1.3em; font-weight: 700; }
          .psh-card-preco-promo { color: #16a34a; font-size: 1.3em; font-weight: 700; }
          .psh-card-preco-antigo { text-decoration: line-through; color: #888; font-size: 0.85em; }
          .psh-card-btn { width: 100%; padding: 8px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-top: 8px; }
          .psh-card-btn:hover { background: #1d4ed8; }
          .psh-card-btn:disabled { background: #ccc; cursor: not-allowed; }
          .psh-sem-estoque { color: #ef4444; font-size: 12px; text-align: center; padding: 8px; }
        </style>
        <div class="psh-header">
          <input
            type="text"
            class="psh-search"
            placeholder="🔍 Buscar perfumes..."
            value="${state.busca}"
            oninput="window.PremiumShine.buscar(this.value)"
          />
          <button class="psh-cart-icon" onclick="window.PremiumShine.abrirCarrinho()">
            🛒 Carrinho
            ${state.carrinho.length > 0 ? `<span class="psh-cart-count">${state.carrinho.length}</span>` : ''}
          </button>
        </div>
        <div class="psh-grid">
          ${produtos.map(produto => renderCard(produto)).join('')}
        </div>
        ${produtos.length === 0 ? '<p style="text-align:center; color:#888; padding:40px;">Carregando produtos...</p>' : ''}
      </div>
    `
  }

  function renderCard(p) {
    const emEstoque = p.em_estoque
    const temPromo = p.preco_promocional && p.preco_promocional < p.preco
    return `
      <div class="psh-card">
        <div class="psh-card-img">
          ${p.foto
            ? `<img src="${p.foto}" alt="${p.nome}" />`
            : '<span style="font-size:3em; opacity:0.3;">🌸</span>'}
        </div>
        <div class="psh-card-body">
          <div class="psh-card-marca">${p.marca}${p.volume ? ' · ' + p.volume : ''}</div>
          <div class="psh-card-nome">${p.nome}</div>
          <div>
            ${temPromo
              ? `<span class="psh-card-preco-antigo">R$ ${p.preco.toFixed(2)}</span><br/>
                 <span class="psh-card-preco-promo">R$ ${p.preco_promocional.toFixed(2)}</span>`
              : `<span class="psh-card-preco">R$ ${p.preco.toFixed(2)}</span>`}
          </div>
          ${emEstoque
            ? `<button class="psh-card-btn" onclick="window.PremiumShine.adicionarCarrinho('${p.sku}', 1)">Adicionar ao Carrinho</button>`
            : '<div class="psh-sem-estoque">Sem estoque</div>'}
        </div>
      </div>
    `
  }

  function attachCatalogoEvents(container) {
    // Eventos já são inline
  }

  // ===== AÇÕES PÚBLICAS =====
  window.PremiumShine = {
    init: async function (opts) {
      config = { ...config, ...opts }

      if (!config.apiKey || !config.apiUrl) {
        console.error('PremiumShine: apiKey e apiUrl são obrigatórios')
        return
      }

      // Carregar produtos
      try {
        const res = await api('/api/public/catalogo?limite=100')
        state.produtos = res.data || []
        render()
      } catch (err) {
        console.error('PremiumShine erro:', err)
        document.getElementById(config.containerId).innerHTML =
          '<p style="color:red; text-align:center; padding:20px;">Erro ao carregar catálogo. Verifique a API Key.</p>'
      }
    },

    buscar: function (texto) {
      state.busca = texto
      // Filtrar localmente (rápido) ou re-fetch
      const filtrados = state.produtos.filter(p =>
        !texto || p.nome.toLowerCase().includes(texto.toLowerCase()) ||
        p.marca.toLowerCase().includes(texto.toLowerCase())
      )

      const container = document.getElementById(config.containerId)
      if (container) {
        const grid = container.querySelector('.psh-grid')
        if (grid) grid.innerHTML = filtrados.map(renderCard).join('')
      }
    },

    adicionarCarrinho: function (sku, quantidade) {
      const produto = state.produtos.find(p => p.sku === sku)
      if (!produto) return

      const itemExistente = state.carrinho.find(i => i.sku === sku)
      if (itemExistente) {
        itemExistente.quantidade += quantidade
      } else {
        state.carrinho.push({
          sku,
          nome: produto.nome,
          foto: produto.foto,
          preco: produto.preco_promocional || produto.preco,
          quantidade,
        })
      }
      localStorage.setItem('psh_cart', JSON.stringify(state.carrinho))
      render()
    },

    abrirCarrinho: function () {
      // Você pode implementar modal aqui
      const carrinho = state.carrinho
      if (carrinho.length === 0) {
        alert('Carrinho vazio')
        return
      }
      const total = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
      const texto = carrinho.map(i => `${i.quantidade}x ${i.nome} — R$ ${(i.preco * i.quantidade).toFixed(2)}`).join('\n')
      alert(`Carrinho:\n\n${texto}\n\nTotal: R$ ${total.toFixed(2)}\n\n(Implementar modal de checkout real)`)
    },

    // Para checkout, redirecione para sua página de checkout
    checkout: async function (dadosCheckout) {
      try {
        const res = await api('/api/public/checkout', {
          method: 'POST',
          body: JSON.stringify(dadosCheckout),
        })
        return res
      } catch (err) {
        console.error('Erro no checkout:', err)
        throw err
      }
    },
  }
})()
