import { RunEventBus } from "./run-event-bus";
import { assertRunId, RunEventStore, type RunEvent } from "./run-event-store";

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

    try {
      assertRunId(id);
    } catch (error) {
      if (error instanceof TypeError && error.message === "Invalid run id") {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    let unsubscribe: () => void = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let replaying = true;
        let lastSentSequence = 0;
        const queued: RunEvent[] = [];
        const send = (event: RunEvent) => {
          if (event.sequence > lastSentSequence) {
            lastSentSequence = event.sequence;
            controller.enqueue(formatEvent(event));
          }
        };

        unsubscribe = bus.subscribe(id, (event) => {
          if (replaying) {
            queued.push(event);
          } else {
            send(event);
          }
        });

        try {
          const replayed = await store.replay(id);
          [...replayed, ...queued]
            .sort((left, right) => left.sequence - right.sequence)
            .forEach(send);
          replaying = false;
        } catch (error) {
          unsubscribe();
          controller.error(error);
        }
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
