# Shared protocol and workspace catalog contracts

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

These contracts bind producers and consumers, including UI and CLI callers outside
this package. Read them when changing daemon protocol negotiation, MCP/Role catalogs,
per-turn MCP selection, or Role-based session creation and dispatch.

## Machine protocol negotiation

- Daemon-backed workflows negotiate versions through
  `MachineMeta.protocolCapabilities`; never infer from the CLI release. Missing
  capabilities mean unsupported. Set and version checks share one binding in
  `packages/shared/src/machine-protocol-capabilities.ts` so a key never travels
  without its version.

## Workspace MCP and Agent Roles

- Workspace MCP has exactly two durable layers: catalog entries in the workspace Flock
  document and selected ids in each user turn input config. Do not add machine bindings.
  Preserve `mcpServerIds: []` as an explicit empty selection; dispatch must carry the
  driving turn's selection into ACP startup rather than rereading session history.
- MCP/Role catalog writes resolve on local Flock durability, followed by explicit
  upload. Settings neither await nor report upload; upload failure must not fail or
  roll back a durable write. CLI reports its sync result. See
  [catalog explanation](../../.agents/docs/workspace-catalog-durability.md).
- Roles use one workspace Flock `agentRole` family; sharing updates `visibility`.
  Store no secrets, API keys, MCP selections, or memory; apply
  `isSensitiveAgentRoleConfigOptionKey` on read and write. Roles pin permission via
  `runConfig.modeId` or `_permission`; hide the separate composer permission button
  when pinned, but keep warning-tone modes visibly marked on every such surface.
  Role-level auto-approval policy is out of scope. Settings/mentions use
  `canReadAgentRole`/`canManageAgentRole`; MCP resolves explicit Role ids from the
  catalog without requiring mention-scoped authorization.
- Roles bind exact `machineId + agentConfigId`, never fall back, and remain listed
  with precise reasons but unmentionable when machine/config/model/mode is unavailable.
  Before Operation acceptance, MCP resolves the current `agentRoleId` row and freezes
  canonical Prompt, target, Role revision, and dispatch config into the Operation;
  edits/deletion cannot change recovery or retry. `SessionMeta.agentRoleId` and
  `agentRoleRevision` are display-only creation provenance.

## Machine RPC: image connection

- `design/image-connection` answers the capability question for ONE session: it carries
  `ownerSessionId`, and `ready` (with a non-null `credential`) requires that session to have
  design meta AND the machine's row to be complete and enabled. Absent, deleted, or unreadable
  session meta is unavailable, and the lookup must stay read-only — never create or write a
  session document to answer it. `design/image-connection-test` is machine-scoped and carries no
  session identity: a settings surface must work before any session exists.

## Installation identity

The public local profile is Folio. Keep its data directory, host endpoint, protocol,
app ID and packaged desktop identity isolated from Lody. Update both TypeScript
and CommonJS installation profiles together; never migrate or delete Lody data.
