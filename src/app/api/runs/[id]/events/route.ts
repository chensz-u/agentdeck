import { createRunEventsHandler } from "../../../../../lib/services/run-events-sse";
import { serverComposition } from "../../../../../lib/server/composition";

export const GET = createRunEventsHandler({
  store: serverComposition.runEventStore,
  bus: serverComposition.runEventBus,
});
