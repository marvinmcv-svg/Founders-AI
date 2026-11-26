---
title: How we estimate private company revenue
description: Anchors, models and honest ranges. A plain-language look at how Founders AI puts a number on companies that don't publish one.
date: 2026-11-20
author: founders-team
tags: [insights, methodology]
---

Most private companies never publish their revenue. Investors still need a number, so they guess. We think a guess is fine as long as it is honest about how uncertain it is. That idea shapes every estimate in Founders AI.

## 1. Start from what is known

When a company discloses a figure, in a press release, an interview, a filing or a funding announcement, we record it as a **verified disclosure** with its source and date. Today the model is anchored by {stats.revenue_disclosures} verified disclosures. A disclosure is the strongest evidence we have, so the estimate snaps to it.

## 2. Model the months in between

Between disclosures we model revenue month by month from signals that move with it: headcount and its growth, web traffic, funding history, stage, sector and country. The model is a quantile regression, which means it predicts a whole distribution, not a single point.

## 3. Publish the range, not just the point

Every estimate has three numbers:

- **P50**, the median, our best single guess.
- **P10 and P90**, the low and high ends of a 90% range.

We also label each estimate with a **confidence level**. A small bootstrapped team with little public data gets a wide range and low confidence. A late-stage company with several disclosures gets a tight range and high confidence. If the range is wide, we show it wide.

## 4. Show what moved the number

For each estimate we show the main drivers and whether each one pushed the number up or down, for example recent revenue, funding history, investor quality or company age. If you disagree with an input, you can see exactly how much it mattered.

## 5. Valuation sits on top of revenue

Valuation estimates combine the revenue estimate with funding history and stage, and they are re-estimated every month instead of staying frozen at the last priced round.

## Where to find it

Estimates appear on every company profile, as a filter in search, through `GET /companies/{id}/latest-revenue` in the API, and through the `get_company_revenue` tool over MCP. Read more on the [Revenue & Valuation](/revenue-valuation) page.
