import { describe, expect, it } from "vitest";

import { createProjectRouteHandlers, type ProjectStore } from "../../../../lib/api/project-route-handlers";
import type { RegisteredProject } from "../../../../lib/services/project-service";

class InMemoryProjectStore implements ProjectStore {
  constructor(private readonly project: RegisteredProject | null) {}

  async createProject(): Promise<RegisteredProject> {
    throw new Error("not used");
  }

  async listProjects(): Promise<RegisteredProject[]> {
    return this.project ? [this.project] : [];
  }

  async findProject(id: string): Promise<RegisteredProject | null> {
    return this.project?.id === id ? this.project : null;
  }
}

describe("GET /api/projects/[id]", () => {
  it("returns a registered project", async () => {
    const handlers = createProjectRouteHandlers(
      new InMemoryProjectStore({
        id: "project-1",
        name: "Fixture",
        path: "C:\\fixture",
        isGitRepository: true,
      }),
    );

    const response = await handlers.GET(new Request("http://localhost/api/projects/project-1"), {
      params: Promise.resolve({ id: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "project-1" });
  });

  it("returns 404 for an unknown project", async () => {
    const handlers = createProjectRouteHandlers(new InMemoryProjectStore(null));

    const response = await handlers.GET(new Request("http://localhost/api/projects/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });
});
