import { exportUserData } from "@/lib/export";
import { getCurrentUserId } from "@/lib/owner";

// Downloads all of the user's data as a JSON file.
export async function GET() {
  const data = await exportUserData(await getCurrentUserId());
  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voxi-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
