# Implantacao e imagens

## Objetivo

O repositorio entrega imagens separadas para a interface e a API sem escolher um provedor de hospedagem. A camada HTTPS, os dominios, o balanceador e o gerenciador de segredos pertencem ao ambiente contratado. O PostgreSQL e o armazenamento de notas permanecem no Supabase.

## Imagens

### API

`apps/api/Dockerfile` compila os pacotes compartilhados, gera o cliente Prisma e cria uma instalacao somente com dependencias de producao. A imagem final:

- usa Node.js 24 em Debian slim;
- executa como o usuario `node`;
- usa `tini` para encaminhar sinais e encerrar corretamente;
- expoe a porta `3333`;
- verifica `GET /api/health/live`;
- nao recebe segredos durante o build.

### Web

`apps/web/Dockerfile` compila a SPA e a serve com Nginx sem privilegios na porta `8080`. A configuracao inclui fallback para rotas do React, cache longo apenas para ativos versionados, health check em `/healthz` e cabecalhos defensivos.

As variaveis `VITE_*` sao incorporadas ao JavaScript no build. Portanto, use somente valores publicos:

- `VITE_API_URL`, normalmente `https://api.exemplo.com/api`;
- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `VITE_DEMO_MODE=false`.

Nunca passe a chave secreta do Supabase, credenciais do banco ou a conta de servico do Google ao build web.

## Build local

O Docker precisa estar instalado para executar estes comandos:

```bash
docker build -f apps/api/Dockerfile -t e-gestao-compras-api:local .

docker build -f apps/web/Dockerfile -t e-gestao-compras-web:local \
  --build-arg VITE_API_URL=https://api.exemplo.com/api \
  --build-arg VITE_SUPABASE_URL=https://projeto.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=chave_publica \
  --build-arg VITE_DEMO_MODE=false .
```

O workflow `Containers` repete os builds no GitHub e inicia cada imagem com usuario nao privilegiado, capacidades removidas e sistema de arquivos somente leitura.

## Configuracao da API

Configure os seguintes valores no gerenciador de segredos da hospedagem:

| Variavel | Regra |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `false` |
| `APP_WEB_URL` | origem HTTPS exata da interface |
| `CORS_ORIGIN` | lista explicita que inclui `APP_WEB_URL` |
| `DATABASE_URL` | conexao PostgreSQL protegida |
| `SUPABASE_URL` | origem HTTPS do projeto |
| `SUPABASE_PUBLISHABLE_KEY` | chave publica usada para validar o contexto |
| `SUPABASE_SECRET_KEY` | chave secreta somente da API |
| `PLATFORM_OWNER_EMAILS` | identidades independentes das empresas clientes |
| `REQUIRE_VERIFIED_EMAIL` | `true` |
| `TRUST_PROXY` | `true` apenas atras de proxy confiavel |
| `INVOICE_STORAGE_BUCKET` | bucket privado, por padrao `invoice-documents` |
| `OCR_LANGUAGE_DATA_PATH` | sobrescrita opcional; a imagem ja inclui o modelo portugues |

Para Google Sheets, configure somente uma das variaveis `GOOGLE_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`. O JSON nunca deve ser montado na interface web ou gravado no banco.

O modelo Tesseract em portugues e uma dependencia de producao da API. O container valida o arquivo com a rede desativada antes do smoke test, portanto a leitura de PDFs digitalizados nao depende de download em tempo de execucao.

## Publicacao versionada

Antes de criar uma tag, todas as versoes do workspace e o changelog devem estar sincronizados:

```bash
pnpm release:verify
```

Depois do merge aprovado na `main`, crie uma tag imutavel correspondente:

```bash
git tag v0.10.0
git push origin v0.10.0
```

O workflow `Publish Container Images` valida a tag e publica no GHCR:

- `ghcr.io/<proprietario>/e-gestao-compras-api`;
- `ghcr.io/<proprietario>/e-gestao-compras-web`.

Configure antes as variaveis publicas descritas em `docs/GITHUB_SETUP.md`. Nao crie a tag enquanto o pull request estiver em rascunho ou o CI estiver em falha.

## Migracoes protegidas

O workflow manual `Supabase Production` recebe uma tag de release, uma referencia de backup verificado e a frase `APLICAR PRODUCAO`. Ele usa o ambiente protegido `production`, aplica somente migracoes versionadas, verifica RLS e privilegios e provisiona o bucket privado.

O identificador de backup serve como barreira operacional; o arquivo real deve permanecer no armazenamento seguro definido pela empresa. Nao envie backups com dados empresariais como artefatos comuns do GitHub Actions.

## Ordem de implantacao

1. Confirmar que o commit aprovado esta na `main` com CI verde.
2. Gerar e verificar um backup fora do GitHub.
3. Criar a tag semantica e aguardar as duas imagens no GHCR.
4. Executar `Supabase Production` com aprovacao do ambiente.
5. Implantar a API e aguardar `/api/health/ready` retornar `ready`.
6. Implantar a web com os dominios definitivos.
7. Testar login, empresa ativa, escrita, nota fiscal e relatorios.
8. Comparar totais entre PostgreSQL e a planilha.
9. Liberar um grupo pequeno de usuarios mantendo o Apps Script disponivel.

## Reversao

Mantenha a imagem anterior identificada pela versao ou pelo digest. Em falha da aplicacao, retire a nova API do trafego e restaure a imagem anterior. Migracoes de banco nao devem ser revertidas automaticamente: avalie compatibilidade, preserve os logs e restaure em uma instancia separada quando houver perda ou corrupcao de dados.
