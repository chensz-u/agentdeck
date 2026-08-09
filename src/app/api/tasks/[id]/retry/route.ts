export async function POST(): Promise<Response> {
  return Response.json(
    { error: "Task service has not been configured" },
    { status: 503 },
  );
}
