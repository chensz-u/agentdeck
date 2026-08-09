import { createProjectRouteHandlers } from "../../../../lib/api/project-route-handlers";
import { serverComposition } from "../../../../lib/server/composition";

const handlers = createProjectRouteHandlers(serverComposition.repository);

export const GET = handlers.GET;
