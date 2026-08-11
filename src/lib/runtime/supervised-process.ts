import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type ProcessOutput = { stream: "stdout" | "stderr"; text: string };
export type ProcessCompletion = { exitCode: number | null; error?: string };
export type ProcessSpec = {
  command: string;
  args: string[];
  cwd: string;
  onOutput?(record: ProcessOutput): void;
};

export type SupervisedProcessHandle = {
  pid: number | null;
  completed: Promise<ProcessCompletion>;
  child: ChildProcessWithoutNullStreams;
  stop(): Promise<void>;
};

/** Owns local child lifecycle mechanics. Adapters supply a fixed, server-created spec. */
export class SupervisedProcess {
  start(spec: ProcessSpec): SupervisedProcessHandle {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, stdio: "pipe", windowsHide: true });
    const buffers: Record<ProcessOutput["stream"], string> = { stdout: "", stderr: "" };
    const emit = (stream: ProcessOutput["stream"], chunk: Buffer) => {
      buffers[stream] += chunk.toString();
      const lines = buffers[stream].split(/\r?\n/);
      buffers[stream] = lines.pop() ?? "";
      for (const text of lines) if (text) spec.onOutput?.({ stream, text });
    };
    child.stdout.on("data", (chunk: Buffer) => emit("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => emit("stderr", chunk));
    let resolve!: (completion: ProcessCompletion) => void;
    let settled = false;
    const complete = (result: ProcessCompletion) => { if (!settled) { settled = true; resolve(result); } };
    const completed = new Promise<ProcessCompletion>((done) => { resolve = done; });
    child.once("error", (error) => complete({ exitCode: null, error: error.message }));
    child.once("close", (exitCode) => {
      for (const stream of ["stdout", "stderr"] as const) {
        if (buffers[stream]) spec.onOutput?.({ stream, text: buffers[stream] });
      }
      complete({ exitCode, error: exitCode === 0 ? undefined : `process exited with ${exitCode}` });
    });
    return {
      pid: child.pid ?? null,
      child,
      completed,
      stop: async () => { if (!child.killed) child.kill(); },
    };
  }
}
