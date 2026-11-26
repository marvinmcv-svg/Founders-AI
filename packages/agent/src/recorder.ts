/**
 * One assistant turn's tool executor, shared by both engines. It validates input, records the
 * visible step list (persisted as it goes so the UI can poll it), collects sources, tables,
 * artifacts and the evidence the number guard checks against, and stops at write tools that need
 * confirmation (plan 10.1: Allow once / Always for this thread / Deny).
 */
import * as repo from "@founders/core/repo";
import type { AgentPending, AgentSource, AgentStep, AgentTable } from "@founders/core/repo";
import { collectEvidence } from "./guard";
import { TOOL_BY_NAME } from "./tools";
import type { ToolResult } from "./types";

export type CallOutcome =
  | { kind: "ok"; result: ToolResult }
  | { kind: "error"; error: string }
  | { kind: "pending"; pending: AgentPending };

export class TurnRecorder {
  steps: AgentStep[] = [];
  sources: AgentSource[] = [];
  tables: AgentTable[] = [];
  artifactIds: string[] = [];
  evidence: number[] = [];
  /** Set once any web text was read this turn: from then on every write needs explicit confirmation (plan 10.5). */
  untrustedSeen = false;

  constructor(
    private org: repo.OrgContext,
    private threadId: string,
    private messageId: string,
    private allowedTools: string[],
  ) {}

  private seq = 0;

  async flush() {
    await repo.updateMessage(this.org, this.messageId, { steps: this.steps, sources: this.sources, tables: this.tables, artifactIds: this.artifactIds });
  }

  addSources(src: AgentSource[]) {
    for (const s of src) if (!this.sources.some((x) => x.id === s.id)) this.sources.push(s);
  }

  /**
   * Run a tool. `approved` is true when the user has just confirmed this exact call.
   * Write tools pause unless allowed for the thread (and no untrusted web text was read this turn).
   */
  async call(name: string, rawInput: unknown, opts: { toolUseId?: string; approved?: boolean } = {}): Promise<CallOutcome> {
    const tool = TOOL_BY_NAME.get(name);
    const stepId = `stp_${++this.seq}_${Date.now().toString(36)}`;
    if (!tool) {
      this.steps.push({ id: stepId, tool: name, label: `Unknown tool ${name}`, status: "error" });
      await this.flush();
      return { kind: "error", error: `Unknown tool: ${name}` };
    }
    const parsed = tool.schema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const error = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      this.steps.push({ id: stepId, tool: name, label: `Invalid input for ${name}`, status: "error", summary: error });
      await this.flush();
      return { kind: "error", error: `Invalid input: ${error}` };
    }
    const input = parsed.data as Record<string, unknown>;
    const label = tool.label(input as never);
    const needsConfirm = tool.write && !opts.approved && (this.untrustedSeen || !this.allowedTools.includes(name));
    if (needsConfirm) {
      this.steps.push({ id: stepId, tool: name, label, status: "awaiting_confirmation" });
      await this.flush();
      return { kind: "pending", pending: { toolUseId: opts.toolUseId ?? stepId, tool: name, input, label } };
    }
    const step: AgentStep = { id: stepId, tool: name, label, status: "running" };
    this.steps.push(step);
    await this.flush();
    const started = Date.now();
    try {
      const result = await tool.run({ org: this.org, threadId: this.threadId }, input as never);
      step.status = "done";
      step.summary = result.summary;
      step.sources = result.sources.slice(0, 50).map((s) => s.id);
      step.ms = Date.now() - started;
      this.addSources(result.sources);
      if (result.table) this.tables.push(result.table);
      if (result.artifactId) this.artifactIds.push(result.artifactId);
      if (result.untrusted) this.untrustedSeen = true;
      else this.evidence.push(...collectEvidence(result.data, result.table?.rows));
      await this.flush();
      return { kind: "ok", result };
    } catch (e) {
      step.status = "error";
      step.summary = e instanceof Error ? e.message.slice(0, 300) : String(e);
      step.ms = Date.now() - started;
      await this.flush();
      return { kind: "error", error: step.summary };
    }
  }

  /** Marks the confirmation step of a pending call as denied. */
  async deny(pending: AgentPending) {
    const s = this.steps.find((x) => x.status === "awaiting_confirmation" && x.tool === pending.tool);
    if (s) s.status = "denied";
    await this.flush();
  }

  /** Restores state from a paused message (resume after confirmation). */
  load(m: { steps: AgentStep[] | null; sources: AgentSource[] | null; tables: AgentTable[] | null; artifact_ids: string[] | null }, evidence: number[]) {
    this.steps = m.steps ?? [];
    this.sources = m.sources ?? [];
    this.tables = m.tables ?? [];
    this.artifactIds = m.artifact_ids ?? [];
    this.evidence = evidence;
    this.seq = this.steps.length;
    // The paused step is replaced by the real call on resume.
    this.steps = this.steps.filter((s) => s.status !== "awaiting_confirmation");
  }
}
