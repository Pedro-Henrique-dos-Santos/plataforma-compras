# ADR 0005: contas a receber, consulta de CNPJ e retorno do Kanban

## Status

Aceito em 2026-08-01.

## Contexto

O crescimento por modulos exige separar recebimentos de clientes das obrigacoes
originadas em compras. O cadastro manual de fornecedores tambem gera retrabalho,
enquanto a obrigatoriedade de justificar todo retorno de card atrasa a operacao
administrativa atual.

## Decisao

- Contas a receber sera um dominio proprio no modulo Financeiro, com titulos,
  baixas, saldos, permissoes, relatorios e isolamento multiempresa.
- A consulta inicial de CNPJ usara BrasilAPI por um adaptador exclusivo no
  back-end. O navegador nao escolhe a URL e o resultado somente preenche o
  formulario para revisao antes de salvar.
- O motivo de retorno no Kanban sera configuravel por empresa e iniciara
  desabilitado. Administradores poderao retornar a etapas anteriores permitidas,
  preservando limites fiscais e etapas automaticas.
- O Kanban ocupara a area operacional disponivel e usara colunas continuas,
  separadas visualmente por linhas.

## Consequencias

O schema recebe novas tabelas financeiras e campos cadastrais de fornecedor. A
implantacao exige migracao PostgreSQL antes de habilitar as rotas em ambiente
persistente. BrasilAPI e uma dependencia externa substituivel; indisponibilidade
na consulta nao impede o cadastro manual. Recebimentos de clientes nao liquidam
parcelas de fornecedores e vice-versa.
