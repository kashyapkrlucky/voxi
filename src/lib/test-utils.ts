import { prisma } from "@/lib/db";

// Each test file gets its own throwaway user so tests don't see each other's rows.
export async function createTestUser() {
  const user = await prisma.user.create({
    data: { email: `test-${crypto.randomUUID()}@voxi.test` },
  });
  return {
    userId: user.id,
    cleanup: () => prisma.user.delete({ where: { id: user.id } }),
  };
}
