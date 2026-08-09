import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RegisteredProject = {
  id: string;
  name: string;
  path: string;
  isGitRepository: boolean;
};

export interface ProjectRepository {
  createProject(input: Omit<RegisteredProject, "id">): Promise<RegisteredProject>;
}

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async registerProject(input: Pick<RegisteredProject, "name" | "path">): Promise<RegisteredProject> {
    if (!isAbsolute(input.path)) {
      throw new Error("Project path must be absolute");
    }

    if (!existsSync(input.path)) {
      throw new Error("Project path does not exist");
    }

    const path = realpathSync(input.path);
    const isGitRepository = await this.isGitRepository(path);

    if (!isGitRepository) {
      throw new Error("Project path is not a Git repository");
    }

    return this.repository.createProject({
      name: input.name,
      path,
      isGitRepository,
    });
  }

  private async isGitRepository(path: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--is-inside-work-tree"],
        { cwd: path },
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }
}
