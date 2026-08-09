import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GitService } from "./git-service";

function createGitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "agentdeck-git-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: directory });
  execFileSync("git", ["config", "color.ui", "always"], { cwd: directory });
  writeFileSync(join(directory, "note.txt"), "first line\n");
  execFileSync("git", ["add", "note.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  writeFileSync(join(directory, "note.txt"), "changed line\n");
  return directory;
}

describe("GitService", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("returns changed paths from a registered Git project", async () => {
    const path = createGitFixture();
    fixtures.push(path);

    await expect(
      new GitService().getChangedPaths({ path, isGitRepository: true }),
    ).resolves.toEqual(["note.txt"]);
  });

  it("returns a colorless diff when Git color output is forced", async () => {
    const path = createGitFixture();
    fixtures.push(path);

    const diff = await new GitService().getDiff({ path, isGitRepository: true });

    expect(diff).toContain("-first line");
    expect(diff).not.toMatch(/\u001B\[/);
  });

  it("rejects a project that was not registered as a Git repository", async () => {
    await expect(
      new GitService().getChangedPaths({ path: "C:\\not-client-controlled", isGitRepository: false }),
    ).rejects.toThrow("Project is not a Git repository");
  });
});
