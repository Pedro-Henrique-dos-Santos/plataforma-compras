# ADR 0002: isolamento multiempresa

## Status

Aceita.

## Decisao

Usar um banco compartilhado com `organizationId` obrigatorio em dados operacionais, vinculos muitos-para-muitos entre usuarios e organizacoes e papel global separado dos papeis empresariais.

## Consequencias

- Um usuario pode acessar mais de uma empresa.
- A troca de empresa nao exige uma nova conta.
- Toda consulta precisa declarar o contexto da organizacao.
- Testes de isolamento entre empresas sao obrigatorios.
- Empresas com requisitos especiais poderao receber banco dedicado futuramente.

