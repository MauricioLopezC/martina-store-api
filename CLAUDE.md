# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm start:dev        # watch mode
pnpm build            # compile to dist/
pnpm start:prod       # run compiled output

# Testing
pnpm test             # unit tests (jest, rootDir: src/)
pnpm test:watch       # watch mode
pnpm test:cov         # coverage report
pnpm test:e2e         # e2e tests against real DB (--runInBand --forceExit)

# Run a single test file
pnpm test -- src/users/users.service.spec.ts

# Code quality
pnpm lint             # ESLint with auto-fix
pnpm format           # Prettier

# Database (Docker)
docker compose up -d  # start Postgres 17 on port 5432
```

## Environment

Copy `.env.example` to `.env`. Required variables:

| Variable | Default |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_USERNAME` | `postgres` |
| `DB_PASSWORD` | _(set in docker-compose: `1234`)_ |
| `DB_NAME` | `martina-store-nest` |
| `JWT_SECRET` | _(any string)_ |
| `JWT_EXPIRES_IN` | `1h` |

TypeORM runs with `synchronize: true` — schema is auto-synced from entities in dev.

## Architecture

Standard NestJS layered architecture with two feature modules:

```
AppModule
├── ConfigModule (global)
├── TypeOrmModule (Postgres via ConfigService)
├── UsersModule
└── AuthModule (depends on UsersModule)
```

**UsersModule** — CRUD for the `users` table. Passwords are hashed with bcrypt (salt rounds: 10) on create and update. The `User` entity uses `@Exclude()` on the `password` field; `ClassSerializerInterceptor` (registered globally in `main.ts`) strips it from all responses.

**AuthModule** — Passport-based auth with two strategies:
- `local` strategy (`LocalStrategy`) — validates email/password via `AuthService.validateUser`, used on `POST /auth/login`
- `jwt` strategy (`JwtStrategy`) — validates Bearer tokens, used via `JwtAuthGuard`

JWT payload shape: `{ sub: user.id, email, role }`.

**Role-based access** — `Role` enum (`user` | `admin`). Apply with `@Roles(Role.Admin)` decorator + `RolesGuard`. The guard reads roles from route metadata via `Reflector`; routes without `@Roles` pass through.

**Global setup** (`main.ts`):
- `AppExceptionFilter` — catches `AppError` subclasses and maps them to HTTP responses
- `ValidationPipe({ whitelist: true })` — strips unknown properties from DTOs
- `ClassSerializerInterceptor` — applies `class-transformer` exclusions (e.g., `password`)

## Error handling

Services never throw HTTP exceptions. They throw application-level errors from `src/common/errors/`:

| Class | HTTP status |
|---|---|
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `UnauthorizedError` | 401 |

All extend `AppError` (abstract base). The `AppExceptionFilter` (`src/common/filters/app-exception.filter.ts`) catches them and returns `{ statusCode, message, error }`.

**Adding a new error type:** create a class extending `AppError` in `src/common/errors/`, then add an `instanceof` branch in `AppExceptionFilter`.

## Swagger / OpenAPI

The project uses the `@nestjs/swagger` CLI plugin (configured in `nest-cli.json`). This means:
- **No `@ApiProperty()` needed** — the plugin infers it automatically from TypeScript types in DTO classes.
- **No `@ApiResponse()` needed** — the plugin infers the response schema from the controller method's explicit return type.
- To expose a response schema, declare the return type on the controller method (e.g., `findAll(): Promise<ProductSummaryPageDto>`) and ensure the DTO is a named class in a `.dto.ts` file.

## Testing

- **Unit tests** live in `src/` next to the files they test (`*.spec.ts`). Jest config points `rootDir` to `src/`.
- **E2e tests** live in `test/` and use `jest-e2e.json`. They boot the full `AppModule` against a real database and clean up after themselves with raw SQL in `afterAll`.
