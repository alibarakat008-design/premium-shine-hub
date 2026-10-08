import { redirect } from 'next/navigation'

// Redireciona automaticamente pro DRE completo (dre-mensal)
// Mantido só por compatibilidade de URL antiga
export default function DRERedirect() {
  redirect('/admin/financeiro/dre-mensal')
}
