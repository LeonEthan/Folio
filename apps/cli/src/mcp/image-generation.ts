/**
 * `folio_generate_image` plumbing (P2.4).
 *
 * Three separable pieces, kept in one module because they share one contract:
 *
 * 1. **Build** the upstream Images request from the resolved connection.
 * 2. **Read** the upstream answer into image bytes — `b64_json` in the response
 *    body, or a `url` we fetch once. Neither path retries: a paid call that
 *    failed is a failure the user decides what to do about.
 * 3. **Land** those bytes in the session workdir as a content-addressed asset
 *    the agent can reference from its PPTD project.
 *
 * Discipline that matters more than the code:
 *
 * - The API key is a request header and nothing else. It is never logged, never
 *   returned in a tool result, and never included in an error message: every
 *   error this module raises is built from the endpoint, the status, and the
 *   upstream's own text. `assertNoSecret` in the tests pins that.
 * - Only image types the design pipeline can actually import are accepted
 *   (PNG/JPEG/GIF — the same set `sniffStaticV1ImageMime` and the design store
 *   admit). A WebP or SVG that renders in a browser but cannot become a Bento
 *   asset is refused with an actionable message instead of being written to a
 *   directory the intake will later reject.
 * - The write is content-addressed, so the same bytes always land at the same
 *   path and a retry of the same prompt is idempotent. A path that already holds
 *   *different* bytes is refused rather than overwritten: the workdir is user
 *   space, and a generated asset never had a right to replace something there.
 */

import {
  IMAGE_CONNECTION_GENERATIONS_PATH,
  imageConnectionUrl,
  type ImageConnectionSettings,
  type ImageHttpRequest,
  type ImageHttpResponse,
  type ImageHttpTransport,
} from '@lody/shared';
import { redactCredential } from '@/design/image-connection';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  sniffStaticV1ImageMime,
  type StaticV1ImageMimeType,
} from '../../../../packages/design-bento/vendor/packages/contracts/src/static-v1';

export const IMAGE_GENERATION_TIMEOUT_MS = 180_000;
/** The upstream JSON envelope (prompt echo + base64 payload) may be larger than the image. */
export const IMAGE_GENERATION_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
/** Matches the design store's per-asset cap (`turn-outcome.ts` `MAX_ASSET_BYTES`). */
export const IMAGE_GENERATION_MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const UPSTREAM_ERROR_CHARS = 300;
const MAX_SIZE_SPEC_CHARS = 32;

/** The default asset directory a PPTD project references as `media/...`. */
export const DESIGN_MEDIA_DIRNAME = 'media';

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

export interface GenerateImageOptions {
  settings: ImageConnectionSettings;
  prompt: string;
  /** Optional upstream `size` (e.g. `1024x1024`). Passed through verbatim. */
  size?: string;
  /** Absolute session workdir; the asset lands under `<workdir>/media/`. */
  workdir: string;
  transport: ImageHttpTransport;
}

