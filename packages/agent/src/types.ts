import type { z } from "zod";
import type { AgentSource, AgentTable, OrgContext } from "@founders/core/repo";

export type { AgentSource, AgentTable };

/** What a tool returns: a short step summary, the data the model/answer may use, and its sources. */
export type ToolResult = {
  summary: string;
  /** Projected data (only fields a step needs, plan 10.1 cost guardrails). Numbers in answers must come from here. */
  data: unknown;
  sources: AgentSource[];
  table?: AgentTable;
  artifactId?: string;
  /** Text fetched from the web: wrapped and labelled untrusted when shown to the model (plan 10.5). */
  untrusted?: boolean;
};

export type ToolContext = { org: OrgContext; threadId: string | null };

export type AgentTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  /** Write tools change workspace data and need a confirmation chip (plan 10.1). */
  write?: boolean;
  label: (input: z.infer<S>) => string;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<ToolResult>;
};

export class ToolInputError extends Error {}
