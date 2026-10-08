export const SHOPEE_HOSTS: Record<string, string> = {
  BR: 'https://openplatform.shopee.com.br',
  SG: 'https://openplatform.shopee.sg',
  MY: 'https://openplatform.shopee.com.my',
  TH: 'https://openplatform.shopee.co.th',
  PH: 'https://openplatform.shopee.ph',
  TW: 'https://openplatform.shopee.tw',
  ID: 'https://openplatform.shopee.co.id',
  VN: 'https://openplatform.shopee.vn',
}

export const SHOPEE_AUTH_URL = 'https://partner.shopeemobile.com/api/v1/shop/auth_partner'
export const SHOPEE_TOKEN_URL = 'https://openplatform.shopee.com.br/api/v1/auth/token/get'

export const PLUGIN_MANIFEST = {
  id: 'shopee',
  name: 'Shopee Integration',
  version: '1.0.0',
  description: 'Sincroniza vendas do Shopee (Open API ou CSV)',
  author: 'Premium Shine Hub',
  type: 'marketplace',
  scopes: ['orders:read', 'products:read'],
  endpoints: [
    { method: 'GET', path: '/api/plugins/shopee/install', desc: 'Mostra config' },
    { method: 'POST', path: '/api/plugins/shopee/install', desc: 'Instala com credenciais' },
    { method: 'GET', path: '/api/plugins/shopee/sync', desc: 'Puxa vendas' },
    { method: 'GET', path: '/api/plugins/shopee/oauth', desc: 'OAuth flow' },
    { method: 'POST', path: '/api/plugins/shopee/webhook', desc: 'Recebe notificação' },
  ],
}
