import { LocalFileResolutionSchema } from './local-file-preview';
import { PublicImageConnectionSchema } from './image-connection';
import { z } from 'zod';
import {
  CodeCollabV2ErrorSchema,
  CodeCollabV2FileIndexRequestSchema,
  CodeCollabV2FileIndexSnapshotSchema,
  CodeCollabV2InitDirectoryOkSchema,
  CodeCollabV2InitDirectoryRequestSchema,
  CodeCollabV2LspUnsupportedSchema,
  CodeCollabV2OpenAllChangesDiffRequestSchema,
  CodeCollabV2OpenAllChangesDiffResponseSchema,
  CodeCollabV2OpenCurrentDiffRequestSchema,
  CodeCollabV2OpenCurrentDiffResponseSchema,
  CodeCollabV2OpenTextOkSchema,
  CodeCollabV2OpenTextRequestSchema,
  CodeCollabV2OpenTurnDiffRequestSchema,
  CodeCollabV2OpenTurnDiffResponseSchema,
  CodeCollabV2RefreshTextRequestSchema,
  CodeCollabV2RefreshTextResponseSchema,
  CodeCollabV2SaveTextRequestSchema,
  CodeCollabV2SaveTextResponseSchema,
} from './code-collab';
import { FilePreviewV3RequestSchema, FilePreviewV3ResponseSchema } from './file-preview';
import {
  SessionCancelResponseSchema,
  SessionDispatchTurnResponseSchema,
  SessionEditAndResendResponseSchema,
  SessionEditAndResendSpecSchema,
  SessionForkResponseSchema,
  SessionForkSpecSchema,
  SessionIdSchema,
  SessionPreparationCancelSpecSchema,
  SessionPreparationSpecSchema,
  SessionPrepareCancelResponseSchema,
  SessionPrepareResponseSchema,
  SessionPreviewEndpointAcquireResponseSchema,
  SessionPreviewEndpointReleaseResponseSchema,
  PreviewTargetSchema,
  SessionSteerResponseSchema,
  SessionTerminateResponseSchema,
} from './message-schemas';

export const LOCAL_MACHINE_RPC_PATH = '/machine-rpc';

const BaseLocalMachineRpcRequestSchema = z
  .object({
    machineId: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1),
    ownerSessionId: z.string().trim().min(1).optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export const SessionActiveInvocationContextResultSchema = z.discriminatedUnion('active', [
  z
    .object({
      type: z.literal('session/active-invocation-context'),
      sessionId: SessionIdSchema,
      active: z.literal(false),
    })
    .strict(),
  z
    .object({
      type: z.literal('session/active-invocation-context'),
      sessionId: SessionIdSchema,
      active: z.literal(true),
      requesterUserId: z.string().trim().min(1),
      sourceTurnId: z.string().trim().min(1),
      inputConfig: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
export type SessionActiveInvocationContextResult = z.infer<
  typeof SessionActiveInvocationContextResultSchema
>;

/**
 * The daemon's answers about this machine's image connection (P2.4).
 *
 * Two methods rather than one because they have opposite costs: reading the
 * setting is free and must never touch the network, while testing it makes a
 * request to the user's own upstream. Keeping them apart means a caller that
 * only needs the availability gate cannot accidentally trigger a probe, and the
 * settings button cannot drift into being the thing that decides availability.
 *
 * Both carry only the non-secret projection; a reply never contains the key.
 */
export const ImageConnectionRpcResultSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('design/image-connection'),
      /** null when this machine has stored no connection at all. */
      connection: PublicImageConnectionSchema.nullable(),
      /**
       * The availability gate for the asking session, decided by the daemon so
       * no caller has to re-derive it: true requires `request.ownerSessionId`
       * to name a session whose meta carries `design` AND that session's
       * machine to satisfy `isImageConnectionReady`. False means the tool is not
       * registered — a non-design session, a missing/unreadable session, no
       * stored row, a switched-off row, or a row with no key yet.
       */
      ready: z.boolean(),
      /**
       * The credential, and the only place it appears on the wire.
       *
       * This method exists for exactly one caller — the built-in MCP server
       * that has to present the key to the user's own upstream — over the
       * owner-only machine-local control socket, from the daemon's own child
       * process running as the same user. Present only when `ready` — which
       * also requires a design session, so a coding session's answer carries no
       * key even on a ready machine; the key exists to generate design assets,
       * and no other session has a use for it. A settings surface must keep
       * using `connection` (which reports `hasApiKey`) and never request this
       * field: nothing in the UI needs the secret, and a value that is never
       * sent cannot be logged.
       */
      credential: z.object({ apiKey: z.string().min(1) }).strict().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('design/image-connection-test'),
      ok: z.boolean(),
      modelCount: z.number().int().nonnegative().optional(),
      error: z.string().min(1).max(500).optional(),
    })
    .strict(),
]);
export type ImageConnectionRpcResult = z.infer<typeof ImageConnectionRpcResultSchema>;

export const LocalMachineRpcRequestSchema = z.discriminatedUnion('method', [
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('design/image-connection'),
    params: z.object({}).strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('design/image-connection-test'),
    params: z.object({}).strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/get-active-invocation-context'),
    params: z
      .object({
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/get-file-index'),
    params: CodeCollabV2FileIndexRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/open-text'),
    params: CodeCollabV2OpenTextRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/refresh-text'),
    params: CodeCollabV2RefreshTextRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/save-text'),
    params: CodeCollabV2SaveTextRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/open-current-diff'),
    params: CodeCollabV2OpenCurrentDiffRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/open-all-changes-diff'),
    params: CodeCollabV2OpenAllChangesDiffRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/open-turn-diff'),
    params: CodeCollabV2OpenTurnDiffRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/init-directory'),
    params: CodeCollabV2InitDirectoryRequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/lsp-definition'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
        path: z.string().min(1),
        line: z.number().int().nonnegative().optional(),
        character: z.number().int().nonnegative().optional(),
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('code-collab/lsp-references'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
        path: z.string().min(1),
        line: z.number().int().nonnegative().optional(),
        character: z.number().int().nonnegative().optional(),
      })
      .strict(),
  }).strict(),
  // File Preview v3 over the same-machine IPC path. Params travel in the clear
  // here because the socket never leaves the machine.
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('file/preview'),
    params: FilePreviewV3RequestSchema,
  }).strict(),
  // Electron's same-machine preview route. This method deliberately has no
  // Loro Streams counterpart: the desktop user may inspect any local file,
  // while remote requests retain File Preview v3's restricted-root policy.
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('file/resolve-local'),
    params: FilePreviewV3RequestSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/cancel'),
    params: z
      .object({
        sessionId: SessionIdSchema,
        turnId: z.string().trim().min(1),
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/fork'),
    params: SessionForkSpecSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/edit-and-resend'),
    params: SessionEditAndResendSpecSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/dispatch-turn'),
    params: z
      .object({
        sessionId: SessionIdSchema,
        userTurnId: z.string().trim().min(1),
        userId: z.string().trim().min(1),
        timestamp: z.string().trim().min(1),
        // Opaque at the transport layer; the CLI normalizes it with
        // `normalizeSessionTurnInputConfig` before offering the turn, the same
        // guard the Loro Streams Machine RPC server applies.
        inputConfig: z.record(z.string(), z.unknown()),
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/prepare'),
    params: SessionPreparationSpecSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/prepare-cancel'),
    params: SessionPreparationCancelSpecSchema,
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/steer'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
        expectedTurnId: z.string().trim().min(1),
        userTurnId: z.string().trim().min(1),
        userId: z.string().trim().min(1),
        timestamp: z.string().trim().min(1),
        inputConfig: z.record(z.string(), z.unknown()),
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/preview-endpoint-acquire'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
        requestedByUserId: z.string().trim().min(1),
        target: PreviewTargetSchema,
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/preview-endpoint-release'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
        endpointId: z.string().trim().min(1),
      })
      .strict(),
  }).strict(),
  BaseLocalMachineRpcRequestSchema.extend({
    method: z.literal('session/terminate'),
    params: z
      .object({
        sessionId: z.string().trim().min(1),
      })
      .strict(),
  }).strict(),
]);

