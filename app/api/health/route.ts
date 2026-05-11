export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ax-champion-bot",
    time: new Date().toISOString(),
  });
}
