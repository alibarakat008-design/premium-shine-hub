/**
 * =====================================================
 * AUTENTICAÇÃO — NextAuth.js
 * Premium Shine Hub
 * =====================================================
 *
 * Mantido pra compat com o sistema antigo (admin/vendedoras/afiliados).
 * Parceiros usam o sistema novo em lib/auth-parceiro.ts.
 */

import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.nome = user.nome
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        ;(session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).nome = token.nome
      }
      return session
    },
  },
}