# Orientacoes para agentes

Leia antes de alterar o projeto:

1. `docs/PROJECT_CONTEXT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. `docs/decisions/`

## Regras permanentes

- Nao alterar nem remover `legacy/` sem solicitacao explicita.
- Nao enviar segredos, `.env` ou dados reais de empresas ao GitHub.
- Manter o sistema multiempresa: toda entidade operacional pertence a uma organizacao.
- `PLATFORM_OWNER` e um papel global e nunca pode ser concedido por administradores de empresa.
- Nao implementar alçada de aprovacao ate que ela seja priorizada no roteiro.
- Preferir contratos compartilhados e validacao explicita entre web, API e banco.
- Toda mudanca de comportamento deve vir acompanhada de teste adequado.
- Nao usar emojis nos textos do sistema ou na documentacao do projeto.

