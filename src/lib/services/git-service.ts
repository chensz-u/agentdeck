import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitProject = {
  path: string;
  isGitRepository: boolean;
};

export class GitService {
  async getChangedPaths(project: GitProject): Promise<string[]> {
    const { stdout } = await this.runGit(project, ["diff", "--name-only"]);
    return stdout.split("\n").filter(Boolean);
  }

  async getDiff(project: GitProject): Promise<string> {
    const { stdout } = await this.runGit(project, ["diff", "--no-color"]);
    return stdout;
  }

  private async runGit(project: GitProject, args: readonly string[]) {
    if (!project.isGitRepository) {
      throw new Error("Project is not a Git repository");
    }

    return execFileAsync("git", args, { cwd: project.path });
  }
}
