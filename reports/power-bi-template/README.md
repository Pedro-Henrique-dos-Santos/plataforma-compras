# Modelo público de compras para Power BI Desktop

Este modelo de Gestão de suprimentos corporativos contém **somente dados fictícios, criados do zero**: 12 pedidos de exemplo, 7 fornecedores fictícios, 3 unidades fictícias e 4 departamentos fictícios. As datas ilustrativas pertencem a 2025. Nenhum registro representa uma empresa, transação ou documento real. Não há logotipo empresarial.

## Abrir no Power BI Desktop

1. Baixe ou extraia a pasta inteira para um caminho local curto.
2. Preserve juntos `Modelo Compras.pbip`, `Modelo Compras.Report` e `Modelo Compras.SemanticModel`.
3. Abra `Modelo Compras.pbip` no Power BI Desktop com suporte a projetos PBIP/PBIR. Se a versão instalada solicitar a opção de projetos, habilite-a nas opções do Desktop e reinicie.
4. Clique em **Atualizar** na primeira abertura para carregar a tabela local já embutida no modelo.
5. Navegue por **Todas as compras - Executivo**, **Negociacao** e **Detalhes**. Cada página possui filtros próprios. O filtro de mês inicia sem restrição.

O projeto é portátil: o relatório referencia sua pasta de modelo por caminho relativo. A única partição de dados é uma tabela literal em Power Query M (`#table`). Não há integração online, conexão a banco, API, planilha externa, conta empresarial ou credencial. Atualizar apenas recarrega o exemplo embutido. URLs de schemas da Microsoft descrevem o formato dos arquivos e não são fontes de dados.

Este é um projeto **PBIP**, não um PBIX ou PBIT. A geração possui validação estrutural e numérica; a abertura e a apresentação visual devem ser conferidas na versão instalada do Power BI Desktop antes de uso. O modelo permanece Beta até essa conferência. Publicação no Power BI Service e atualização automática não fazem parte deste pacote.

## Conteúdo e conferência

| Indicador | Valor fictício esperado |
| --- | ---: |
| Pedidos | 12 |
| Valor inicial informado | R$ 12.750,00 |
| Valor negociado informado | R$ 11.375,00 |
| Pedidos com ambos os valores | 10 |
| Inicial dos pedidos comparáveis | R$ 12.150,00 |
| Negociado dos pedidos comparáveis | R$ 11.075,00 |
| Economia dos mesmos pedidos comparáveis | R$ 1.075,00 |
| Economia percentual | 8,85% |
| Pedidos com valores incompletos | 2 |
| Pedidos sem data | 1 |

A economia considera apenas os mesmos pedidos com valores inicial e negociado informados. Por isso ela não é a diferença entre os dois totais gerais quando há campos ausentes. Há um exemplo com valor zero real, um com acréscimo de R$ 75,00, um sem valor inicial e outro sem valor negociado. Branco significa ausência, nunca zero inventado. O pedido sem data continua nos totais sem receber um mês artificial.

Os cinco fornecedores de maior gasto são recalculados pelos filtros da página; a participação se restringe a esses cinco. A comparação por categoria considera as mesmas compras nas duas séries. Unidade e departamento são dimensões distintas. Compra/Pagamento são rótulos de localização administrativa de exemplo; **Pagamento não significa que o pedido foi pago**.

`dados-ficticios.json` contém exatamente as linhas sintéticas incluídas no modelo. Campos técnicos como CardBitrix e ChaveExterna foram preservados para compatibilidade com o gerador: seus códigos 900001 a 900012 foram inventados, sem vínculo com um sistema externo. CNPJ e IdInterno permanecem nulos em todas as linhas. Os identificadores de páginas, visuais e arquivos .platform são identificadores estruturais do modelo, não identificadores de empresas.

`manifest.json` descreve a demonstração, sua versão e totais, sem hash de origem empresarial. `verificacao-publica.json` registra os controles de minimização. `manifest-sha256.json` contém caminho relativo, tamanho e SHA-256 de cada arquivo do pacote, exceto o próprio manifesto de hashes, evitando autorreferência. Esses hashes são apenas dos arquivos públicos deste exemplo.

Se adaptar o modelo para dados reais, mantenha a cópia preenchida em local privado e revise todo o conteúdo antes de compartilhar. A pasta .pbi gerada pelo Desktop, caches, arquivos locais de configuração e exportações preenchidas não integram este modelo público.
