// lib/db.ts — a single Prisma client across hot reloads / serverless invocations.
// Returns null when DATABASE_URL is not set, so the app can run on the bundled
// sample roster without a database (see lib/data.ts).
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient | null = process.env.DATABASE_URL
  ? (globalForPrisma.prisma ?? new PrismaClient())
  : null;

if (process.env.NODE_ENV !== "production" && prisma) globalForPrisma.prisma = prisma;
