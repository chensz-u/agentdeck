import { RunEventBus } from "./run-event-bus";
import { RunEventStore, type RunEvent } from "./run-event-store";

type RunEventsHandlerOptions = {
  store: RunEventStore;
  bus: RunEventBus;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

const encoder = new TextEncoder();

function formatEvent(event: RunEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Creates an SSE handler with injectable dependencies for route-level tests. */
export function createRunEventsHandler({ store, bus }: RunEventsHandlerOptions) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { id } = await context.params;
    let replayed: RunEvent[];

    try {
      replayed = await store.replay(id);
    } catch (error) {
      if (error instanceof TypeError && error.message === "Invalid run id") {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    let unsubscribe = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const lastReplayedSequence = replayed.at(-1)?.sequence ?? 0;
        let replaying = true;
        const queued: RunEvent[] = [];
        unsubscribe = bus.subscribe(id, (event) => {
          if (replaying) {
            queued.push(event);
          } else {
            controller.enqueue(formatEvent(event));
          }
        });

        replayed.forEach((event) => controller.enqueue(formatEvent(event)));
        replaying = false;
        queued
          .filter((event) => event.sequence > lastReplayedSequence)
          .forEach((event) => controller.enqueue(formatEvent(event)));
      },
      cancel() {
        unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  };
}
