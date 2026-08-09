import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectService, type ProjectRepository } from "./project-service";

type RegisteredProject = {
  id: string;
  name: string;
  path: string;
  isGitRepository: boolean;
};

class InMemoryProjectRepository implements ProjectRepository {
  readonly projects: RegisteredProject[] = [];

  async createProject(input: Omit<RegisteredProject, "id">): Promise<RegisteredProject> {
    const project = { id: `project-${this.projects.length + 1}`, ...input };
    this.projects.push(project);
    return project;
  }
}

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-project-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  return directory;
}

describe("ProjectService.registerProject", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("registers a Git repository using its canonical absolute path", async () => {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    const repository = new InMemoryProjectRepository();

    const project = await new ProjectService(repository).registerProject({
      name: "Fixture",
      path: fixture,
    });

    expect(project).toEqual({
      id: "project-1",
      name: "Fixture",
      path: realpathSync(fixture),
      isGitRepository: true,
    });
  });

  it("rejects a relative project path", async () => {
    await expect(
      new ProjectService(new InMemoryProjectRepository()).registerProject({
        name: "Relative",
        path: "relative/project",
      }),
    ).rejects.toThrow("Project path must be absolute");
  });

  it("rejects a path that does not exist", async () => {
    await expect(
      new ProjectService(new InMemoryProjectRepository()).registerProject({
        name: "Missing",
        path: join(tmpdir(), "agentdeck-project-does-not-exist"),
      }),
    ).rejects.toThrow("Project path does not exist");
  });

  it("rejects an existing directory that is not a Git repository", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "agentdeck-directory-"));
    fixtures.push(fixture);

    await expect(
      new ProjectService(new InMemoryProjectRepository()).registerProject({
        name: "Not Git",
        path: fixture,
      }),
    ).rejects.toThrow("Project path is not a Git repository");
  });
});
