import { connection } from "next/server";
import { handle } from "@/lib/api";
import { exportUserData } from "@/lib/export";
import { getCurrentUserId } from "@/lib/owner";

// Downloads all of the user's data as a JSON file.
export async function GET() {
  await connection(); // per-user data: run at request time, never prerender at build
  let data;
  try {
    data = await exportUserData(await getCurrentUserId());
  } catch (err) {
    return handle(() => Promise.reject(err));
  }
  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voxi-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
