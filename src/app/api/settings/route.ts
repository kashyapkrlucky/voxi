import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { getSettings, updateSettings, type UpdateSettingsInput } from "@/lib/settings";

export async function GET() {
  return handle(async () => getSettings(await getCurrentUserId()));
}

// { timezone?, workStart?, workEnd?, quietStart?, quietEnd? } with times as "HH:MM" (quiet ones nullable).
export async function PATCH(req: Request) {
  const body = await readJson(req);
  return handle(async () => updateSettings(await getCurrentUserId(), body as UpdateSettingsInput));
}
