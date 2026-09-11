import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docxtemplater/pizzip são libs CJS de Node (usadas só server-side em
  // src/lib/actions/termos.ts). exceljs é lib de Node (zip/zlib) usada só
  // server-side no leitor de .xlsx do import (src/lib/import/xlsx.ts, F7G).
  // Mantê-las externas evita que o bundler quebre seus require dinâmicos.
  serverExternalPackages: ["docxtemplater", "pizzip", "exceljs"],
  // F7F / F56 (Frente C, fato 22, Decisão 6) — o "Substituir tudo" (admin/importar)
  // envia o plano JÁ serializado à Server Action `aplicarImport`.
  //
  // ⚠ CORRIGIDO NA F56: este comentário dizia "8 MB dá >10x de folga" contra o
  // teto PADRÃO de 1 MB do Next. Isso ignorava o limite de quem hospeda: a Vercel
  // corta pedido E RESPOSTA de qualquer Function em 4,5 MB — ANTES do Next sequer
  // rodar (`413 FUNCTION_PAYLOAD_TOO_LARGE`, doc "Vercel Functions Limits") —, e
  // 8 MB configurados aqui só valeriam no `next dev`/hospedagem própria: em
  // produção a Vercel recusaria em 4,5 MB de qualquer forma, sem o Next nunca
  // saber (nem log, nem `import_logs`). `bodySizeLimit` agora é o MESMO nº de
  // bytes de `LIMITE_CORPO_PLATAFORMA` (`src/lib/import/limites.ts`), para o
  // `next dev` local se comportar como produção. O nº aceita bytes OU string
  // (`'500kb'`/`'3mb'`) — doc local: `node_modules/next/dist/docs/01-app/
  // 03-api-reference/05-config/01-next-config-js/serverActions.md`. Os cinco
  // corpos que atravessam este limite (os três pedidos e as duas respostas de
  // `validarImport`/`baixarCsvCorrigido`) estão medidos, com folga ≥ 1,5×, em
  // `docs/f56-evidencias/C2-conta-dos-corpos.txt`. Cap do arquivo bruto: 1 MB
  // (`TAMANHO_MAX_ARQUIVO`).
  experimental: {
    serverActions: {
      bodySizeLimit: 4_500_000,
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
