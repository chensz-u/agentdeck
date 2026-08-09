import { projectStore, type ProjectStore } from "../route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function createProjectRouteHandlers(repository: ProjectStore) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const project = await repository.findProject(id);

      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }

      return Response.json(project);
    },
  };
}

const handlers = createProjectRouteHandlers(projectStore);

export const GET = handlers.GET;
