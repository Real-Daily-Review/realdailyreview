# Real Daily Review — Org Structure

A real company that scales. Each named agent below owns a specific function, runs autonomously on a workflow, logs their activity, and reports up. The org chart auto-updates from `ops/team/*.md` and `ops/activity/*.md`.

```
                            ┌─ CEO (Claude, this session)
                            │     reports to: Shareholder
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   Strategy            Engineering          Editorial
   Ben Foster          Ada Park             Maya Chen
   (Chief of Staff)    (CTO)                (Editor-in-Chief)
        │                   │                   │
        │              Sam Reyes              (auto-spawned beat
        │              (DevOps / SRE)          reporters per topic
        │                                      via daily-publish)
        │
        │           ┌──────────────────┐
        │           │                  │
        │      Growth                Revenue
        │      Ravi Sharma           Mei Tanaka
        │      (CMO)                 (CFO)
        │
        ▼
   Reports to CEO daily; CEO reports material milestones to Shareholder.
```

## How agents work
1. Each agent's identity, mission, and reporting line live in `ops/team/<slug>.md`.
2. Each agent's daily activity logs to `ops/activity/<slug>/<date>.md` — written by the workflow they own.
3. The `org-chart.html` artifact (in Cowork) renders the full org status live: who's working on what right now, what shipped yesterday, what's next.
4. New agents are added by writing a new `ops/team/<slug>.md` + a workflow that updates their activity log.
5. Department heads can "hire" sub-agents by adding new workflow files prefixed with their department.

## Reporting cadence
- **Daily**: each agent appends to today's activity log on every workflow run.
- **Daily exec brief**: CEO standup (`ceo-standup.yml`) at 04/13/18/23 UTC reads all activity logs and generates a unified status doc at `ops/standups/YYYY-MM-DD-{slot}.md`.
- **Material milestone alerts**: CEO surfaces to shareholder ONLY when revenue/traffic crosses meaningful thresholds, or when a human-only blocker arrives.
