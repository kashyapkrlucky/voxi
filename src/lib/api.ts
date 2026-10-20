import { ZodError } from "zod";
import { NotFoundError, PlanStateError } from "@/lib/errors";

// Runs a route handler body and maps known errors to HTTP responses.
export async function handle(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    return Response.json(await fn(), { status });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
    }
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof PlanStateError) return Response.json({ error: err.message }, { status: 409 });
    console.error(err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function searchParams(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}
