import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createProjectsRouteHandlers,
  type ProjectStore,
} from "../../../lib/api/project-route-handlers";
import type { RegisteredProject } from "../../../lib/services/project-service";

class InMemoryProjectStore implements ProjectStore {
  readonly projects: RegisteredProject[] = [];

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

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-api-project-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  return directory;
}

describe("POST /api/projects", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects an invalid payload", async () => {
    const handlers = createProjectsRouteHandlers(new InMemoryProjectStore());

    const response = await handlers.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "", path: 42 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects payloads with command-related fields", async () => {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    const handlers = createProjectsRouteHandlers(new InMemoryProjectStore());

    const response = await handlers.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Fixture API",
          path: fixture,
          cwd: fixture,
          shell: "powershell.exe",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("registers a canonical Git project", async () => {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    const handlers = createProjectsRouteHandlers(new InMemoryProjectStore());

    const response = await handlers.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Fixture API", path: fixture }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      name: "Fixture API",
      path: realpathSync(fixture),
      isGitRepository: true,
    });
  });
});
