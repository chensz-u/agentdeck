export async function POST(): Promise<Response> {
  return Response.json(
    { error: "Run service has not been configured" },
    { status: 503 },
  );
}
