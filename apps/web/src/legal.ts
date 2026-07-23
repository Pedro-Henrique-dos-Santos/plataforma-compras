import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@compras/contracts';

export const legalDocuments = {
  terms: {
    title: 'Termos de uso',
    version: CURRENT_TERMS_VERSION,
    sections: [
      {
        heading: 'Uso da plataforma',
        paragraphs: [
          'A E-Gestao Compras e uma plataforma de apoio ao cadastro, acompanhamento e analise de compras empresariais.',
          'A conta deve ser usada apenas por pessoas autorizadas. Cada usuario e responsavel por proteger suas credenciais e por informar dados corretos.',
        ],
      },
      {
        heading: 'Responsabilidades',
        paragraphs: [
          'A empresa controladora define quem pode acessar seus dados e quais informacoes comerciais serao cadastradas.',
          'E proibido usar a plataforma para violar direitos, inserir conteudo ilicito ou tentar acessar dados de outra empresa.',
        ],
      },
      {
        heading: 'Disponibilidade e alteracoes',
        paragraphs: [
          'O servico pode receber manutencoes e atualizacoes de seguranca. Mudancas relevantes destes termos exigirao nova aceitacao da versao aplicavel.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Aviso de privacidade',
    version: CURRENT_PRIVACY_VERSION,
    sections: [
      {
        heading: 'Dados tratados',
        paragraphs: [
          'A plataforma trata dados de identificacao e contato da conta, registros de acesso, empresa vinculada, permissoes e eventos de auditoria.',
          'Os dados operacionais de compras pertencem a empresa que os cadastra e ficam separados por organizacao.',
        ],
      },
      {
        heading: 'Finalidades',
        paragraphs: [
          'Os dados sao usados para autenticar usuarios, controlar acessos, manter a seguranca, registrar alteracoes e entregar as funcoes contratadas.',
          'Provedores de infraestrutura podem tratar dados como operadores, conforme as instrucoes aplicaveis ao servico.',
        ],
      },
      {
        heading: 'Direitos e conservacao',
        paragraphs: [
          'O titular pode solicitar confirmacao, acesso, correcao e os demais direitos previstos na LGPD pelo canal definido pela empresa controladora.',
          'Os dados sao conservados pelo periodo necessario as finalidades informadas, as obrigacoes legais e a defesa de direitos.',
        ],
      },
    ],
  },
} as const;

export type LegalDocumentKind = keyof typeof legalDocuments;