export interface GeneratedImageAsset {
  /** Workdir-relative path, exactly what a PPTD page must reference. */
  path: string;
  absolutePath: string;
  sha256: string;
  mimeType: StaticV1ImageMimeType;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Ask the upstream for one image and land it in the workdir.
 *
 * `n` is pinned to 1: the tool returns a single asset, and asking for more would
 * multiply what the user pays for behind a schema that cannot express it.
 */
export async function generateImageAsset(
  options: GenerateImageOptions
): Promise<GeneratedImageAsset> {
  const bytes = await requestImageBytes(options);
  return await writeGeneratedImageAsset(options.workdir, bytes);
}

async function requestImageBytes(options: GenerateImageOptions): Promise<Uint8Array> {
  const response = await callUpstream(options.transport, buildImageGenerationRequest(options));
  if (response.status < 200 || response.status >= 300) {
    throw new ImageGenerationError(
      `image generation failed: HTTP ${response.status}${describeBody(
        response.bytes,
        options.settings.apiKey
      )}`
    );
  }
  const payload = parseGenerationBody(response.bytes, options.settings.apiKey);
  if (payload.base64 !== undefined) {
    return decodeBase64Payload(payload.base64);
  }
  if (payload.url !== undefined) {
    return await downloadGeneratedImage(options, payload.url);
  }
  throw new ImageGenerationError(
    'image generation failed: the response carried neither b64_json nor url'
  );
}

async function callUpstream(
  transport: ImageHttpTransport,
  request: ImageHttpRequest
): Promise<ImageHttpResponse> {
  try {
    return await transport(request);
  } catch (error) {
    throw new ImageGenerationError(
      `image generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function downloadGeneratedImage(
  options: GenerateImageOptions,
  url: string
): Promise<Uint8Array> {
  // The URL comes from the configured upstream; this is a plain GET of the bytes
  // it already produced, not a second generation. Bounded and non-redirecting
  // for the same reasons the API call is.
  const response = await callUpstream(options.transport, {
    url,
    method: 'GET',
    headers: { accept: 'image/*' },
    timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
    maxBytes: IMAGE_GENERATION_MAX_IMAGE_BYTES,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ImageGenerationError(
      `image generation failed: fetching the returned image failed with HTTP ${response.status}`
    );
  }
  if (response.bytes.byteLength > IMAGE_GENERATION_MAX_IMAGE_BYTES) {
    throw new ImageGenerationError(
      `image generation failed: the image exceeds ${IMAGE_GENERATION_MAX_IMAGE_BYTES} bytes`
    );
  }
  return response.bytes;
}

/**
 * The upstream request. Exported so the tests assert the real shape — endpoint,
 * model, and a present bearer header — instead of asserting a fake's own memory
 * of what it was called with.
 */
export function buildImageGenerationRequest(
  options: Pick<GenerateImageOptions, 'settings' | 'prompt' | 'size'>
): ImageHttpRequest {
  const size = options.size?.trim();
  if (size !== undefined && size.length > MAX_SIZE_SPEC_CHARS) {
    throw new ImageGenerationError(`size is longer than ${MAX_SIZE_SPEC_CHARS} characters`);
  }
  const body: Record<string, unknown> = {
    model: options.settings.model,
    prompt: options.prompt,
    n: 1,
  };
  if (size !== undefined && size.length > 0) {
    body.size = size;
  }
  return {
    url: imageConnectionUrl(options.settings, IMAGE_CONNECTION_GENERATIONS_PATH),
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.settings.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
    maxBytes: IMAGE_GENERATION_MAX_RESPONSE_BYTES,
  };
}

type GenerationPayload = { base64?: string; url?: string };

/** The `data[0]` entry of an OpenAI-Images-compatible response. */
function parseGenerationBody(bytes: Uint8Array, credential: string): GenerationPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ImageGenerationError('image generation failed: the response was not valid JSON');
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!first || typeof first !== 'object') {
    throw new ImageGenerationError(
      `image generation failed: the response carried no image${describeBody(bytes, credential)}`
    );
  }
  const base64 = typeof first.b64_json === 'string' ? first.b64_json : undefined;
  const url = typeof first.url === 'string' && first.url.length > 0 ? first.url : undefined;
  return { ...(base64 === undefined ? {} : { base64 }), ...(url === undefined ? {} : { url }) };
}

function decodeBase64Payload(base64: string): Uint8Array {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) {
    throw new ImageGenerationError('image generation failed: the returned image was empty');
  }
  if (bytes.byteLength > IMAGE_GENERATION_MAX_IMAGE_BYTES) {
    throw new ImageGenerationError(
      `image generation failed: the image exceeds ${IMAGE_GENERATION_MAX_IMAGE_BYTES} bytes`
    );
  }
  return new Uint8Array(bytes);
}

/**
 * The upstream's own text, with the credential removed.
 *
 * The base URL is user-typed, so the endpoint on the other side is not
 * necessarily a party we trust: a gateway that echoes request headers into its
 * error body would otherwise put the key into a tool result the agent reads and
 * a daemon log line. Redacting the exact credential we sent closes that echo.
 */
function describeBody(bytes: Uint8Array, credential: string): string {
  const text = new TextDecoder().decode(bytes.slice(0, UPSTREAM_ERROR_CHARS * 4));
  let message = text.trim();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    const upstream = parsed?.error?.message;
    if (typeof upstream === 'string' && upstream.trim().length > 0) message = upstream.trim();
  } catch {
    // Not JSON; the raw snippet is the honest answer.
  }
  if (message.length === 0) return '';
  return `: ${redactCredential(message, credential).slice(0, UPSTREAM_ERROR_CHARS)}`;
}

const EXTENSION_BY_MIME: Record<StaticV1ImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
};

/**
 * Write image bytes into `<workdir>/media/<sha256>.<ext>`, atomically and
 * idempotently.
 *
 * A path that already holds the same bytes is reused (the content address is the
 * identity), a symlink or non-regular file is refused, and anything else at that
 * path is a collision we do not resolve by writing — the caller gets an error
 * naming the path. The temporary file is created `wx` in the target directory so
 * the rename is intra-filesystem, then the directory is synced so a crash cannot
 * leave the name pointing at nothing.
 */
export async function writeGeneratedImageAsset(
  workdir: string,
  bytes: Uint8Array
): Promise<GeneratedImageAsset> {
  const mimeType = sniffStaticV1ImageMime(bytes);
  if (mimeType === null) {
    throw new ImageGenerationError(
      'image generation failed: the returned bytes are not a PNG, JPEG, or GIF image, so the design intake could not import them'
    );
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const relative = `${DESIGN_MEDIA_DIRNAME}/${sha256}.${EXTENSION_BY_MIME[mimeType]}`;
  const root = path.resolve(workdir);
  const absolutePath = path.resolve(root, relative);
  if (!isWithin(root, absolutePath)) {
    throw new ImageGenerationError('image generation failed: the asset path escapes the workdir');
  }

  const existing = await statOrNull(absolutePath);
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new ImageGenerationError(`refusing to write over a non-regular file: ${relative}`);
    }
    const current = await readFile(absolutePath);
    if (!current.equals(Buffer.from(bytes))) {
      throw new ImageGenerationError(
        `refusing to overwrite an unrelated file at the content-addressed path ${relative}`
      );
    }
  } else {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFileAtomically(absolutePath, bytes);
  }

  const dimensions = readImageDimensions(bytes, mimeType);
  return {
    path: relative,
    absolutePath,
    sha256,
    mimeType,
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
    bytes: bytes.byteLength,
  };
}

async function writeFileAtomically(target: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  const directory = await open(path.dirname(target), constants.O_RDONLY).catch(() => null);
  if (directory !== null) {
    try {
      await directory.sync().catch(() => undefined);
    } finally {
      await directory.close();
    }
  }
}

async function statOrNull(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Dimensions from the file header, for the types the design pipeline admits.
 *
 * Returns `null` when the header is malformed or the format is not parsed here:
 * the caller reports dimensions as unavailable rather than guessing, and the
 * upstream's own `size` echo is never trusted over the bytes.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: StaticV1ImageMimeType
): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png') {
      // IHDR is the first chunk: 8-byte signature, 4-byte length, 4-byte type.
      if (bytes.length < 24) return null;
      return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
    }
    if (mimeType === 'image/gif' && bytes.length >= 10) {
      // The GIF logical screen descriptor is the one little-endian header here.
      return { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
    }
    if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 <= bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1]!;
        // SOF0..SOF15 minus the DHT/JPG/DAC markers that share the range.
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return { width: readU16(bytes, offset + 7), height: readU16(bytes, offset + 5) };
        }
        const length = readU16(bytes, offset + 2);
        if (length < 2) return null;
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const readU16 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! << 8) | bytes[offset + 1]!;

const readU16LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8);

const readU32 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!) >>>
  0;
