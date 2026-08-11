import { AgentAvailability, AgentId, type AgentCapability } from "../domain/types";

export type AgentDescriptor = {
  id: AgentId;
  name: string;
  availability: AgentAvailability;
  version: string | null;
  reason: string | null;
  capabilities: AgentCapability[];
};

type AgentRegistryOptions = { codex: Pick<AgentDescriptor, "availability" | "version"> };

const unavailable = (id: AgentId, name: string, reason: string): AgentDescriptor => ({
  id, name, availability: AgentAvailability.UNAVAILABLE, version: null, reason, capabilities: [],
});

/** Server-owned catalog: only listed, verified adapters can be selected by a task. */
export class AgentRegistry {
  private readonly descriptors: AgentDescriptor[];

  constructor(options: AgentRegistryOptions) {
    this.descriptors = [
      {
        id: AgentId.CODEX,
        name: "Codex",
        availability: options.codex.availability,
        version: options.codex.version,
        reason: options.codex.availability === AgentAvailability.AVAILABLE ? null : "未检测到可用的 Codex CLI",
        capabilities: ["WORKTREE", "HUMAN_INPUT", "READ_ONLY_OUTPUT"],
      },
      unavailable(AgentId.CLAUDE_CODE, "Claude Code", "当前版本未接入 Claude Code"),
      unavailable(AgentId.OPENCODE, "OpenCode", "当前版本未接入 OpenCode"),
      unavailable(AgentId.CLINE, "Cline", "当前版本未接入 Cline"),
      unavailable(AgentId.CUSTOM_CLI, "自定义 CLI", "当前版本未配置受信任的自定义命令模板"),
    ];
  }

  list(): AgentDescriptor[] { return this.descriptors.map((descriptor) => ({ ...descriptor, capabilities: [...descriptor.capabilities] })); }

  find(id: AgentId): AgentDescriptor | null { return this.descriptors.find((descriptor) => descriptor.id === id) ?? null; }

  requireAvailable(id: AgentId): AgentDescriptor {
    const descriptor = this.find(id);
    if (!descriptor || descriptor.availability !== AgentAvailability.AVAILABLE) {
      throw new Error(`Agent ${id} 当前不可用`);
    }
    return descriptor;
  }
}
