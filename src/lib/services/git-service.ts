import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitProject = {
  path: string;
  gitEnabled?: boolean;
  isGitRepository?: boolean;
};

export class GitService {
  async getChangedPaths(project: GitProject): Promise<string[]> {
    const [unstaged, staged, untracked] = await Promise.all([
      this.runGit(project, ["diff", "--name-only"]),
      this.runGit(project, ["diff", "--cached", "--name-only"]),
      this.runGit(project, ["ls-files", "-z", "--others", "--exclude-standard"]),
    ]);
    return [...new Set([
      ...unstaged.stdout.split("\n").filter(Boolean),
      ...staged.stdout.split("\n").filter(Boolean),
      ...untracked.stdout.split("\0").filter(Boolean),
    ])];
  }

  async getDiff(project: GitProject): Promise<string> {
    const [unstaged, staged, untracked] = await Promise.all([
      this.runGit(project, ["diff", "--no-color"]),
      this.runGit(project, ["diff", "--cached", "--no-color"]),
      this.runGit(project, ["ls-files", "-z", "--others", "--exclude-standard"]),
    ]);
    const untrackedDiffs = await Promise.all(
      untracked.stdout.split("\0").filter(Boolean).map((path) => this.runGitDiffForUntrackedFile(project, path)),
    );
    return [unstaged.stdout, staged.stdout, ...untrackedDiffs].join("");
  }

  private async runGit(project: GitProject, args: readonly string[]) {
    if (!project.gitEnabled && !project.isGitRepository) {
      throw new Error("Project is not a Git repository");
    }

    return execFileAsync("git", args, { cwd: project.path });
  }

  private async runGitDiffForUntrackedFile(project: GitProject, path: string): Promise<string> {
    try {
      const { stdout } = await this.runGit(project, ["diff", "--no-index", "--no-color", "--", "/dev/null", path]);
      return stdout;
    } catch (error) {
      if (error && typeof error === "object" && "stdout" in error) {
        return String(error.stdout);
      }
      throw error;
    }
  }
}
