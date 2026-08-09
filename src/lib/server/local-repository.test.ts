import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentRunStatus, TaskStatus } from "../domain/types";
import { LocalRepository } from "./local-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalRepository.claimTaskRun", () => {
  it("allows one concurrent claim and persists one RUNNING run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentdeck-local-repository-"));
    temporaryDirectories.push(directory);
    const repository = new LocalRepository(join(directory, "data.json"));
    const project = await repository.createProject({
      name: "Fixture",
      path: directory,
      isGitRepository: true,
    });
    const task = await repository.createTask({
      projectId: project.id,
      parentTaskId: null,
      title: "Run once",
      prompt: "Run once.",
      status: TaskStatus.TODO,
    });
    const input = {
      agent: "codex",
      status: AgentRunStatus.RUNNING,
      pid: null,
      exitCode: null,
      error: null,
      logPath: ".agentdeck/runs/task.jsonl",
    };

    const results = await Promise.allSettled([
      repository.claimTaskRun(task.id, input),
      repository.claimTaskRun(task.id, input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(repository.findTask(task.id)).resolves.toMatchObject({ status: TaskStatus.RUNNING });
  });
});
