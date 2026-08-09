import { z } from "zod";

import {
  ProjectService,
  type ProjectRepository,
  type RegisteredProject,
} from "../services/project-service";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
}).strict();

export interface ProjectStore extends ProjectRepository {
  listProjects(): Promise<RegisteredProject[]>;
  findProject(id: string): Promise<RegisteredProject | null>;
}

type RouteContext = { params: Promise<{ id: string }> };

export function createProjectsRouteHandlers(repository: ProjectStore) {
  const service = new ProjectService(repository);

  return {
    async GET(): Promise<Response> {
      return Response.json(await repository.listProjects());
    },

    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const input = createProjectSchema.safeParse(body);
      if (!input.success) return Response.json({ error: "Invalid project payload" }, { status: 400 });

      try {
        return Response.json(await service.registerProject(input.data), { status: 201 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to register project" },
          { status: 400 },
        );
      }
    },
  };
}

export function createProjectRouteHandlers(repository: ProjectStore) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const project = await repository.findProject(id);
      return project
        ? Response.json(project)
        : Response.json({ error: "Project not found" }, { status: 404 });
    },
  };
}
