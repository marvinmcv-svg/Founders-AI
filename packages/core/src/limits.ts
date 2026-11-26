/** Single source for numeric limits shown in UI, docs, API and MCP (plan 0D). */
export const API_RATE_LIMIT_RPS = 15;
export const API_MAX_PAGE_SIZE = 5000;
export const API_DEFAULT_PAGE_SIZE = 100;
export const API_BULK_MAX = 50;
export const API_TRIAL_CREDITS = 200;
export const MCP_FREE_CALLS_PER_DAY = 100;
/** Inventory sizes shown on marketing pages; pinned by tests in apps/mcp and apps/api. */
export const MCP_TOOL_COUNT = 29;
export const MCP_WRITE_TOOL_COUNT = 5;
export const API_ENDPOINT_COUNT = 74;
export const APP_GRID_PAGE_SIZE = 100;
export const EXACT_COUNT_CAP = 10_000;
export const EXPORT_MAX_ROWS = 5000;
export const WEBHOOK_MAX_PER_ORG = 10;
export const ENTITY_EXTRACT_MAX_CHARS = 20_000;
/** Agent guardrails (plan 10.1 cost guardrails). */
export const AGENT_MAX_STEPS = 25;
export const AGENT_MAX_INPUT_TOKENS_PER_TURN = 200_000;
export const AGENT_DAILY_TURNS_PER_USER = 200;
export const AGENT_TOOL_RESULT_MAX_ROWS = 25;
/** Curated skills shipped with the agent; pinned by packages/agent tests. */
export const AGENT_CURATED_SKILL_COUNT = 12;
