# Contributing

Use Node.js 22.5 or newer. Keep adapters behind documented protocols, validate all external input, and never add automatic LLM launching, keystroke injection, public daemon binding, or telemetry enabled by default.

Before submitting a change, run `npm run typecheck`, `npm test`, and `npm run build`. New adapters must document registration, identity, supported events, disconnect behavior, and user consent boundaries.
