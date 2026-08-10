import { describe, expect, it } from "vitest";

import { HumanInputAction } from "../domain/types";

import {
  beginAppServerRun,
  disposeAppServerChild,
  normalizeAppServerHumanInputRequest,
  normalizeAppServerNotification,
  type AppServerTransport,
} from "./app-server-adapter";
import { FallbackCodexAdapter } from "./exec-fallback-adapter";

class FakeTransport implements AppServerTransport {
  readonly messages: Array<Record<string, unknown>> = [];
  private listener: ((message: unknown) => void) | undefined;
  failMethod?: string;

  send(message: Record<string, unknown>): void {
    this.messages.push(message);
    if (message.method === this.failMethod) {
      this.emit({ jsonrpc: "2.0", id: message.id, error: { message: "protocol rejected" } });
      return;
    }
    if (message.method === "initialize") this.emit({ jsonrpc: "2.0", id: message.id, result: {} });
    if (message.method === "thread/start") {
      this.emit({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-1" } } });
    }
    if (message.method === "turn/start") {
      this.emit({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "turn-1" } } });
    }
    if (message.method === "turn/interrupt") this.emit({ jsonrpc: "2.0", id: message.id, result: {} });
  }

  onMessage(listener: (message: unknown) => void): void { this.listener = listener; }
  emit(message: unknown): void { this.listener?.(message); }
}

describe("app-server protocol", () => {
  it("forwards app-server notifications that omit the JSON-RPC version", () => {
    expect(normalizeAppServerNotification({
      method: "remoteControl/status/changed",
      params: { status: "connected" },
    })).toEqual({ type: "remoteControl/status/changed", params: { status: "connected" } });
  });

  it("normalizes server approval and question requests without trusting browser session fields", () => {
    expect(normalizeAppServerHumanInputRequest({
      jsonrpc: "2.0",
      id: 42,
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [{ id: "choice", header: "Choice", question: "Continue?", options: [{ label: "Yes", description: "Proceed" }] }],
      },
    })).toEqual({
      requestId: "42",
      rpcId: 42,
      kind: "QUESTION",
      threadId: "thread-1",
      turnId: "turn-1",
      prompt: "Continue?",
      questionIds: ["choice"],
      options: ["Yes"],
    });

    expect(normalizeAppServerHumanInputRequest({
      jsonrpc: "2.0",
      id: "approval-2",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-2", approvalId: "approval-2" },
    })).toMatchObject({
      requestId: "approval-2",
      kind: "CONFIRMATION",
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  it("disposes a failed startup child before the exec fallback can launch", () => {
    const calls: string[] = [];
    const disposable = {
      killed: false,
      kill: () => { calls.push("kill"); },
      removeAllListeners: () => { calls.push("process"); },
      stdin: { removeAllListeners: () => { calls.push("stdin"); } },
      stdout: { removeAllListeners: () => { calls.push("stdout"); } },
      stderr: { removeAllListeners: () => { calls.push("stderr"); } },
    };

    disposeAppServerChild(disposable);

    expect(calls).toEqual(["stdin", "stdout", "stderr", "process", "kill"]);
  });

  it("initializes, starts a thread, and starts a turn using the returned thread id", async () => {
    const transport = new FakeTransport();
    const run = await beginAppServerRun(transport, { cwd: "C:\\fixture", prompt: "Do work" });

    expect(transport.messages).toEqual([
      expect.objectContaining({ id: 1, method: "initialize", params: { clientInfo: { name: "agentdeck", version: "0.1.0" } } }),
      expect.objectContaining({ id: 2, method: "thread/start", params: { cwd: "C:\\fixture" } }),
      expect.objectContaining({ id: 3, method: "turn/start", params: {
        threadId: "thread-1", input: [{ type: "text", text: "Do work" }],
      } }),
    ]);

    transport.emit({ jsonrpc: "2.0", method: "turn/completed", params: {
      threadId: "thread-1", turn: { id: "turn-1", status: "completed" },
    } });
    await expect(run.completed).resolves.toEqual({ exitCode: 0 });
  });

  it("rejects startup on a correlated JSON-RPC error", async () => {
    const transport = new FakeTransport();
    transport.failMethod = "thread/start";

    await expect(beginAppServerRun(transport, { cwd: "C:\\fixture", prompt: "Do work" }))
      .rejects.toThrow("protocol rejected");
  });

  it("interrupts the active turn before the caller kills the child as a fallback", async () => {
    const transport = new FakeTransport();
    const run = await beginAppServerRun(transport, { cwd: "C:\\fixture", prompt: "Do work" });

    await run.interrupt();

    expect(transport.messages.at(-1)).toMatchObject({
      method: "turn/interrupt",
      params: { threadId: "thread-1", turnId: "turn-1" },
    });
  });

  it("responds to the exact inbound approval request id with the schema-shaped decision", async () => {
    const transport = new FakeTransport();
    const run = await beginAppServerRun(transport, { cwd: "C:\\fixture", prompt: "Do work" });

    await run.respondToHumanInput({
      requestId: "42", rpcId: 42, kind: "CONFIRMATION", threadId: "thread-1", turnId: "turn-1", prompt: "Approve?",
    }, { action: HumanInputAction.APPROVE, text: "" });

    expect(transport.messages.at(-1)).toMatchObject({
      jsonrpc: "2.0", id: 42, result: { decision: "accept" },
    });
  });

  it("answers a user-input request with its schema-shaped question answer map", async () => {
    const transport = new FakeTransport();
    const run = await beginAppServerRun(transport, { cwd: "C:\\fixture", prompt: "Do work" });

    await run.respondToHumanInput({
      requestId: "43", rpcId: "43", kind: "QUESTION", threadId: "thread-1", turnId: "turn-1", prompt: "Choice?", questionIds: ["choice"],
    }, { action: HumanInputAction.TEXT, text: "Yes" });

    expect(transport.messages.at(-1)).toMatchObject({
      jsonrpc: "2.0", id: "43", result: { answers: { choice: { answers: ["Yes"] } } },
    });
  });

  it("uses exec fallback when app-server protocol startup rejects", async () => {
    const fallbackRequests: string[] = [];
    const adapter = new FallbackCodexAdapter(
      {
        launch: async () => { throw new Error("initialize rejected"); },
        stop: async () => undefined,
        respondToHumanInput: async () => { throw new Error("unavailable"); },
      },
      {
        launch: async (request) => {
          fallbackRequests.push(request.runId);
          return { pid: 4, completed: Promise.resolve({ exitCode: 0 }) };
        },
        stop: async () => undefined,
        respondToHumanInput: async () => { throw new Error("unavailable"); },
      },
    );
    const events: string[] = [];

    await adapter.launch({ runId: "run-1", cwd: "C:\\fixture", prompt: "Do work", onEvent: (event) => { events.push(event.type); } });

    expect(fallbackRequests).toEqual(["run-1"]);
    expect(events).toEqual(["codex/app-server-fallback"]);
  });
});
