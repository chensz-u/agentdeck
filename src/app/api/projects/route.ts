import { createProjectsRouteHandlers } from "../../../lib/api/project-route-handlers";
import { serverComposition } from "../../../lib/server/composition";

const handlers = createProjectsRouteHandlers(serverComposition.repository);

export const GET = handlers.GET;
export const POST = handlers.POST;
