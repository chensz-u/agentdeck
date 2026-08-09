import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    vi.restoreAllMocks();
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

  it("includes staged and untracked files in review paths and diff text", async () => {
    const path = createGitFixture();
    fixtures.push(path);
    writeFileSync(join(path, "staged.txt"), "staged addition\n");
    execFileSync("git", ["add", "staged.txt"], { cwd: path });
    writeFileSync(join(path, "untracked.txt"), "untracked addition\n");

    const service = new GitService();

    await expect(
      service.getChangedPaths({ path, isGitRepository: true }),
    ).resolves.toEqual(["note.txt", "staged.txt", "untracked.txt"]);
    await expect(service.getDiff({ path, isGitRepository: true })).resolves.toContain("+staged addition");
    await expect(service.getDiff({ path, isGitRepository: true })).resolves.toContain("+untracked addition");
  });

  it("keeps an untracked filename containing a newline intact in the review", async () => {
    const untrackedPath = "untracked\nname.txt";
    const service = new GitService();
    type TestableGitService = {
      runGit(project: unknown, args: readonly string[]): Promise<{ stdout: string }>;
    };
    const runGit = vi.spyOn(GitService.prototype as unknown as TestableGitService, "runGit")
      .mockImplementation(async (_project, args) => {
        if (args[0] === "ls-files") return { stdout: `${untrackedPath}\0` };
        if (args.includes("--no-index")) {
          return Promise.reject(Object.assign(new Error("diff found"), {
            stdout: `diff --git a/${untrackedPath} b/${untrackedPath}\n+newline filename content\n`,
          }));
        }
        return { stdout: "" };
      });

    const project = { path: "C:\\fixture", isGitRepository: true };
    await expect(service.getChangedPaths(project)).resolves.toEqual([untrackedPath]);
    await expect(service.getDiff(project)).resolves.toContain("+newline filename content");
    expect(runGit).toHaveBeenCalledWith(project, ["ls-files", "-z", "--others", "--exclude-standard"]);
    expect(runGit).toHaveBeenCalledWith(project, [
      "diff", "--no-index", "--no-color", "--", "/dev/null", untrackedPath,
    ]);
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
