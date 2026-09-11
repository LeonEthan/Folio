# Lody

[lody.ai](https://lody.ai)

Orchestrate your coding agents, together:

```
npx lody start
```

Install the CLI package:

```
npm install -g lody@next
```

## Design turn collection

`src/design/turn-outcome.ts` compares the collected PPTD project with the content
frozen at dispatch. A matching digest records `no_artifact` before import, even
when the current canvas differs. Identical rewrites do not prove a new attempt.
Existing files, candidates, history outcomes and commit receipts stay intact;
recorded outcomes and matching receipts still take precedence over collection.

Legacy manifests without dispatch content evidence retain the existing validated
import and atomic version check; missing evidence is not proof of unchanged
content. Changed projects retain structure, asset and version validation. Explicit
resubmission attempts and broader candidate retirement are separate work.
Decision: [T01](../../.agents/notes/implemented/simplification/2026-09-11-unchanged-pptd-outcome.md).
