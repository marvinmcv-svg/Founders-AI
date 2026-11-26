---
title: Connect Founders AI to Claude, ChatGPT and Cursor
description: A three-step guide to using live private-market data inside the AI tools you already use, over MCP.
date: 2026-11-24
author: founders-team
tags: [product, guide]
---

The Model Context Protocol (MCP) lets AI clients call tools on other services. Our MCP server gives your AI client {limits.mcpTools} tools for companies, people, investors, lists and saved searches, with {limits.mcpFree} free calls a day per user.

## Step 1: add the connector

Copy the server URL from the [MCP page](/mcp) and add it as a custom connector in your client. In Claude Code, for example:

```bash
claude mcp add --transport http founders-ai <server-url>
```

Cursor and Windsurf take the same URL in their MCP configuration files. The install guide in Settings has a snippet for each client.

## Step 2: sign in

The first time your client calls a tool, it opens a sign-in window. Approve access with your Founders AI account. You can disconnect any app later from Settings.

## Step 3: ask

Try questions like:

- "Which seed-stage fintechs in Bolivia are hiring fastest?"
- "Give me a brief on this company, then list its closest competitors."
- "Save a search for new climate startups in Chile and tell me what's new each week."

## Reads are free to try, writes always ask

Of the {limits.mcpTools} tools, {limits.mcpReadTools} only read data and {limits.mcpWriteTools} can change something: creating a list, adding to it, or saving a search. Your client asks you to confirm every write. Finding companies, people and investors, and working with your lists and saved searches, never costs credits.
