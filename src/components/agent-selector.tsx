"use client";

import { AgentAvailability, AgentId } from "../lib/domain/types";
import type { AgentDescriptor } from "../lib/agents/agent-registry";

export function AgentSelector({ agents, value, onChange }: {
  agents: AgentDescriptor[];
  value: AgentId;
  onChange: (agentId: AgentId) => void;
}) {
  return <fieldset className="agent-selector">
    <legend>执行 Agent</legend>
    <div className="agent-options">
      {agents.map((agent) => {
        const available = agent.availability === AgentAvailability.AVAILABLE;
        return <label className={available ? "" : "agent-unavailable"} key={agent.id} title={agent.reason ?? undefined}>
          <input type="radio" name="agent-id" aria-label={agent.name} value={agent.id} checked={value === agent.id} disabled={!available} onChange={() => onChange(agent.id)} />
          <span><strong>{agent.name}</strong><small>{available ? (agent.version ? `已检测 · ${agent.version}` : "本机可用") : agent.reason}</small></span>
        </label>;
      })}
    </div>
  </fieldset>;
}
