import { describe, expect, it } from "vitest";

import { AgentAvailability, AgentId } from "../domain/types";
import { AgentRegistry } from "./agent-registry";

describe("AgentRegistry", () => {
  it("exposes Codex as the only runnable local adapter and describes placeholders honestly", () => {
    const registry = new AgentRegistry({ codex: { availability: AgentAvailability.AVAILABLE, version: "0.142.0" } });

    expect(registry.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: AgentId.CODEX, availability: AgentAvailability.AVAILABLE, version: "0.142.0" }),
      expect.objectContaining({ id: AgentId.CLAUDE_CODE, availability: AgentAvailability.UNAVAILABLE, reason: expect.stringContaining("未接入") }),
      expect.objectContaining({ id: AgentId.OPENCODE, availability: AgentAvailability.UNAVAILABLE }),
      expect.objectContaining({ id: AgentId.CLINE, availability: AgentAvailability.UNAVAILABLE }),
    ]));
    expect(registry.requireAvailable(AgentId.CODEX).id).toBe(AgentId.CODEX);
    expect(() => registry.requireAvailable(AgentId.CLAUDE_CODE)).toThrow("当前不可用");
  });
});
