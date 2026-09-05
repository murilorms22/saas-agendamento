/**
 * Lista de palavras e rotas reservadas do sistema.
 * Impede que slugs de profissionais colidam com rotas estáticas ou de API.
 */
export const RESERVED_SLUGS = [
  "admin",
  "login",
  "api",
  "auth",
  "termos",
  "privacidade",
  "dashboard",
  "app",
  "configuracoes",
  "agenda",
  "resumo",
  "usuario",
  "static",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
] as const;

/**
 * Verifica se uma string corresponde a um slug reservado do sistema.
 */
export function isReservedSlug(slug?: string | null): boolean {
  if (!slug) return false;
  const limpo = slug.trim().toLowerCase();
  return (RESERVED_SLUGS as readonly string[]).includes(limpo);
}
