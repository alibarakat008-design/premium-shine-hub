/**
 * =====================================================
 * HELPERS DE PRODUTOS — Funções auxiliares
 * =====================================================
 * Este arquivo é um helper, não uma rota. As funções aqui
 * são usadas internamente pelos endpoints de /api/products/
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Produtos em destaque + com estoque
export async function getFeaturedProducts() {
  return await prisma.products.findMany({
    where: {
      ativo: true,
      destaque: true,
      inventory: { quantidade_atual: { gt: 0 } },
    },
    include: {
      brands: { select: { nome: true } },
      categories: { select: { nome: true, slug: true } },
      inventory: { select: { quantidade_atual: true } },
      product_prices: { where: { canal: 'site_b2c' }, select: { preco_venda: true } },
    },
    take: 12,
    orderBy: { updated_at: 'desc' },
  })
}

// Alerta de produtos com estoque baixo
export async function getLowStockProducts() {
  return await prisma.$queryRaw`
    SELECT
      p.id,
      p.sku,
      p.nome,
      p.foto_principal_url,
      b.nome as marca,
      i.quantidade_atual,
      i.quantidade_minima,
      (i.quantidade_minima - i.quantidade_atual) as deficit
    FROM products p
    JOIN brands b ON p.marca_id = b.id
    JOIN inventory i ON p.id = i.product_id
    WHERE i.quantidade_atual <= i.quantidade_minima
    AND p.ativo = true
    ORDER BY i.quantidade_atual ASC
  `
}

// Busca por família olfativa
export async function getProductsByNotes(familia?: string | null, nota?: string | null) {
  const where: any = { ativo: true }

  if (familia) {
    where.notas_olfativas = {
      path: ['familia'],
      string_contains: familia,
    }
  }

  if (nota) {
    where.OR = [
      { notas_olfativas: { path: ['topo'], string_contains: nota } },
      { notas_olfativas: { path: ['coracao'], string_contains: nota } },
      { notas_olfativas: { path: ['base'], string_contains: nota } },
    ]
  }

  return await prisma.products.findMany({
    where,
    include: {
      brands: { select: { nome: true } },
      product_prices: { where: { canal: 'site_b2c' } },
    },
    take: 50,
  })
}

// Mais vendidos
export async function getBestsellers(limit: number = 20, days: number = 30) {
  return await prisma.$queryRaw`
    SELECT
      p.id,
      p.sku,
      p.nome,
      p.foto_principal_url,
      b.nome as marca,
      SUM(oi.quantidade)::INTEGER as total_vendido,
      SUM(oi.preco_total)::DECIMAL as receita_total,
      COUNT(DISTINCT oi.order_id)::INTEGER as pedidos_distintos
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN brands b ON p.marca_id = b.id
    WHERE o.created_at > NOW() - INTERVAL '${days} days'
    AND o.status NOT IN ('cancelado', 'devolvido')
    GROUP BY p.id, p.sku, p.nome, p.foto_principal_url, b.nome
    ORDER BY total_vendido DESC
    LIMIT ${limit}
  `
}
