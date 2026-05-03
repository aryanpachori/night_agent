import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/** Prisma CLI (migrate, db push, validate) reads the DB URL from here — not from schema.prisma (Prisma ORM 7+). */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
