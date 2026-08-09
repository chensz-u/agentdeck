import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };
const stopSchema = z.object({ runId: z.string().trim().min(1) }).strict();

export type StopTaskAction = {
  stop(runId: string): Promise<void>;
};

export function createTaskStopRouteHandlers(service: StopTaskAction) {
  return {
    async POST(request: Request, _context: RouteContext): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = stopSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Invalid stop payload" }, { status: 400 });
      try {
        await service.stop(parsed.data.runId);
        return new Response(null, { status: 204 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to stop run" },
          { status: 400 },
        );
      }
    },
  };
}
