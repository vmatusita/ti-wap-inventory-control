import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const problemasImportEAcesso: PaginaAjuda = {
  slug: 'problemas-import-e-acesso',
  titulo: 'Problemas de import e de acesso',
  resumo: 'Arquivo recusado, senha perdida, sessão expirada.',
  categoria: 'resolver',
  termos: [
    'nao entra',
    'senha',
    'expirou',
    'arquivo',
    'recusou',
    'login',
    'convite',
    'email',
    'visualizador',
    'importar',
    'csv',
    'xlsx',
  ],
  blocos: [
    { tipo: 'titulo', id: 'problemas-import', texto: 'O import de startup' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'O sistema recusou meu arquivo logo no envio.',
          causa:
            'Antes de ler qualquer linha, o import confere formato, tamanho e conteúdo mínimo do arquivo. A recusa acontece na hora, com a mensagem embaixo do campo "Arquivo (CSV ou Excel .xlsx)".',
          saida: [
            '"O arquivo precisa ter extensão .csv ou .xlsx." — salve a planilha em um dos dois. O .xlsx é o recomendado: preserva as datas e os acentos que o CSV do Excel costuma corromper.',
            `"O arquivo tem X MB — o limite é ${TAMANHO_MAX_ROTULO}." — confira se você não enviou um export inteiro do sistema antigo no lugar do inventário de uma filial.`,
            '"O arquivo está vazio." — o download veio truncado; exporte de novo.',
            '"Não foi possível ler o arquivo. Confira o CSV/Excel e tente de novo." — abra a planilha e confirme que a primeira linha é o cabeçalho.',
            '"Filial inativa: import bloqueado." — reative a filial em Administração › Filiais antes de recomeçar.',
          ],
        },
        {
          sintoma: 'O preview mostra "Import bloqueado" e o botão não avança.',
          causa:
            'Bloqueante (vermelho) impede aplicar; aviso (âmbar) não impede. O arquivo enviado nunca é alterado — a correção acontece na tela e a análise se refaz sozinha a cada mudança.',
          saida: [
            'A barra do topo conta "N bloqueantes · N avisos · N linhas removidas · N correções". Abra a lista "Bloqueantes (N)" e resolva de cima para baixo.',
            'Use "Baixar lista de erros (CSV)" para levar os problemas à planilha de origem, ou "Baixar CSV corrigido" para guardar o arquivo já com as correções da tela.',
            'Se a mensagem for "Nenhum ativo a criar", o arquivo não tem nenhuma linha aproveitável — confira se é o inventário da filial certa.',
            'Se for sobre termos que misturam filiais, resolva os termos listados em "Termos multi-filial (N)" antes de substituir.',
            'Trocar de arquivo no meio do caminho é normal: o botão "Trocar arquivo" recomeça a análise sem sair do assistente.',
          ],
        },
        {
          sintoma: 'Cliquei em "Substituir tudo" e deu erro — perdi o acervo da filial?',
          causa:
            'Não. A substituição é tudo-ou-nada e o backup do acervo é gravado ANTES de qualquer apagamento: se qualquer etapa falhar, nada é alterado.',
          saida: [
            '"A importação demorou demais e foi cancelada — tente novamente ou avise o TI." — nada mudou; tente de novo, de preferência fora do horário de pico.',
            '"O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar." — alguém mexeu naquela filial enquanto você confirmava. Reanalise e reaplique.',
            '"A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI." — o sistema reconferiu o que gravou, não fechou e desfez sozinho. Na segunda ocorrência com o mesmo arquivo, pare e avise o TI.',
            'Depois de um import concluído, o backup do acervo substituído fica disponível em "Baixar backup", na tela de resultado e na linha do "Histórico de imports".',
          ],
        },
      ],
    },
    { tipo: 'titulo', id: 'problemas-acesso', texto: 'Entrar, convidar e visualizar' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'O sistema me pediu login de novo no meio do trabalho.',
          causa: 'As sessões expiram em 24 horas, para o operador e para o visualizador.',
          saida: [
            'Refaça o login com o seu e-mail corporativo.',
            'Se você estava montando um lote de movimentação, o rascunho daquela aba continua lá.',
            'A contagem é a partir do login, não do último clique: renovar a página não estende o prazo.',
            'Quem entra pela senha de acesso volta para a tela de senha e, depois de entrar, cai direto no relatório que estava tentando abrir.',
          ],
        },
        {
          sintoma: 'Errei a senha no login e a mensagem sumiu antes de eu ler.',
          causa:
            'O aviso passageiro no canto some sozinho — por isso o erro do login também fica ESCRITO embaixo do formulário, e continua lá enquanto a tela estiver aberta.',
          saida: [
            'Olhe abaixo do botão "Entrar": a mensagem ("E-mail ou senha inválidos", "Sua sessão expirou, entre novamente." ou a falha de confirmação do link) fica visível.',
            'Sem a senha, não há autoatendimento: peça a um administrador para gerar um novo link de acesso, como diz o rodapé da tela.',
          ],
        },
        {
          sintoma: 'Convidei uma pessoa e ela diz que não recebeu nenhum e-mail.',
          causa:
            'O convite NÃO sai por e-mail. O sistema gera um link na própria tela para você entregar pelo canal que quiser — é assim por desenho, não é falha de envio.',
          saida: [
            'Em Administração › Usuários, "Convidar usuário": informe o e-mail e clique em "Gerar link".',
            'A tela "Convite gerado — copie o link" traz o botão "Copiar". Mande o link pelo WhatsApp, Teams ou e-mail seu.',
            'A pessoa abre o link e clica em "Ativar meu acesso"; em seguida informa nome, sobrenome e a senha. Quem já tinha conta vê "Continuar" e confere o nome antes de definir a nova senha.',
            'O link vale por tempo limitado. Se expirar, gere outro — nada do que a pessoa já fez se perde. Uma prévia do link no WhatsApp ou no Teams não o invalida: só o clique em ativar consome o link.',
            `Se o botão não habilitar, é o domínio: só e-mails ${DOMINIOS_TEXTO} são aceitos.`,
          ],
        },
        {
          sintoma: 'A pessoa entrou com a senha de acesso e não consegue ver os ativos.',
          causa:
            'É o comportamento esperado. A senha de acesso dá acesso SOMENTE aos relatórios: qualquer outro endereço leva à tela de login. Ela não é uma conta.',
          saida: [
            'Quem entra por senha vê o relatório ao vivo e os relatórios gerados, com o cabeçalho reduzido ("Ao vivo" e "Gerados") e a pílula "Visualização · {rótulo da senha}".',
            'Nesse acesso não existem: menu lateral, ficha do ativo, seção de Pendências dentro do relatório, atalhos de teclado, busca global, esta documentação e o controle de tema — a tela sai no visual claro.',
            'Se a pessoa precisa mesmo abrir fichas e registrar movimentação, ela não é visualizadora: convide-a como operadora, com o e-mail corporativo.',
            'As explicações de que ela precisa estão dentro do próprio relatório, nas legendas e na seção "Como ler este relatório".',
          ],
        },
        {
          sintoma: 'Perdi a senha de acesso dos relatórios que eu tinha criado.',
          causa:
            'A senha aparece UMA única vez, no momento em que é criada ("Esta é a única vez que a senha aparece."). Depois disso o sistema guarda só a forma cifrada — ninguém, nem o administrador, consegue lê-la de volta.',
          saida: [
            'Crie outra em Administração › Senhas de acesso, com "Nova senha": dê um "Rótulo" que identifique quem vai usar e copie a senha na hora.',
            'Revogue a antiga pelo botão "Revogar" da linha. Quem usava aquela senha perde o acesso no carregamento seguinte.',
            'Revogou por engano? "Reativar" devolve a mesma senha ao ar, sem precisar redistribuir nada.',
            'A coluna "Último uso" ajuda a descobrir quais senhas ainda circulam antes de revogar.',
          ],
        },
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'acesso-e-sessoes' },
        { slug: 'import-de-startup' },
        { slug: 'usuarios-e-senhas' },
        { slug: 'mensagens-de-erro' },
        { slug: 'problemas-comuns' },
      ],
    },
  ],
}
