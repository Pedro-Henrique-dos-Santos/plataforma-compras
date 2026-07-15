# Recuperacao e backups

## Objetivos iniciais

- RPO proposto: no maximo 24 horas de dados.
- RTO proposto: restauracao do servico em ate quatro horas.

Esses valores sao metas operacionais a confirmar com cada empresa, nao garantias do plano gratuito do provedor.

## Criar backup

Instale as ferramentas cliente do PostgreSQL e execute:

```bash
DATABASE_URL=postgresql://... pnpm db:backup
```

O arquivo customizado e salvo em `backups/`, pasta ignorada pelo Git. `PG_DUMP_BINARY` e `BACKUP_DIRECTORY` permitem indicar caminhos diferentes. A senha nao e colocada na linha de comando do processo.

## Verificar estrutura

```bash
pnpm db:backup:verify -- backups/egestao-data.dump
```

A verificacao lista a estrutura com `pg_restore` sem alterar o banco. Ela detecta arquivos ausentes, corrompidos ou sem entradas restauraveis.

## Ensaio de restauracao

1. Criar um banco PostgreSQL descartavel e vazio.
2. Restaurar o arquivo com `pg_restore --clean --if-exists --no-owner --no-acl`.
3. Executar as migracoes pendentes.
4. Conferir empresas, membros, fornecedores, compras, rateios, notas e auditoria.
5. Comparar os totais de compras e economia com o ambiente de origem.
6. Apagar o banco de ensaio depois de registrar data, duracao e resultado.

Nunca restaure diretamente sobre producao sem uma janela aprovada e um backup imediatamente anterior.

## Incidente

1. Bloquear novas gravacoes ou retirar a API do trafego.
2. Preservar logs e identificar a ultima operacao integra pelo `x-request-id`.
3. Definir o ponto de restauracao e registrar a perda maxima esperada.
4. Restaurar em uma instancia separada e validar os totais.
5. Trocar a conexao somente depois da validacao funcional.
6. Rotacionar credenciais quando houver suspeita de exposicao.
7. Documentar causa, impacto, dados recuperados e acao preventiva.
