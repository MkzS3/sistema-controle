# Concurrency tests

The PostgreSQL-backed simultaneous request tests live in `../integration/persistence.integration.test.ts` and run via `bun run test:concurrency`. They require `TEST_DATABASE_URL`; no in-memory mock is used as evidence. The Etapa 5 inbox/outbox/SQS duplicate-delivery races, lease fencing, multi-worker processing, and multi-process stress remain pending the joint Docker/PostgreSQL/LocalStack validation.
