## 12. MCP SERVER — 29 TOOLS

Hosted at `https://mcp.{{domain}}/mcp` (Streamable HTTP; SSE fallback). Auth: OAuth 2.1 with dynamic client registration (works as custom connector in Claude Desktop/claude.ai and ChatGPT; `claude mcp add --transport http …` one-liner for Claude Code; config snippets for Cursor, Windsurf, OpenCode). Tools call the internal SDK; responses formatted as compact, memo-ready markdown + structured JSON. Write tools carry `annotations.destructiveHint/readOnlyHint` so clients prompt for confirmation.

| Category | Tool | R/W | Cost |
|---|---|---|---|
| Resolve & search (4) | `find_company` (domain/name/LinkedIn) · `find_person` (LinkedIn URL/email/name) · `find_investor` · `search` (plain English, any product, compact ranked list) | R | resolve free; search paid |
| Company intelligence (10) | `get_company_profile` (memo format) · `get_company_competitors` (limit) · `get_company_funding` · `get_company_revenue` · `get_company_valuation` · `get_company_news` · `get_company_investor_interest` · `get_company_people` · `get_company_traction` · `get_company_transactions` (M&A/IPO) | R | paid |
| People (3) | `get_person_profile` · `get_person_email` · `get_person_talent_signals` (since) | R | paid |
| Investors (3) | `get_investor_profile` · `get_investor_rounds` (with co-investors) · `get_investor_interest_signals` | R | paid |
| Lists (5) | `get_lists` (free) · `get_list_items` · `create_list` (W) · `add_to_list` (W) · `remove_from_list` (W) | 2R/3W | management free |
| Saved searches (4) | `get_saved_searches` (free) · `get_saved_search_items` (`since_last_read`) · `create_saved_search` (W) · `update_saved_search` (W) | 2R/2W | management free |

Totals: 24 read + 5 write = 29. **Metering (clarified in v2):** every tool call — free or paid — counts as 1 toward the user's 100 free calls/day (resets 00:00 UTC). After the allowance: free tools (resolve, list/search management) keep working at 0 credits; paid tools draw org API credits at the Section 11 price table **only if** an admin enabled overage, otherwise they return a clear limit message with the reset time. Tool outputs are capped (~4k tokens) with a `next_cursor` for more, so agents don't blow their context. Server prompts (MCP `prompts`): "Qualify competitors of {company}", "Weekly saved-search digest", "Warm paths to a list".
