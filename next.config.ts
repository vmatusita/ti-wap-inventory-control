import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docxtemplater/pizzip são libs CJS de Node (usadas só server-side em
  // src/lib/actions/termos.ts). Mantê-las externas evita que o bundler quebre
  // seus require dinâmicos.
  serverExternalPackages: ["docxtemplater", "pizzip"],
  // Os templates .docx são lidos do filesystem em runtime (readFile). Garante que
  // sejam empacotados nas funções serverless das rotas que geram termos.
  outputFileTracingIncludes: {
    "/movimentacoes/nova": ["./src/templates/termos/**"],
    "/ativos/[id]": ["./src/templates/termos/**"],
  },
};

export default nextConfig;
