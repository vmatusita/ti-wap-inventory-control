import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docxtemplater/pizzip são libs CJS de Node (usadas só server-side em
  // src/lib/actions/termos.ts). exceljs é lib de Node (zip/zlib) usada só
  // server-side no leitor de .xlsx do import (src/lib/import/xlsx.ts, F7G).
  // Mantê-las externas evita que o bundler quebre seus require dinâmicos.
  serverExternalPackages: ["docxtemplater", "pizzip", "exceljs"],
  // F7F — o "Substituir tudo" (admin/importar) envia o plano JÁ serializado à
  // Server Action `aplicarImport`. Um plano de ~1.200 ativos (maior filial real)
  // serializa em ~0,7 MB (plano + correções, medido) — abaixo, mas perto do teto
  // PADRÃO de 1 MB do Next para Server Actions. Um inventário maior ou observações
  // longas passariam de 1 MB e o Next devolveria HTTP 413 ANTES da action rodar
  // (silencioso). 8 MB dá >10x de folga sobre o pior caso medido, ainda longe de
  // qualquer abuso. Chave/formato confirmados na doc do Next 16 (serverActions
  // bodySizeLimit; aceita '500kb'/'3mb'/'8mb' ou bytes). Cap do CSV bruto segue 5 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // Os templates .docx são lidos do filesystem em runtime (readFile). Garante que
  // sejam empacotados nas funções serverless das rotas que geram termos.
  outputFileTracingIncludes: {
    "/movimentacoes/nova": ["./src/templates/termos/**"],
    "/ativos/[id]": ["./src/templates/termos/**"],
    // F22 — o bloco Diagnóstico da /dev lê `supabase/migrations` do disco em runtime para
    // mostrar a última migration ESCRITA no repositório ao lado da versão REGISTRADA no
    // banco. O caminho é montado em runtime, então o rastreamento de arquivos do Next não o
    // enxerga e a pasta não iria no pacote serverless. Sem esta linha a tela não quebra (a
    // leitura está em try/catch e a versão do banco continua aparecendo), mas o campo sai
    // como "indisponível" — que é exatamente o sintoma que ele existe para desmentir.
    "/dev": ["./supabase/migrations/**"],
  },
};

export default nextConfig;
