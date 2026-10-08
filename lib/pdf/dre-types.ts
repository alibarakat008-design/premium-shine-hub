// Types para DRE
export interface DREData {
  periodo: { inicio: string; fim: string }
  receita_bruta: number
  deducoes: number
  receita_liquida: number
  cmv: number
  lucro_bruto: number
  despesas_operacionais: {
    comissoes: number
    marketing: number
    frete: number
    impostos: number
    outras: number
    total: number
  }
  lucro_operacional: number
  margem_liquida: number
}
