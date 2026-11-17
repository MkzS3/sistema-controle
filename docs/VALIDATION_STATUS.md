# Registro de validação pendente

## Resultado da Etapa 11 — preparação para PostgreSQL nativo no Windows (2026-11-16)

### Diagnóstico do ambiente

- PostgreSQL nativo não foi encontrado: `psql`, `pg_isready`, `postgres`, `initdb` e `createdb` não estão disponíveis no `PATH`; não foram encontrados serviços cujo nome contenha `postgres`, diretórios de instalação comuns (`C:\Program Files\PostgreSQL`, `C:\Program Files (x86)\PostgreSQL`, `C:\PostgreSQL`) ou listener em `127.0.0.1:5432`.
- Bun 1.4.4 está disponível, conforme a versão declarada no workspace. Node.js 24.22.1 também está instalado, mas o projeto usa Bun para executar os scripts.
- `.env` não existe; `.env.example` está presente. Nenhum arquivo de segredo foi aberto ou exibido.
- O Compose continua configurado com PostgreSQL `18-alpine`, vinculado ao loopback. Não foi executado; sua configuração e volumes foram preservados.
- **Revisão pendente no Compose:** a imagem oficial PostgreSQL 18 mudou o diretório `PGDATA` e o volume declarado para `/var/lib/postgresql/18/docker` e `/var/lib/postgresql`, enquanto o `docker-compose.yml` atual monta `postgres-data` em `/var/lib/postgresql/data`. Nenhuma alteração foi aplicada porque o daemon/volume existente não foi inspecionado; antes de usar Compose, revisar o caminho e preservar/migrar qualquer volume anterior com backup. A documentação oficial da imagem descreve a mudança: [Docker Official Image — PostgreSQL](https://github.com/docker-library/docs/blob/master/postgres/README.md).
- Nenhum software foi instalado; Windows, serviços, bancos, arquivos de dados e volumes não foram modificados.

### Configuração e isolamento revisados

- `.env.example` define alvos separados: `DATABASE_URL` para `dividend_control` e `TEST_DATABASE_URL` para `dividend_control_test`, ambos locais na porta 5432. As credenciais são exemplos de desenvolvimento, não segredos de produção.
- `mikro-orm.options.ts` obtém `DATABASE_URL` do ambiente e mantém um padrão local para desenvolvimento quando a variável está ausente.
- A suíte PostgreSQL exige `TEST_DATABASE_URL`, compara protocolo/host/porta/banco com `DATABASE_URL` (incluindo aliases de loopback) e recusa executar se ambos forem o mesmo alvo. Isso detecta colisões simples de URL, mas não prova isolamento se aliases/DNS diferentes levarem ao mesmo servidor ou se o banco de teste tiver dados importantes. As URLs e o conteúdo do banco ainda precisam ser conferidos manualmente.
- `test:integration` aplica migrations em `TEST_DATABASE_URL` e deixa fixtures e entradas imutáveis de ledger. Não deve ser executado sem confirmar um banco de teste dedicado e isolado.
- As migrations declaram transações `allOrNothing`; nada foi aplicado nesta rodada. Os comandos de migration existentes e a configuração Docker permanecem preservados.

### Instalação nativa para a validação futura (não executada)

1. Confirmar que o Windows é x64 e obter PostgreSQL pela [página oficial de downloads para Windows](https://www.postgresql.org/download/windows/), que encaminha ao instalador da EDB. Escolher PostgreSQL 18 para manter a mesma versão principal do Compose (`postgres:18-alpine`) e verificar no site qual instalador 18.x está atualmente disponível.
2. Na instalação manual, selecionar PostgreSQL Server e Command Line Tools (`psql`, `pg_isready`); pgAdmin é opcional. O instalador requer privilégios administrativos. Nenhuma instalação automática foi tentada.
3. Se forem detectados serviço, cluster ou diretório de dados PostgreSQL preexistente, cancelar e confirmar o destino; não sobrescrever, remover ou reutilizar dados existentes sem autorização.
4. Configurar o listener somente para `127.0.0.1`/localhost e definir uma senha local forte para a conta administrativa. Não abrir firewall nem interfaces externas.
5. Depois da instalação e autorização para continuar, verificar `psql --version`, serviço e conexão. Inspecionar bancos e roles existentes (`\l`, `\du`). Só criar `dividend_control` e `dividend_control_test` se forem novos e destinados a este projeto; configurar `.env` manualmente sem versionar credenciais.
6. Aplicar `bun run db:migration:up` somente ao banco de desenvolvimento novo e confirmado. Executar `bun run test:integration` e `bun run test:concurrency` exclusivamente com `TEST_DATABASE_URL` apontando ao banco dedicado. Para exercitar `up/down/up`, usar um terceiro banco descartável criado exclusivamente para migrations: rollback remove objetos/dados da migration.

### Validação PostgreSQL real

Não executados porque não há servidor disponível: conexão, criação de roles/bancos, migrations `up/down/up`, estrutura, índices, constraints, triggers, persistência, atomicidade/rollback, imutabilidade do ledger, reconciliação, consultas SQL do dashboard, bootstrap NestJS com PostgreSQL, idempotência persistente ou concorrência. Também não foram executados testes de múltiplos processos. Nenhum resultado foi substituído por mocks.

### Decisões de escopo e segurança

Esta versão será utilizada por uma organização, sem multi-tenancy, mantendo os quatro perfis administrativos e a preparação OIDC sem provedor real ativo. A aplicação permanece restrita ao loopback. A escolha do provedor de identidade e a auditoria administrativa persistente continuam pendentes. Nenhuma configuração de segurança foi ampliada nesta etapa.

### Testes sem infraestrutura real

| Verificação | Resultado | Escopo e limite |
|---|---|---|
| `bun run test:unit` | **Passou: 145/145** | Backend 114/114 (20 arquivos), frontend 31/31 (6 arquivos), 0 falhas. Inclui testes unitários do guard de URL de teste; não abre conexão PostgreSQL. |
| `bun run typecheck` | **Passou** | Backend e frontend. |
| `bun run build` | **Passou** | Build do backend e bundle Vite do frontend. |
| `bun run test:e2e` | **Passou: 4/4, 237 assertions** | Edge instalado, Vite local e API controlada pela suíte. Confirma comportamento visual/interativo do frontend; não é smoke da API real nem valida banco. |
| PostgreSQL/migrations/integração/concorrência | **Pendente** | Não havia servidor instalado ou acessível; os comandos dependentes não foram executados. |

Essas verificações confirmam qualidade local sem banco, não conectividade, migrations ou garantias distribuídas.

## Resultado da Etapa 10 — segurança administrativa (2026-11-16)

Trabalho feito sem Docker, PostgreSQL, LocalStack ou configuração de provedor de identidade. Não executei migrations, não conectei ao banco e não iniciei workers. Testes HTTP de segurança usam Nest em módulo isolado, porta efêmera de loopback, verifier/identidades controlados e sink de auditoria em memória somente no teste; não são integração com um IdP nem persistência de auditoria.

### Diagnóstico e correções

- Antes desta etapa, os controllers financeiros e `/metrics` não tinham autenticação/autorização. `localhost` e CORS eram limites de rede, não controle de identidade.
- `AUTH_MODE` agora é obrigatório. O modo local sem autenticação precisa ser `disabled`, é rejeitado em `NODE_ENV=production` e exige `API_HOST` loopback. O modo `oidc` exige issuer, audience e JWKS por HTTPS e falha antes da inicialização dos módulos quando a configuração está incompleta.
- Adicionados guards de autenticação/autorização; handlers sem permissão declarada falham fechados. `401` cobre token ausente/inválido/expirado, `403` autorização insuficiente e `503` indisponibilidade temporária do JWKS. Health continua público e `/metrics` exige permissão em OIDC.
- Adicionado `GET /auth/session` para informar modo e permissões verificadas. CORS passou a permitir `Authorization` e `X-Correlation-Id`, mantendo origem exata loopback e `credentials: false`.
- O escopo idempotente em OIDC deriva de issuer+subject validado; o valor recebido no `Idempotency-Scope` não é usado. O header continua obrigatório e `Idempotency-Key` também. Em modo local permanece scope explícito do chamador. Isso é decisão de escopo de autenticação; a unicidade/replay entre instâncias continua dependendo de PostgreSQL.
- Criados logs JSON de início/sucesso/falha das mutações listadas e tentativas negadas. Auditoria omite token, corpo HTTP e PII. A UI recebe permissões via sessão, suporta token provider injetável sem armazenamento local e oculta ações sem permissão; não foi criado login próprio nem SDK de IdP.
- `.env.example`, README e arquitetura descrevem modo local e configuração OIDC opcional. Nenhuma credencial ou token foi adicionado ao frontend/código.

### Matriz de permissões

| Ação | Administrador | Operador | Auditor | Visualizador |
|---|---:|---:|---:|---:|
| Dashboard e leituras de beneficiário | Sim | Sim | Sim | Sim |
| Cadastrar beneficiário | Sim | Sim | Não | Não |
| Consultar/criar dividendos | Sim | Sim | Consulta | Consulta |
| Declarar dividendo | Sim | Sim | Não | Não |
| Consultar/registrar obrigações | Sim | Sim | Consulta | Consulta |
| Consultar/solicitar instrução lógica | Sim | Sim | Consulta | Consulta |
| Consultar ledger | Sim | Não | Sim | Sim |
| Consultar auditoria | Sim | Não | Sim | Não |
| Métricas | Sim | Sim | Não | Não |

É a matriz inicial implementada nos guards e **aprovada provisoriamente** como base para esta versão. `audit:read` não tem endpoint; o sistema não expõe uma consulta de logs.

### Limites de segurança ainda conhecidos

- O dataset de dividendos é global; não há tenant/organização nem escopo de recurso por usuário. A decisão desta versão é uma organização e ausência de multi-tenancy. Papéis OIDC autorizariam o dataset inteiro da instalação; qualquer suporte multi-organização exigirá definir fronteiras e isolamento de registros.
- OIDC não foi ativado com provedor real. Permanecem pendentes escolha de IdP/SDK, mapeamento dos claims reais de audiência/roles, callback/renovação/logout, validação do JWKS do provedor, rotação de chaves, revogação e smoke em ambiente autorizado. A verificação de JWT foi testada com chaves geradas/localizadas exclusivamente na suíte.
- Auditoria escreve em stdout e não é durable ou imutável. Retenção, sink central protegido, acesso, monitoramento de falha e eventual endpoint persistente exigem decisão. Nenhuma tabela/migration de auditoria foi criada.
- A matriz inicial foi aprovada provisoriamente. Ainda faltam decisões sobre MFA, duração de sessão, política de bloqueio/revogação, ambiente de segredo, consentimento para métricas e modelo de segregação de tarefas.
- As portas continuam loopback. Não considerar autenticação OIDC preparada como autorização para abrir bind externo; API/Vite/worker foram mantidos locais.

### Validação da Etapa 10

| Verificação | Resultado | Escopo e limite |
|---|---|---|
| `bun run test:unit` | **Passou: 145/145** | Backend 114/114 (20 arquivos) e frontend 31/31 (6 arquivos); 0 falhas, 0 ignorados. Inclui chaves/JWT locais de teste, config, papéis, escopo idempotente, metadados de todas as rotas, módulo Nest de segurança isolado e transições da UI para sessão expirada/acesso negado. |
| `bun run test:e2e` | **Passou: 4/4** | Microsoft Edge instalado + Vite loopback; 237 assertions. A API, incluindo `/auth/session`, é interceptada com respostas controladas. Não é fluxo com IdP ou backend real. |
| `bun run typecheck` | **Passou** | Backend, frontend e testes em TypeScript strict. |
| `bun run build` | **Passou** | Build TypeScript do backend e bundle Vite. |
| Contratos HTTP de segurança | **Passou em Nest isolado** | Sem token 401; token inválido/expirado 401; verifier/JWKS indisponível 503; falta de permissão 403; rota sem metadata 403; permissão permitida 200; health marcado público. Identidades/verifier são doubles somente de teste. |
| Cobertura de metadata | **Passou em teste unitário** | Cada controller handler atual (dashboard, CRUD/leitura financeiro, pagamentos, session e métricas) declara permissão; rotas de mutação esperadas declaram auditoria. Não inicializa `AppModule` ou MikroORM. |
| JWT assinado | **Passou com JWKS local de teste** | Verificou assinatura, issuer, audience, expiração, subject e mapeamento de papéis; rejeitou assinatura/claims inválidos e token expirado. Nenhuma chamada a IdP real. |
| Navegação/permissões no frontend | **Passou no jsdom** | Resposta de sessão OIDC controlada com perfil `viewer`; ações de criação/declaração ocultas, token provider injetado no teste. Não confere autoridade: guard backend continua sendo o controle efetivo. |
| Responsividade e interação | **Passou no Edge** | Seis telas em 1440, 768, 390 e 360 px; também confirmação, retry, foco por teclado e indisponibilidade controlada da API. |
| PostgreSQL, migrations e transações | **Pendente** | Nenhum banco ou migration iniciado. |
| Idempotência concorrente e escopo persistente | **Pendente** | Derivação OIDC testada em unidade; ausência de colisões/replay/conflict sob transação, múltiplos processos e reinício requer PostgreSQL real. A garantia distribuída permanece não validada. |
| Inbox/Outbox, LocalStack e SQS | **Pendente** | Workers e filas não foram iniciados; sem prova real de retries, DLQ ou redelivery nesta etapa. |
| Provedor OIDC real | **Pendente** | IdP ainda não escolhido/configurado; claims, JWKS/rotação, callback, emissão e renovação de token não foram exercitados. |

Os comandos de teste rodaram sem Docker, PostgreSQL ou LocalStack, conforme solicitado. As suites usam dados/identidades controlados apenas dentro do teste. A classificação de falhas de rede/JWKS foi ajustada para retornar 503 em vez de tratar indisponibilidade do IdP como token inválido; o cenário ganhou teste unitário. Testes de integração PostgreSQL, migrations, concorrência, Inbox/Outbox persistente, LocalStack/SQS, bootstrap de `AppModule` e fluxo OIDC real seguem pendentes; nenhum deles é declarado aprovado por doubles.

## Resultado da Etapa 9 — testes de interface, acessibilidade e responsividade (2026-11-16)

Validação executada sem Docker, PostgreSQL ou LocalStack. O Vite foi iniciado somente em `127.0.0.1:5197`; as chamadas à API foram interceptadas no navegador com respostas controladas. O browser Microsoft Edge já instalado foi executado em modo headless via Playwright Core; nenhum navegador foi baixado/instalado. Não houve chamadas financeiras nem alteração de dados persistidos.

| Verificação | Resultado | Escopo e limite |
|---|---|---|
| `bun run test:unit` | **Passou: 122/122** | Backend 95/95 (15 arquivos), frontend 27/27 (6 arquivos), 0 falhas e 0 ignorados. Inclui 8 testes DOM interativos com jsdom/Testing Library/user-event. |
| `bun run test:e2e` | **Passou: 4/4** | Edge real + Vite de loopback; 237 assertions, 0 falhas e 0 ignorados. API somente interceptada com fixtures de teste. |
| `bun run typecheck` | **Passou** | Backend e frontend TypeScript strict, inclusive os testes jsdom. |
| `bun run build` | **Passou** | Backend e bundle de produção Vite. |
| Navegação nas seis telas e tamanhos | **Passou no Edge** | Visão geral, Beneficiários, Dividendos, Obrigações, Instruções e Ledger em 1440, 768, 390 e 360 px; nenhuma rolagem horizontal da página, tabelas permanecem em wrapper rolável. |
| Interações e estados de erro | **Passou no Edge e jsdom** | Menus, tabelas, filtros/paginação, formulários, confirmação/cancelamento, modal, API indisponível, retry, mensagem de erro, ausência de dados substitutos. Dados de resposta são restritos aos testes. |
| Acessibilidade de teclado | **Passou nas verificações automatizadas** | Testou `Tab`, `Shift+Tab`, `Enter`, `Escape`, foco inicial/restauração no modal, nomes acessíveis por role/label e estado desabilitado durante envio. Não houve teste com leitor de tela. |
| Inspeção visual de screenshots | **Executada no Edge** | Capturas temporárias desktop/tablet e celulares foram inspecionadas. Fontes calculadas: descrições >=12 px e células >=11 px; rótulos do dashboard não sobrepõem as barras. Capturas usam somente fixtures de teste. |
| Nest/API real e backend conectado | **Pendente** | Nenhum backend, banco ou CORS real foi iniciado; responses controladas não validam contratos em execução. |
| PostgreSQL, migrations, concorrência, SQS/LocalStack | **Pendente** | Nenhuma infraestrutura desta etapa foi iniciada; ver matriz pendente nas etapas anteriores. |

### Bugs encontrados e correções

- O cliente HTTP passava `fetch` sem vínculo ao contexto global; no Edge isso fazia a chamada falhar antes da API interceptada. Agora usa `globalThis.fetch.bind(globalThis)`, verificado no browser real.
- Em 360 px, a sombra da sidebar fechada cobria uma faixa da borda; removida enquanto recolhida.
- No tablet, o grid de dashboard apertava as colunas e os rótulos longos de estado encavalavam nas barras. Abaixo de 900 px o dashboard empilha os painéis; os rótulos podem quebrar linha e o teste compara limites geométricos.
- Falhas de solicitação de instrução apareciam simultaneamente como alerta da página e da confirmação. Enquanto o modal está aberto, o erro fica junto à ação que o causou.
- A checagem TypeScript estrita não tinha declaração do módulo `jsdom`; foi adicionada dependência de desenvolvimento `@types/jsdom`.
- O teste no Edge também confirma que o botão fica desabilitado em envio, que Enter não duplica a ação e que o retry reapresenta o mesmo `Idempotency-Key`. É evidência de comportamento de UI sob respostas controladas, não idempotência persistente.

### Escolha das ferramentas e distinção dos testes

`jsdom` fornece um DOM compatível o bastante para montar React e testar eventos/acessibilidade semântica; Testing Library e `user-event` verificam o comportamento em termos de ações e elementos acessíveis. Esses testes não reproduzem layout real. Playwright Core dirige o Edge já instalado para interação e layout; o servidor Vite fica no loopback, e a API é interceptada. O script é `bun run test:e2e`. Opcionalmente, `PANEL_SCREENSHOT_DIR` aponta para pasta temporária para salvar capturas dos tamanhos usados. Nenhuma instalação de software de browser foi feita.

Interação e responsividade nos quatro viewports estão verificadas por testes no Edge, mas isso não é validação em dispositivos físicos. Leitor de tela, zoom de navegador, modo de alto contraste e CORS/HTTP contra backend real continuam sem teste. A disponibilidade da API foi validada por abort controlado da requisição no browser, não por indisponibilidade real de serviço.

## Resultado da Etapa 8 — contratos HTTP e qualidade local (2026-11-16)

Esta seção documenta o estado ao fim da Etapa 8; a validação de DOM/browser pendente daquele momento foi executada na Etapa 9 acima.

Execução sem Docker, PostgreSQL, LocalStack ou dependências novas. Os testes HTTP abriram um Nest real somente em `127.0.0.1` e porta efêmera; a aplicação de produção, o banco e as filas não foram iniciados. O Vite foi iniciado em loopback para smoke: `GET /` e `GET /src/app/App.tsx` responderam HTTP 200; o servidor foi encerrado após a conferência. Não houve chamada de API financeira nem alteração de dados.

| Verificação | Resultado | Escopo e limite |
|---|---|---|
| `bun run test:unit` | **Passou: 114/114** | Backend 95/95 (15 arquivos), frontend 19/19 (5 arquivos), 0 falhas e 0 ignorados. |
| `bun run typecheck` | **Passou** | Backend e frontend em TypeScript strict, incluindo testes TypeScript do backend. |
| `bun run build` | **Passou** | Backend TypeScript e build Vite; bundle React compilado. |
| Nest HTTP/DI isolado | **Passou** | Teste de contrato com todos os controllers financeiros, health e metrics; casos de uso reais e ports com repositórios controlados. Não importa `AppModule` com MikroORM. |
| Vite local | **Parcial** | Página e módulo React responderam 200 em `127.0.0.1:5173`; sem backend/banco e sem interação de navegador. |
| PostgreSQL, migrations e testes integrados | **Pendente** | Não executados conforme restrição; nenhuma migration ou conexão foi iniciada. |
| SQS, Inbox/Outbox e LocalStack | **Pendente** | Nenhuma fila/worker foi iniciado; doubles dos testes unitários não provam processamento distribuído. |
| Browser/DOM, teclado e responsividade | **Pendente à época** | SSR verificava as seis telas no estado inicial. Foi coberto posteriormente pela Etapa 9, acima. |

### Contratos HTTP exercitados

- `GET /health/live`, `GET /health/ready` (200 e 503) e `GET /metrics` (texto Prometheus).
- `GET /dashboard/summary`; listagens `GET /beneficiaries`, `/dividends`, `/obligations`, `/payments` e `/ledger`, com defaults, limite máximo, filtros aceitos e entradas malformadas.
- `POST /beneficiaries`, `POST /dividends`, `POST /dividends/:id/declare`, `POST /dividends/:id/obligations` e `POST /obligations/:id/payment-instructions`, incluindo sucesso, valores inválidos, estado inválido, duplicação no aggregate de teste, ausência de recurso, cabeçalhos de idempotência ausentes/vazios, replay e conflito de payload no repositório double.
- `GET /beneficiaries/:id`, `/dividends/:id`, `/obligations/:id`, `/payments/:id` e `/ledger/:id` com resultado inexistente (404). Respostas também cobrem conflito persistente simulado (`23505`) e exceção inesperada sanitizada (500).

Os testes dos headers demonstram que a rota exige valores não vazios depois de `trim`, e que o caso de uso recebe scope/key. A API ainda não define sintaxe ou comprimento máximo para essas strings; essa política fica pendente de decisão. Replays e conflito do teste são comportamento do double local: **não são evidência de idempotência PostgreSQL, transação, reinício ou concorrência entre instâncias**.

### Problemas e correções desta etapa

- Corrigido o reconhecimento indevido de statuses chamados `constructor`, `toString` ou `__proto__`; agora só chaves próprias são conhecidas e os demais estados recebem aviso de desconhecido.
- Corrigido o binding potencialmente externo do endpoint de métricas de worker: `WORKER_METRICS_HOST` passa pela mesma validação loopback, coberta por teste.
- Adicionada trava single-flight às ações de criação de beneficiário/dividendo/obrigação, declaração e solicitação lógica para suprimir chamadas repetidas enquanto a operação está em andamento. Isso é proteção de UX em uma instância, não garantia de idempotência distribuída.
- Redação de logs e diagnóstico Outbox: workers não serializam mais texto livre de exceção; preservam nome/código seguro e omitem detalhes que poderiam conter query, payload ou credencial.
- Criado teste Nest HTTP isolado e ampliados testes de API client, estados SSR, acessibilidade estrutural, paginação de componente, Money/formulários e estados desconhecidos.

### Segurança e decisões pendentes

- CORS continua limitado à origem HTTP loopback exata; API, Vite e métricas worker bindam somente loopback. Testes unitários verificam validadores, mas o middleware CORS real não foi exercitado em runtime.
- Nenhuma credencial financeira está codificada no backend/frontend; `.env.example` usa somente valores locais e chaves AWS dummy para LocalStack. `.env` real não foi lido nem exposto nesta rodada.
- Não há autenticação ou autorização. Antes de qualquer exposição em rede, definir identidade, papéis/permissões de leitura e escrita, escopo de idempotência do chamador, proteção de ações financeiras, auditoria de operador e gestão segura de sessão/segredo. Não adicionar login de demonstração.
- O modelo de beneficiário só guarda ID interno/data; se dados pessoais forem aprovados depois, definir minimização, acesso por função, redação de logs, retenção e trilha de auditoria.
- Não há ação de editar/excluir ledger nem operação HTTP que marque pagamento como liquidado. A instrução lógica continua distinta de `PAID`.

### Verificações que continuam pendentes

1. Inicialização do `AppModule` de produção, resolução completa MikroORM/providers, smoke HTTP real e CORS permitido/negado com banco inicializado.
2. Migrations `up/down/up` em banco descartável, constraints/triggers, imutabilidade/truncate do ledger, FKs, atomicidade e reconciliação operacional SQL.
3. Integração em PostgreSQL real: leituras, paginação/filtros, dashboard, cenários de erros SQL, rollback e consistência do ledger/Outbox.
4. Concorrência multi-conexão/processo: obrigação única, pagamento único por obrigação, requisições idênticas, replay, mesma chave com payload diferente, reinício e resultado original persistido.
5. SQS/LocalStack: publicar somente após commit, Inbox duplicada/redelivery, retries/backoff/DLQ, workers múltiplos, recuperação, ausência de ciclos, métricas reais e SIGTERM.
6. Browser: os cliques, formulários, filtros/paginação, confirmação, falha controlada da API, foco/Tab/Escape e larguras desktop/tablet/celular foram exercitados na Etapa 9. Leitor de tela, dispositivos físicos, API real e conectividade de backend seguem pendentes.
7. Teste de bootstrap do frontend com backend real, dados vazios/reais e garantia visual de que instrução não se apresente como liquidação.

Não executar `bun run test:integration`, `bun run test:concurrency` ou migrations até haver `TEST_DATABASE_URL` conferido apontando para banco dedicado e autorização/ambiente de teste isolado. A prevenção de duplicidade distribuída continua **não validada**.

## Resultado da Etapa 7 — revisão sem iniciar Docker (2026-11-16)

O cliente Docker está instalado em caminho por usuário: `docker.exe --version` retornou Docker 29.9.3 e `docker.exe compose version` retornou Compose v5.7.0. Por instrução do usuário, não consultei o daemon, não iniciei Docker/Compose e não executei comando que dependa de virtualização. Portanto, estado de containers, imagens, volumes e disponibilidade do daemon não foi verificado. Nenhum volume ou banco foi tocado.

Não encontrei PostgreSQL nativo: `psql`, `pg_isready`, `postgres` e `initdb` não estão no PATH; os diretórios padrão de instalação e serviços Windows PostgreSQL não apareceram na inspeção. Não há `.env` nem variáveis de conexão no processo. A versão/distribuição WSL segue não confirmada pela observação anterior (`wsl --version` exibiu ajuda); nenhuma configuração do sistema foi alterada.

| Verificação | Estado | Evidência |
|---|---|---|
| Bun e dependências | Disponível com ajuste de PATH | Bun `1.4.4`; `node_modules/` presente. O nome `bun` não resolve nesta sessão PowerShell; os scripts foram invocados por `%USERPROFILE%\.bun\bin\bun.exe`. |
| Docker CLI / Compose | Disponíveis; sem execução | Docker CLI 29.9.3 e Compose v5.7.0 detectados. Nenhuma chamada ao daemon, container, volume ou serviço foi feita. |
| PostgreSQL nativo | Não encontrado | `psql`, `pg_isready`, `postgres`, `initdb`, diretórios padrão e serviços Windows correspondentes ausentes na inspeção. |
| LocalStack / SQS | Não verificado/indisponível nesta rodada | Nenhuma fila nem container inicializado. Não executei chamadas ao daemon/LocalStack. |
| API / frontend | API não iniciada; frontend isolado iniciado | O painel serviu em `127.0.0.1:5173`; a API depende de PostgreSQL com migrations. Após a conferência, o Vite foi encerrado. |
| Arquivo de configuração | Pendente | `.env.example` existe; `.env`, `DATABASE_URL`, `TEST_DATABASE_URL` e `AWS_ENDPOINT_URL` não estão configurados no ambiente. Nenhum segredo foi lido ou exibido. |
| Dados/volumes | Intocados | Não iniciei nem consultei o daemon; não criei, removi ou alterei bancos, containers ou volumes. |
| Testes unitários | Passou | `bun run test:unit`: backend 85/85 e frontend 11/11; 96 passaram, 0 falharam. Nenhum teste de integração foi contado. |
| Typecheck | Passou | `bun run typecheck`: backend e frontend em TypeScript strict. |
| Build | Passou | `bun run build`: backend e frontend. Vite gerou o bundle de produção. |
| Frontend isolado | Parcial | Vite iniciou em `127.0.0.1:5173`; HTTP `/` e módulo React retornaram 200. Testes unitários cobrem a mensagem de indisponibilidade do cliente API e renderização sem dados fictícios. `/health/live` não respondeu porque a API não foi iniciada. Servidor encerrado ao final. Desktop/tablet/celular não foram inspecionados em viewports reais nesta rodada. |
| Responsividade e acessibilidade | Revisão estática/testes unitários | CSS define breakpoints `1100`, `760` e `480` px, rolagem horizontal nas tabelas, foco visível e preferência por movimento reduzido; testes SSR verificam navegação de seis seções e títulos. Interação por teclado/toque e layout em viewports reais permanecem pendentes. |
| Módulos e contratos NestJS | Revisão estática | Os módulos de API, persistência, application services e mensageria registram controllers/providers por tokens. O smoke de DI/rotas requer inicialização com PostgreSQL e segue pendente. |
| Segurança | Revisão estática parcial | API/Vite são limitados a loopback e CORS usa origem local exata; o Compose foi ajustado para publicar PostgreSQL e LocalStack em `127.0.0.1`. Não existe autenticação/autorização e não é seguro expor o sistema à rede. Workers não serializam corpos de comando completos, mas registram mensagens de erro e Inbox/Outbox persiste `last_error` truncado; implementar política de redação/retensão antes de receber dados pessoais/segredos. CORS real e o binding Compose não foram validados em runtime. |
| Proteção de banco de teste | Passou em teste unitário | Nova comparação de alvos PostgreSQL ignora credenciais, normaliza aliases loopback e bloqueia o mesmo host/porta/banco entre `TEST_DATABASE_URL` e `DATABASE_URL` antes do bootstrap da suíte integrada. Não prova isolamento de outros bancos/servidores; as URLs devem ser conferidas manualmente. |

### Testes integrados não executados

Não foram executados `bun run test:integration`, `bun run test:concurrency`, migrations, testes SQL, smoke HTTP, workers, LocalStack ou testes de navegador com backend. Eles continuam **pendentes**, não aprovados nem substituídos por mocks. Nesta rodada não há evidência real de migrations, constraints/triggers PostgreSQL, imutabilidade do ledger, atomicidade, reconciliação, consultas SQL do dashboard, prevenção concorrente de duplicidade, Inbox/Outbox, redelivery, retries/DLQ, recuperação ou shutdown gracioso. A garantia fim a fim contra pagamento duplicado continua **não validada**.

### Plano de validação com PostgreSQL nativo (não executado)

1. Instale PostgreSQL pelo [instalador Windows indicado pela página oficial do projeto](https://www.postgresql.org/download/windows/), sem executar essa instalação nesta rodada. Prefira a mesma versão principal do Compose e mantenha o serviço no loopback.
2. Com `psql`, confira roles e bancos antes de criar algo. Prepare databases novos e distintos, `dividend_control` e `dividend_control_test`, e configure `.env` com URLs locais. A suíte aborta se detectar o mesmo alvo em `DATABASE_URL` e `TEST_DATABASE_URL`, mas revise host/porta/banco manualmente também.
3. Aplique `bun run db:migration:up` somente ao banco local de desenvolvimento escolhido após conferir a URL. Use `bun run test:integration` e `bun run test:concurrency` somente no banco dedicado `TEST_DATABASE_URL`; a suíte deixa seus dados de teste e migrations nesse banco.
4. Para reversibilidade, crie um terceiro banco descartável exclusivo de migration e execute `up/down/up` nele. `down` remove objetos e dados dessa migration; não use o banco de desenvolvimento ou qualquer banco com dados importantes.
5. Sem LocalStack, mantenha os workers desligados. `/health/ready` pode retornar 503 por SQS mesmo quando PostgreSQL está saudável. A revisão de API/queries pode prosseguir no modo limitado, mas Inbox/Outbox distribuído, filas, retries, DLQ e encerramento gracioso aguardam futura infraestrutura real.
6. Para a validação completa de SQS/LocalStack, aguarde sua autorização para usar um ambiente com virtualização habilitada ou outra instalação LocalStack aprovada. Não inicialize Docker nesta rodada.

### Revisão estática de fluxos e camadas

- Controllers HTTP traduzem requests para application services; repositórios implementam as portas; regras financeiras permanecem no domínio. O Nest grafa serviços por módulos/tokens. A composição da aplicação não pôde ser iniciada porque MikroORM precisa conectar ao PostgreSQL.
- Criação de obrigação verifica dividendo declarado, beneficiário e moeda; grava obrigação, reconhecimento do ledger e Outbox em transação. A unicidade `(dividend_id, beneficiary_id)` e a atomicidade só podem ser comprovadas por PostgreSQL real.
- Solicitação lógica persiste idempotency record, trava a linha da obrigação, atualiza estado e grava payment/outbox na mesma transação. `UNIQUE(obligation_id)` limita uma instrução por obrigação; a comparação de chave/payload é feita pelo hash canônico persistido. Comportamento concorrente e replay pós-reinício seguem pendentes de execução real.
- Inbox participa da transação PostgreSQL do caso de uso e ack ocorre depois que o processamento retorna; publisher Outbox utiliza leases/`SKIP LOCKED`. São achados da leitura de código e testes isolados existentes, não comprovação distribuída.
- Não há endpoint/consumer que confirme pagamento ou gere liquidação/estorno nesta versão. Não foram chamadas APIs bancárias.
- Domínio mantém montantes como strings/bigint, API rejeita amounts numéricos, BRL é limitado a duas casas na aplicação/persistência. Testes unitários cobrem Money, transições principais, hash canônico, validação de chave não vazia e processamento de mensagens isolado. A rejeição transacional de payload divergente com chave persistida é coberta pela suíte PostgreSQL pendente, não por prova unitária desta rodada.
- Pendências de negócio preservadas: dados pessoais e identidade externa do beneficiário; semântica/datas e fuso; valor total vs parâmetro da declaração; moeda/escala adicional; escopo do chamador para idempotência; fluxo de alteração/cancelamento; regras de liquidação parcial, reenvio, retry, reversão e confirmação; semântica contábil além do ledger operacional.

## Resultado da Etapa 6 — painel e leituras administrativas

Verificações locais executadas em 2026-11-16. O workspace não foi iniciado contra PostgreSQL/LocalStack nesta etapa; os cenários dependentes desses serviços continuam pendentes conforme combinado e não são substituídos por doubles.

| Verificação | Estado | Evidência |
|---|---|---|
| Testes unitários backend | Passou | `bun run test:unit`: 81 testes backend passaram, 0 falharam. Inclui 2 casos novos para paginação/filtros administrativos. |
| Testes unitários frontend | Passou | A mesma execução: 9 testes frontend passaram, 0 falharam (cliente HTTP, falhas de conexão, URL somente local, validação de formulários, formatação monetária textual, estado desconhecido e componentes de vazio/status). |
| Typecheck | Passou | `bun run typecheck`: backend e frontend em TypeScript strict. |
| Build | Passou | `bun run build`: backend TypeScript e bundle de produção Vite compilaram. |
| Smoke visual/manual no browser | Parcial | Preview local em viewport móvel: navegação recolhida, cabeçalho, erro de backend e conteúdo sem overflow horizontal visível. As páginas com dados e os breakpoints desktop/tablet, além da navegação completa por teclado, aguardam execução com API disponível. |
| Smoke HTTP e grafo de DI Nest | Pendente | Inicializar API com migrations aplicadas; confirmar registro/roteamento de `GET /dashboard/summary` e rotas de lista, além de CORS local permitido e origem externa recusada. |
| PostgreSQL: listagens e filtros da UI | Pendente | Com banco real, validar as seis rotas de leitura, joins, filtros, limites (`limit=1`, default 20, máximo 100), paginação fora do intervalo, totais e resposta vazia. Não foi usado mock como prova das queries SQL. |
| Dashboard com dados reais | Pendente | Validar contagens de entidades/status, estados Outbox e reconciliação com fixtures controladas em PostgreSQL; conferir estado vazio, divergências e eventual status futuro/desconhecido. |
| Migrations e compatibilidade do schema | Pendente | Aplicar/reverter/reaplicar migrations em banco descartável antes do smoke de UI. Os testes permanecem os mesmos descritos na seção de validação conjunta abaixo. |
| Concorrência, Inbox, Outbox, SQS e LocalStack | Pendente | Nenhum teste distribuído foi executado nesta etapa; ver matriz detalhada da Etapa 5 e validação conjunta. A garantia contra pagamento duplicado segue não validada fim a fim. |

Contagem unitária agregada: **90 testes passaram** (81 backend + 9 frontend), sem falhas ou testes ignorados nessa execução. O build gera saídas em diretórios `dist/` ignorados pelo `.gitignore`.

## Resultado da Etapa 5

**Nenhum teste ignorado ou executado com doubles conta como validação real de PostgreSQL, concorrência ou distribuição.** Os testes que exigem Docker, PostgreSQL ou LocalStack foram adiados para a validação conjunta, conforme acordado.

| Verificação | Estado | Evidência |
|---|---|---|
| Testes unitários | Passou | `bun run test:unit`: 79 passaram, 0 falharam, 0 ignorados. Inclui 13 testes novos de primitivas/workers de mensageria; doubles verificam lógica local de coordenação e não substituem provas reais de distribuição. |
| Typecheck | Passou | `bun run typecheck`: backend e frontend em TypeScript strict. |
| Build | Passou | `bun run build`: backend e frontend compilaram após as alterações da Etapa 5. |
| Smoke test HTTP `/metrics` e API | Pendente | Inicializar Nest com PostgreSQL e LocalStack, confirmar grafo DI/rotas, formato Prometheus em `127.0.0.1:3000/metrics` e métricas do worker em `127.0.0.1:3001/metrics`. |
| Inicialização do processo separado de workers | Pendente | Executar `bun run dev:worker` e confirmar bootstrap, criação/configuração das filas, endpoint de métricas, sinais SIGTERM/SIGINT e encerramento limpo. |
| Migrations `up` e `down` | Pendente | Aplicar/reverter/reaplicar em banco descartável; validar `Migration20261116000000` e `Migration20261116010000`, inclusive status/constraint/coluna Outbox `DEAD_LETTERED` e downgrade que retorna dead letters a `PENDING`. |
| PostgreSQL: persistência e constraints | Pendente | Os 11 cenários PostgreSQL preexistentes ficaram pendentes/ignorados por ausência de `TEST_DATABASE_URL`; validar FKs, BRL/escala, transições, unicidades, ledger imutável e idempotência persistente. |
| Atomicidade Inbox + caso de uso | Pendente | Em PostgreSQL real, comprovar que Inbox `PROCESSED`, alteração do agregado, Payment/ledger/Outbox commitam juntos; injetar falha antes do commit e confirmar rollback integral. |
| Inbox concorrente e hash divergente | Pendente | Entregar o mesmo `messageId` em conexões/processos independentes; uma execução deve produzir efeito. Repetir o ID com payload diferente e confirmar rejeição sem mutação da mensagem já processada. |
| Ack após commit e janela de falha | Pendente | Com LocalStack/PostgreSQL, comprovar ausência de `DeleteMessage` antes do commit, ack depois dele, e redelivery idempotente se o ack falhar ou o processo cair após commit. |
| Outbox pós-commit | Pendente | Verificar que publisher não vê evento antes do commit de origem e envia depois que a transação fica visível. |
| Outbox multiworker/leases | Pendente | Executar instâncias independentes: `SKIP LOCKED`, lease token, lease expirado e fencing devem impedir que worker obsoleto marque registro de outro worker. |
| Duplicata na janela SQS-send/DB-mark | Pendente | Simular confirmação SQS seguida de crash/falha antes de `markPublished`; a nova publicação é esperada e o consumidor downstream deverá suprimir efeito com Inbox. |
| Backoff e limite Outbox | Pendente | Validar timings, limite `OUTBOX_MAX_ATTEMPTS`, persistência do estado `DEAD_LETTERED`, logs e procedimento de recuperação/replay operacional. |
| Criação das filas e redrive LocalStack | Pendente | Validar filas standard de comandos/eventos, duas DLQs distintas, `RedrivePolicy`, long polling, visibilidade, retenção e reconfiguração idempotente no LocalStack. |
| SQS: comandos de ponta a ponta | Pendente | Publicar cada tipo suportado; testar payload inválido, command type desconhecido, comando de negócio inválido, SQS duplicado e mensagem com `messageId` estável em processos concorrentes. |
| Retry e DLQ de consumer | Pendente | Confirmar backoff via `ChangeMessageVisibility`, tratamento de erro transitório/permanente/de negócio, limite de receive, chegada à DLQ e ausência de ack em falha. |
| Outbox SQS evento | Pendente | Confirmar que tipos permitidos chegam somente à fila de eventos, com `correlationId`; garantir que consumer de comandos nunca lê a fila de eventos (sem ciclo). |
| Shutdown gracioso | Pendente | Enviar SIGTERM com long poll ativo e com mensagem processando; worker deve parar novos polls, aguardar handler/ack concluído e deixar falhas não ackadas para redelivery. |
| Logs e métricas reais | Pendente | Verificar JSON em stdout, propagação de `correlationId`, contadores `/metrics` por processo e comportamento após reinício. Métricas locais não são armazenamento durável. |
| Concorrência multi-processo financeira | Pendente | Executar múltiplas instâncias HTTP/worker em conexões independentes sob carga; revalidar obrigação única, pagamento único e idempotência persistente. |
| Garantia fim a fim contra pagamento duplicado | **Não validada** | Código usa Inbox/Idempotency persistentes e constraints/transações da Etapa 3, mas os cenários PostgreSQL+SQS concorrentes ainda não foram executados. Não declarar a garantia totalmente validada. |

## Testes unitários da Etapa 5

Os 13 novos testes exercitam parsing e validação de envelopes, nomes separados de fila standard, backoff, logs/métricas locais, envio Outbox, comportamento de falha e limite, roteamento de comandos, configuração de redrive, ack somente após conclusão do callback e caminho de duplicata. Eles usam doubles para isolar as classes e comprovar decisões locais do código. **Não comprovam** commit PostgreSQL, concorrência entre processos, redrive real, comportamento de LocalStack, janela de queda SQS/DB nem encerramento de processo sob sinal.

## Execução da validação conjunta

Em ambiente com Docker, copiar `.env.example`, iniciar `docker compose up -d postgres localstack`, aplicar `bun run db:migration:up`, aguardar health dos serviços e iniciar `bun run dev:worker`. Validar `/health/ready`, `/metrics`, API, filas e DLQs. Depois executar `bun run test:integration` e `bun run test:concurrency`, além dos novos cenários reais de LocalStack listados acima. Rollback deve usar banco descartável. Os testes integrados e de concorrência não foram executados nesta etapa, como combinado; qualquer skip continua pendente, nunca aprovado.
