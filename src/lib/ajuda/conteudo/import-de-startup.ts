import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: o teto de tamanho do arquivo vem de `TAMANHO_MAX_ROTULO` — o
// MESMO rotulo que o passo "Upload" mostra e que a mensagem de recusa repete.

export const importDeStartup: PaginaAjuda = {
  slug: 'import-de-startup',
  titulo: 'Import de startup de uma filial',
  resumo: 'O go-live de uma filial por arquivo, no modo Substituir tudo.',
  categoria: 'fazer',
  termos: [
    'import',
    'importar',
    'planilha',
    'xlsx',
    'excel',
    'csv',
    'substituir',
    'go-live',
    'preview',
    'correcao',
    'backup',
  ],
  legado: ['admin', 'como-fazer'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'A entrada do dia a dia é 100% manual — não há sincronização com o Excel. A única importação é o import de startup em Administração › Importar: só o modo "Substituir tudo", que troca o acervo inteiro de UMA filial por um arquivo (CSV ou Excel .xlsx), no go-live dela. O .xlsx é o recomendado: preserva as datas (sem "#######" nem mês abreviado sem ano) e os acentos que o CSV do Excel costuma corromper. Ele mostra o custo, faz backup automático e exige que você digite o nome da filial antes de aplicar. No preview, cada erro se corrige na própria tela (o CSV original não muda); os avisos (em âmbar, como o patrimônio ausente) não bloqueiam a importação.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Use o import na VIRADA de uma filial: aquela que ainda controlava tudo em planilha e vai passar a operar no sistema. Não use para acertar o dia a dia — equipamento novo entra por "Novo equipamento", equipamento que mudou de filial entra por uma transferência, e o patrimônio errado se corrige na ficha do ativo.',
    },

    { tipo: 'titulo', id: 'import-limites', texto: 'O que o import NÃO faz' },
    {
      tipo: 'lista',
      itens: [
        'Não atualiza nem completa um acervo existente: o único modo é "Substituir tudo", que apaga o acervo atual da filial (ativos, linha do tempo, termos e anotações) e recria tudo a partir do arquivo.',
        'Não roda em duas filiais de uma vez: um import é sempre de UMA filial, escolhida no passo 1. Linha do arquivo que aponta para outra filial não entra.',
        'Não move equipamento de filial. Se uma linha traz um aparelho que já tem cadastro em OUTRA filial, ela importa mesmo assim — e os dois cadastros passam a existir, com um aviso âmbar no preview e um "conflito entre filiais" esperando em Pendências, onde os dois aparecem lado a lado para alguém decidir qual é o certo. Mudança real de filial é uma transferência registrada pelo sistema, que preserva o histórico.',
        'Não é rotina: não há agendamento nem sincronização recorrente com planilha.',
        'Não apaga relatório: snapshots de relatório já congelados permanecem como estão.',
        `Não é de todo mundo: importar é a ação mais destrutiva do sistema, e só os cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev} a alcançam — a aba, a confirmação e a própria gravação recusam quem tem outro cargo, com "Esta ação é restrita a administradores.". Quem rodou cada import fica registrado.`,
      ],
    },

    { tipo: 'titulo', id: 'import-passos', texto: 'O caminho, do arquivo ao acervo' },
    {
      tipo: 'passos',
      titulo: 'Importar o acervo de uma filial (Substituir tudo)',
      itens: [
        'Vá a Administração › Importar. O cartão "Importar acervo por arquivo" mostra os cinco passos no topo: "Configurar" › "Upload" › "Preview" › "Confirmar" › "Resultado".',
        'Passo "Configurar": escolha a "Filial". A caixa "Substituir tudo — go-live da filial" repete o que vai acontecer. Use "Avançar".',
        `Passo "Upload": o campo é "Arquivo (CSV ou Excel .xlsx)" e o limite é ${TAMANHO_MAX_ROTULO}. Prefira o .xlsx. Use "Analisar arquivo" — o botão vira "Analisando…" enquanto o sistema lê tudo.`,
        'Passo "Preview": leia a barra do topo — "{n} bloqueantes · {n} avisos · {n} linhas removidas · {n} correções", mais "{n} conflitos entre filiais" quando houver — e corrija o que estiver vermelho (abaixo). Nada foi alterado ainda.',
        'Ainda no preview, confira o CUSTO: os números grandes dizem quantos "ativos a criar" e, em vermelho, quantos "ativos a apagar", "movimentações a apagar", "anotações a apagar" e "termos a apagar". Esse é o preço da substituição.',
        'Com a faixa verde "Pronto para aplicar" na tela, use "Avançar". Se quiser trocar de arquivo, "Trocar arquivo" volta ao upload.',
        'Passo "Confirmar": a faixa "Esta ação é irreversível" repete as contagens e avisa que um backup do acervo é gravado antes. Digite o nome da filial no campo "Digite {nome da filial} para confirmar" — tem de ser exatamente igual — e use "Substituir tudo".',
        'Passo "Resultado": aparece "Import concluído para {filial}." com os números do que foi criado e apagado. Use "Baixar backup" e guarde o arquivo, depois "Ver ativos da filial" para conferir.',
      ],
    },

    { tipo: 'titulo', id: 'import-preview', texto: 'Ler o preview: vermelho × âmbar' },
    {
      tipo: 'nota',
      texto:
        'São dois níveis, e eles não se misturam. VERMELHO é bloqueante: enquanto houver um, a tela mostra "Import bloqueado" e o botão de avançar fica desligado. ÂMBAR é aviso: informa e deixa passar — a linha importa do mesmo jeito, em geral com uma pendência para você resolver depois. A barra do topo conta os dois separadamente, e cada cartão de erro traz a cor do seu nível.',
    },
    {
      tipo: 'tabela',
      colunas: ['O que aparece no preview', 'Nível', 'O que fazer'],
      linhas: [
        [
          'Cartão "Tipo" (categoria fora do vocabulário)',
          'bloqueante',
          'Escolha o tipo correto no seletor e use "Corrigir N linhas" — vale para todas as linhas daquele valor de uma vez.',
        ],
        [
          'Cartão "Situação" (estado que o sistema não reconhece)',
          'bloqueante',
          'Escolha o estado correto no seletor e corrija o grupo inteiro. O campo é sempre uma escolha, nunca texto livre.',
        ],
        [
          'Cartão "Site" (filial escrita diferente)',
          'bloqueante',
          'Use "Definir como {filial} (N linhas)" quando for só erro de grafia da própria filial.',
        ],
        [
          'Cartão "Site" de OUTRA filial',
          'bloqueante',
          'Remova as linhas: forçar o Site mascararia uma transferência. Registre a transferência pelo sistema depois.',
        ],
        [
          'Cartão "Conflito entre filiais"',
          'aviso',
          'Nada a fazer para seguir: as linhas importam e cada uma abre um conflito, que se resolve depois em Pendências, com os dois cadastros lado a lado. Remover as linhas continua sendo uma saída, agora opcional.',
        ],
        [
          'Cartão "Patrimônio" (valor fora do formato)',
          'bloqueante',
          'Corrija o número, ou use "Usar mesmo assim" / "Sem patrimônio" (veja abaixo), ou remova a linha.',
        ],
        [
          'Cartão "Duplicata" (duas linhas com a mesma identidade)',
          'bloqueante',
          'Corrija a chave de uma delas ("Corrigir esta linha") ou use "Remover esta linha" — basta sobrar uma.',
        ],
        [
          'Cartão "Cabeçalho" ou "Linha sem chave"',
          'bloqueante',
          'A mensagem do cartão diz o que houve; em geral é arquivo errado. Volte em "Trocar arquivo".',
        ],
        [
          'Cartão "Sem patrimônio"',
          'aviso',
          'As linhas importam sem patrimônio, com pendência. Preencha só as que você souber; as demais entram assim mesmo.',
        ],
        [
          'Contador "sem service tag (importam com pendência)"',
          'aviso',
          'Nada a fazer no arquivo: as linhas entram e abrem a pendência "sem service tag", resolvida depois na ficha.',
        ],
        [
          'Cartão "Sem data" (nenhuma data aproveitável)',
          'aviso',
          'Digite a data no campo do topo do cartão para preencher todas as linhas de uma vez, ou uma a uma em "Definir".',
        ],
        [
          'Cartão "Sem colaborador"',
          'aviso',
          'Preencha "Nome / Setor" na linha e use "Corrigir", ou deixe como está.',
        ],
      ],
      legenda:
        'Cada cartão do preview traz o nível (vermelho = trava, âmbar = passa) e a ação que resolve.',
    },

    { tipo: 'titulo', id: 'import-corrigir', texto: 'Corrigir em massa, e desfazer' },
    {
      tipo: 'passos',
      titulo: 'Corrigir os erros do arquivo na própria tela',
      itens: [
        'As correções são agrupadas por VALOR, não por linha: um mesmo "Tipo" escrito errado em 40 linhas vira UM cartão, e o botão "Corrigir 40 linhas" resolve as 40 de uma vez.',
        'Quando o sistema consegue adivinhar o valor certo por semelhança, ele já vem escolhido no seletor com o selo "sugestão" ao lado — confira antes de aplicar; a decisão continua sua.',
        'Nos cartões que se preenchem linha a linha, o botão do rodapé aplica o que já está pronto: "Corrigir todas as N linhas" quando não falta nada, ou "Corrigir N linhas prontas" com o aviso "faltam N linhas (aplica as prontas agora)". Você não precisa preencher tudo para começar.',
        'A caixa "Aplicar tudo o que está pronto", no topo dos cartões, junta as correções de TODOS os cartões numa vez só, com o botão "Aplicar todas as correções (N)". Quando ainda falta preencher alguma coisa, ela avisa "faltam N linhas para incluir tudo" — e aplica só a parte pronta.',
        'Cada cartão tem "Ver as N linhas", que abre a linha inteira do arquivo (Site, Patrimônio, Service Tag, Tipo, Marca / Modelo, Status / Situação, Colaborador) — quem corrige vê o contexto, não uma célula solta.',
        'Linha que não deve entrar sai com "Remover a linha" / "Remover as N linhas"; ela passa a contar na barra do topo como "linhas removidas".',
        'Tudo que você aplicou aparece no painel "Correções aplicadas (N)", com quantas linhas cada correção pegou e um botão "Desfazer" por linha. Correção que ficou sem efeito (porque outra correção mudou a mesma célula antes, ou a linha saiu do import) aparece marcada como "sem efeito" — isso é normal, não é erro.',
        'A cada correção ou Desfazer a análise refaz sozinha do zero — a barra mostra "Reanalisando…" e os números se atualizam. O arquivo que você enviou NUNCA é alterado: as correções valem só dentro desta análise e ficam registradas no histórico do import.',
        'Para levar o arquivo já corrigido para fora do sistema, use "Baixar CSV corrigido". Para conferir os problemas no Excel, "Baixar lista de erros (CSV)"; "Ver lista completa" abre as tabelas de "Bloqueantes (N)" e "Avisos (N)" na própria tela.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'import-patrimonio',
      texto: 'Patrimônio: preenchido, forçado ou ausente',
    },
    {
      tipo: 'passos',
      titulo: 'Resolver o patrimônio de uma linha do import',
      itens: [
        'Quando o hostname já traz o número (por exemplo NB-WAP0001234), o sistema preenche o patrimônio SOZINHO — é correção automática, não aviso. O painel "N patrimônios preenchidos automaticamente pelo hostname" lista Linha, Valor original, Hostname e Patrimônio preenchido só para conferência: confira se o número bate com o aparelho físico.',
        'No cartão de patrimônio inválido, digite o número no campo da linha. A dica ao lado mostra ao vivo como ele vai ficar ("→ WAP0004491") ou avisa "ainda fora do formato (ex.: WAP0004491)". Se o hostname sugerir um número, aparece o botão "usar {patrimônio}", que só preenche o campo — quem aplica é o "Corrigir".',
        'Plaqueta que existe de verdade mas não segue o padrão da casa: use "Usar mesmo assim". O valor entra exatamente como está, como patrimônio fora do padrão. Isso é útil e tem um preço: a busca da lista de movimentações só acha esse tipo de plaqueta se ela tiver ao menos um número.',
        'Equipamento que não tem plaqueta nenhuma: use "Sem patrimônio". A linha importa com o patrimônio em branco e abre a pendência "sem patrimônio físico" — o ativo aparece como "Sem patrimônio" na lista e em Pendências, e ganha número depois pela ficha.',
        'No cartão âmbar de patrimônio vazio o campo já nasce em branco de propósito (o arquivo trazia "n/a", "sem patrimônio" ou parecido): preencha só as linhas cujo número você souber. As demais entram assim mesmo.',
        'Service tag em branco não trava nada: o contador âmbar "sem service tag (importam com pendência)" diz quantas linhas estão assim. Elas importam e abrem a pendência "sem service tag" — só o import aceita entrar sem tag; no cadastro manual ela é obrigatória.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Marca e modelo: quando o modelo do arquivo repete a marca no começo ("HP" + "HP Pro SFF 280 G9"), o sistema tira a repetição na hora de importar e grava o modelo sem ela — o rótulo do ativo sai "HP Pro SFF 280 G9", e não "HP HP Pro SFF 280 G9". A limpeza só age no COMEÇO do modelo e nunca inventa texto; se o modelo for só a marca, o modelo fica em branco.',
    },

    { tipo: 'titulo', id: 'import-depois', texto: 'O que muda depois de aplicar' },
    {
      tipo: 'lista',
      itens: [
        'Os ativos da filial passam a existir com origem "importacao", já no estado que o arquivo declarava, e cada um nasce com a sua movimentação na linha do tempo.',
        'Ativo vindo do import NÃO abre pendência de termo de responsabilidade nem de item faltante — o acervo herdado da planilha não inunda a fila. As pendências que ele pode abrir são as de identificação — "sem patrimônio físico" e "sem service tag" — e a de "conflito entre filiais", quando a linha traz um aparelho que já tem cadastro em outra unidade.',
        'O acervo anterior daquela filial deixa de existir: ativos, movimentações, anotações e termos são apagados, nas contagens que o passo "Confirmar" mostrou. O backup gravado antes fica disponível para baixar no resultado e no "Histórico de imports".',
        'O histórico do rodapé da tela guarda cada import com "Quando", "Quem", "Filial", "Linhas", "Criados", "Correções", "Conflitos", "Apagados" e o "Backup" — é o rastro de auditoria da virada.',
        'Os saldos de itens por quantidade não entram por aqui: o import é só de equipamentos com patrimônio.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['Mensagem', 'O que significa', 'Como sair'],
      linhas: [
        [
          'O arquivo precisa ter extensão .csv ou .xlsx.',
          'O arquivo escolhido é de outro tipo.',
          'Exporte a planilha como .xlsx (recomendado) ou .csv e envie de novo.',
        ],
        [
          `O arquivo tem {x} MB — o limite é ${TAMANHO_MAX_ROTULO}.`,
          'O arquivo passou do tamanho aceito.',
          'Confira se é mesmo o inventário da filial; planilha com abas e imagens costuma ser o arquivo errado.',
        ],
        [
          'O arquivo está vazio.',
          'O arquivo não tem conteúdo.',
          'Reexporte a planilha e envie de novo.',
        ],
        [
          'Nenhum ativo a criar: o arquivo não tem nenhuma linha aproveitável.',
          'O arquivo até foi lido, mas nada nele vira ativo.',
          'Confira se o arquivo é o da filial certa — o import de startup precisa de ao menos 1 ativo.',
        ],
        [
          'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
          'Existem termos gerados que abrangem ativos de duas filiais.',
          'A lista "Termos multi-filial (N)" aparece no preview; resolva esses termos e analise o arquivo de novo.',
        ],
        [
          'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
          'Alguém mexeu no acervo daquela filial entre a análise e a confirmação.',
          'Volte, use "Analisar arquivo" outra vez e confira os números antes de confirmar.',
        ],
        [
          'Confirmação incorreta: digite exatamente "{filial}" para prosseguir.',
          'O nome digitado no campo de confirmação não é igual ao da filial.',
          'Copie o nome como ele aparece no rótulo do campo, com acento e maiúsculas.',
        ],
        [
          'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
          'A substituição não terminou no tempo previsto; nada foi alterado.',
          'Analise o arquivo de novo e repita a confirmação; se persistir, avise o administrador do sistema.',
        ],
        [
          'Falha ao gerar o backup do acervo. Import cancelado.',
          'O backup que precede a substituição não foi gravado — e por isso nada foi apagado.',
          'Tente de novo; o import nunca substitui sem backup.',
        ],
        [
          'Filial inativa: import bloqueado.',
          'A filial escolhida está desativada.',
          'Reative a filial em Administração › Filiais e recomece.',
        ],
      ],
      legenda: 'As recusas mais comuns do import e a saída de cada uma.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'administracao' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'ficha-do-ativo' },
        { slug: 'resolver-pendencias' },
      ],
    },
  ],
}
