# Phase 1 Join/Create Rate Limit Plan

> **For agentic workers:** Use TDD for the deterministic limiter behavior and
> keep the production caveat explicit: process-local limits are a safety net,
> not a replacement for an edge/distributed limiter.

**Goal:** Slow brute-force password attempts and creation abuse on the public
group join/create endpoints without adding a dependency.

**Architecture:** `lib/rateLimit.js` keeps bounded process-local fixed-window
buckets and returns standard remaining/reset metadata. `/api/groups/join`
limits each client+group key to 8 attempts/minute; `/api/groups` limits client
creation to 5 attempts/5 minutes. Both return 429 with `Retry-After`.

## Tasks

- [x] Add failing behavior/route contract test and verify RED.
- [x] Implement limiter, bounded cleanup, client-IP extraction, and 429 helper.
- [x] Integrate join and group-create routes.
- [x] Run phase/regression/build gates.

## Limitation

The in-memory store resets on process restart and is not shared across server
instances. Production should add a trusted edge or distributed rate limiter
before exposing the endpoints at scale.
