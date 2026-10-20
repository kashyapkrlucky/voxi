import { handle, readJson, searchParams } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { createTask, findTasks } from "@/lib/tasks/repo";
import { createTaskInput, findTasksInput } from "@/lib/tasks/schema";

export async function GET(req: Request) {
  return handle(async () => findTasks(await getCurrentUserId(), findTasksInput.parse(searchParams(req))));
}

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle(async () => createTask(await getCurrentUserId(), createTaskInput.parse(body)), 201);
}
