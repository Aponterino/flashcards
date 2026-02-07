# Flashcards (Next.js + Drizzle + Postgres)

This repo scaffolds a multi-page flashcards app with Next.js App Router, Drizzle ORM, and Postgres.

## Getting started

1. Start Postgres and the app in Docker:

   ```bash
   docker compose up --build
   ```

2. Visit `http://localhost:3000`.

## Local development

```bash
npm install
npm run dev
```

## Database migrations (Drizzle)

```bash
npm run db:generate
npm run db:migrate
```

## Environment variables

- `DATABASE_URL`: Postgres connection string

Example:

```
DATABASE_URL=postgres://flashcards:flashcards@localhost:5432/flashcards
```

You can copy `.env.example` to `.env` and update as needed.
