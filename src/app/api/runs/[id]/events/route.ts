import { RunEventBus } from "../../../../../lib/services/run-event-bus";
import { RunEventStore } from "../../../../../lib/services/run-event-store";
import { createRunEventsHandler } from "../../../../../lib/services/run-events-sse";

const bus = new RunEventBus();
const store = new RunEventStore({ bus });

export const GET = createRunEventsHandler({ store, bus });
