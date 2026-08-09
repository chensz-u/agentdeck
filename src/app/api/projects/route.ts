import { z } from "zod";

import {
  ProjectService,
  type ProjectRepository,
  type RegisteredProject,
} from "../../../lib/services/project-service";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
}).strict();

export interface ProjectStore extends ProjectRepository {
  listProjects(): Promise<RegisteredProject[]>;
  findProject(id: string): Promise<RegisteredProject | null>;
}

class InMemoryProjectStore implements ProjectStore {
  private readonly projects: RegisteredProject[] = [];

  async createProject(input: Omit<RegisteredProject, "id">): Promise<RegisteredProject> {
    const project = { id: `project-${this.projects.length + 1}`, ...input };
    this.projects.push(project);
    return project;
  }

  async listProjects(): Promise<RegisteredProject[]> {
    return this.projects;
  }

  async findProject(id: string): Promise<RegisteredProject | null> {
    return this.projects.find((project) => project.id === id) ?? null;
  }
}

export const projectStore: ProjectStore = new InMemoryProjectStore();

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

      if (!input.success) {
        return Response.json({ error: "Invalid project payload" }, { status: 400 });
      }

      try {
        const project = await service.registerProject(input.data);
        return Response.json(project, { status: 201 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to register project" },
          { status: 400 },
        );
      }
    },
  };
}

const handlers = createProjectsRouteHandlers(projectStore);

export const GET = handlers.GET;
export const POST = handlers.POST;
