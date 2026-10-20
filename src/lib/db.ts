import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // Neon's serverless driver for Neon hosts; plain node-postgres for any other Postgres.
  const adapter = connectionString.includes(".neon.tech")
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in dev. After `prisma generate` the PrismaClient class is new,
// so a client cached from the old one (missing new models) is replaced instead of reused.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

const cached = globalForPrisma.prisma;
export const prisma = cached instanceof PrismaClient ? cached : createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Db = typeof prisma;
