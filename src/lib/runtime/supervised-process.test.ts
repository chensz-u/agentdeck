import { describe, expect, it } from "vitest";

import { SupervisedProcess } from "./supervised-process";

describe("SupervisedProcess", () => {
  it("records ordered stdout/stderr lines and resolves the process exit", async () => {
    const output: Array<{ stream: string; text: string }> = [];
    const supervised = new SupervisedProcess().start({
      command: process.execPath,
      args: ["-e", "console.log('first'); console.error('problem'); console.log('second')"],
      cwd: process.cwd(),
      onOutput: (record) => output.push(record),
    });

    expect(supervised.pid).not.toBeNull();
    await expect(supervised.completed).resolves.toMatchObject({ exitCode: 0 });
    expect(output).toEqual(expect.arrayContaining([
      { stream: "stdout", text: "first" },
      { stream: "stderr", text: "problem" },
      { stream: "stdout", text: "second" },
    ]));
  });

  it("stops a running local process idempotently", async () => {
    const supervised = new SupervisedProcess().start({ command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: process.cwd() });

    await supervised.stop();
    await supervised.stop();
    await expect(supervised.completed).resolves.toMatchObject({ exitCode: null });
  });
});