export type LocalMachineRpcRequest = z.infer<typeof LocalMachineRpcRequestSchema>;
export type LocalMachineRpcRequestValidated = LocalMachineRpcRequest;

export const LocalMachineRpcResultSchema = z.union([
  ImageConnectionRpcResultSchema,
  SessionActiveInvocationContextResultSchema,
  CodeCollabV2FileIndexSnapshotSchema,
  CodeCollabV2OpenTextOkSchema,
  CodeCollabV2RefreshTextResponseSchema,
  CodeCollabV2SaveTextResponseSchema,
  CodeCollabV2OpenCurrentDiffResponseSchema,
  CodeCollabV2OpenAllChangesDiffResponseSchema,
  CodeCollabV2OpenTurnDiffResponseSchema,
  CodeCollabV2InitDirectoryOkSchema,
  CodeCollabV2LspUnsupportedSchema,
  CodeCollabV2ErrorSchema,
  FilePreviewV3ResponseSchema,
  LocalFileResolutionSchema,
  SessionCancelResponseSchema,
  SessionDispatchTurnResponseSchema,
  SessionEditAndResendResponseSchema,
  SessionForkResponseSchema,
  SessionPrepareResponseSchema,
  SessionPrepareCancelResponseSchema,
  SessionPreviewEndpointAcquireResponseSchema,
  SessionPreviewEndpointReleaseResponseSchema,
  SessionSteerResponseSchema,
  SessionTerminateResponseSchema,
]);
export type LocalMachineRpcResult = z.infer<typeof LocalMachineRpcResultSchema>;

export const LocalMachineRpcResponseSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      result: LocalMachineRpcResultSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.string().trim().min(1),
    })
    .strict(),
]);
export type LocalMachineRpcResponse = z.infer<typeof LocalMachineRpcResponseSchema>;

export function safeParseLocalMachineRpcRequest(
  raw: string
):
  | { readonly success: true; readonly data: LocalMachineRpcRequestValidated }
  | { readonly success: false; readonly error: z.ZodError } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = LocalMachineRpcRequestSchema.safeParse(parsed);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof z.ZodError
          ? error
          : new z.ZodError([
              {
                code: z.ZodIssueCode.custom,
                path: [],
                message: 'Invalid JSON',
              },
            ]),
    };
  }
}

export { FilePreviewV3ErrorSchema } from './file-preview';
