/**
 * PPTD validator（Active Profile v1 全表面，GD-4b Wave B2；docs/gd-4-acceptance.md §3.2 步骤 3）。
 *
 * 纪律：
 * - fail closed：contracts/src/pptd.ts 字段集即白名单，未声明字段一律拒绝；词表来源
 *   BENTO_ELEMENT_KINDS_V4（contracts，common.elementType 行派生，7 型）。
 * - E 码臂位 = 冻结 matrix 各行 failureCode（v1.json 为唯一权威）：
 *     E001 结构/未知字段/缺必填/YAML 形态；E002 画布尺寸；E003 elementType 词表外；
 *     E004 远程 URL（含 customFonts.src，D3 收紧注记）/script/事件；E005 媒体/字体
 *     资产缺失或逃逸 media/；E006 bounds；E008 $ref 悬空（colors/textStyles/tableStyles）；
 *     E009 table grid 权重/结构违规（table.grid 行）；E011 any matrix-excluded
 *     capability input (capabilityId 进 message);
 *     E012 未登记字体（font.familyUniform/familyLatinEa/fallback 行）；E013 非法值/
 *     词表外枚举（含 rotation/flip 落在 table/chart 宿主、fit/arrow/枚举/数值域）；
 *     E014 结构违规（common.elementId 重复/缺失、line.points、shape.customPath path
 *     语法、table merge 越界/重叠/覆盖、chart 数据完整性/§5.4 混排/encode 通道形态/
 *     radar category 同列）。E007/D101 已退役（REPORT §5），v4 路径零产出。
 * - 画布合法性自含：size 必须为正有限整数对（GD-2b，无外部许可名单）。
 * - 诊断 path = 文件相对路径 + "#" + YAML 路径（如 pages/e004.page#elements[0].src）；
 *   manifest 自身 = 入口文件名，YAML 解析失败时 YAML 路径为空（落在文件本身）。
 * - pages 相对入口文件所在目录解析；media/ 相对 opts.projectRoot 解析。
 * - 富文本语法单点在 richtext.ts（本文件消费其解析结果做 E013 具名 + E012 字体核对）。
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  BentoTextParagraphV4,
  Diagnostic,
  DiagnosticCode,
  FrozenAuthoringValidationResult,
  PptdManifest,
  PptdPage,
  ValidatedPptd,
  ValidationResult,
} from "./contracts.ts";
import {
  BENTO_ELEMENT_KINDS_V4,
  CHART_ENCODE_OPTIONAL,
  CHART_ENCODE_REQUIRED,
  CHART_SERIES_FIELDS,
  CHART_SERIES_TYPES,
  ARROWHEADS,
  BORDER_STYLES,
  CURVE_MODES,
  FIT_MODES,
  H_ALIGNS,
  TEXT_DIRECTIONS,
  V_ALIGNS,
  isValidLineHeightPx,
  isValidLineHeightRatio,
  isValidLineHeightValue,
  isStaticV1FontRegistrationOptional,
  sniffStaticV1FontMime,
  sniffStaticV1ImageMime,
  staticV1FontFamilyError,
  staticV1FontDescriptorError,
  staticV1FontRegistrationFamilyError,
  staticV1FontStackFaces,
  isStaticV1CropShape,
  isStaticV1ShapeName,
  isStaticV1ViewBox,
  resolveStaticV1IconMembership,
  staticV1ShapeAdjustmentsError,
  staticV1SvgPathSyntaxError,
} from "./contracts.ts";
import { FROZEN_CAPABILITY_MATRIX } from "./capability-matrix.ts";
import { liveValidationResult } from "./live-diagnostics.ts";
import { validateV3 } from "./pptd-v3.ts";
import { parseRichText } from "./richtext.ts";
import { staticV1LatexSyntaxError } from "./latex.ts";
import { validateProductBoundaryFile, validateProductBoundarySnapshot } from "./product-boundary.ts";

export interface ValidateOptions {
  projectRoot: string;
}

type Raw = Record<string, unknown>;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const REMOTE_URL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;
// Keep the authoring line-point grammar byte-compatible with kernel's
// COORD_RE: a leading `+` is not part of the modeled syntax, even though
// Number("+1") would otherwise accept it and later normalize the spelling.
const LINE_COORD_RE = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

// Excluded input names are derived from the frozen matrix.  The page aliases
// below cover only concrete Page.* PPTD paths (including Page.notes spelling);
// the capability set itself is never duplicated here, so a matrix change
// cannot silently leave a stale E011 support list behind.
const VALIDATION_MATRIX = FROZEN_CAPABILITY_MATRIX;
const EXCLUDED_CAPABILITY_IDS = new Set(
  VALIDATION_MATRIX.rows
    .filter((row) => row.profileState === "excluded")
    .map((row) => row.capabilityId),
);
const EXCLUDED_FAILURE_CODES = new Map(
  VALIDATION_MATRIX.rows
    .filter((row) => row.profileState === "excluded")
    .map((row) => {
      const code = row.failureCode.match(/PPTD-[ED]\d{3}/)?.[0];
      if (code === undefined) throw new Error(`excluded matrix row has no diagnostic code: ${row.capabilityId}`);
      return [row.capabilityId, code as DiagnosticCode];
    }),
);
const MULTI_PAGE_PPTD_PATH = "pptd/v2 Presentation.pages（多页/deck 多文件结构）";
const MULTI_PAGE_CAPABILITY_ID = VALIDATION_MATRIX.rows.find(
  (row) => row.profileState === "excluded" && row.pptdPath === MULTI_PAGE_PPTD_PATH,
)?.capabilityId ?? null;

// Only these matrix rows have a concrete page-level PPTD field.  Excluded
// rows whose matrix path is a resource/prose scope (audio/video, transitions,
// PPTX interop, Kimi runtime) must not invent a positive page vocabulary.
const EXCLUDED_PAGE_FIELD_PPTD_PATHS: Readonly<Record<string, string>> = Object.freeze({
  pageType: "pptd/v2 Page.pageType（deck 分类标签；不影响渲染）",
  notes: "pptd/v2 Page.notes（speaker notes）",
  animations: "pptd/v2 Page.animations（§6 动画编排/trigger/easing/motion-path）",
});

const EXCLUDED_PAGE_FIELD_ALIASES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(EXCLUDED_PAGE_FIELD_PPTD_PATHS).map(([inputKey, pptdPath]) => {
    const row = VALIDATION_MATRIX.rows.find((candidate) => candidate.pptdPath === pptdPath);
    if (row?.profileState !== "excluded") {
      throw new Error(`excluded page-field alias is not matrix-derived: ${inputKey} -> ${pptdPath}`);
    }
    return [inputKey, row.capabilityId];
  })),
);
const MATRIX_PAGE_EXCLUDED_PATHS = new Set(
  VALIDATION_MATRIX.rows
    .filter((row) => row.profileState === "excluded" && row.pptdPath.startsWith("pptd/v2 Page."))
    .map((row) => row.pptdPath),
);
const DECLARED_PAGE_EXCLUDED_PATHS = new Set(Object.values(EXCLUDED_PAGE_FIELD_PPTD_PATHS));
if (
  MATRIX_PAGE_EXCLUDED_PATHS.size !== DECLARED_PAGE_EXCLUDED_PATHS.size ||
  [...MATRIX_PAGE_EXCLUDED_PATHS].some((pptdPath) => !DECLARED_PAGE_EXCLUDED_PATHS.has(pptdPath))
) {
  throw new Error("excluded Page.* input aliases do not exactly cover matrix-derived excluded Page.* paths");
}

function excludedPageCapabilityForInputKey(key: string): string | null {
  const capabilityId = EXCLUDED_PAGE_FIELD_ALIASES[key];
  return capabilityId !== undefined && EXCLUDED_CAPABILITY_IDS.has(capabilityId) ? capabilityId : null;
}

/** E004 专属：script/iframe/foreignObject/音视频类 elementType（其余未知类型归 E003）。 */
const FORBIDDEN_ELEMENT_TYPES = new Set([
  "script",
  "iframe",
  "foreignobject",
  "video",
  "audio",
]);

// 同步纪律：以下 *_FIELDS 字段集是 contracts/src/pptd.ts 对应 interface 字段集的运行时真值
//（fail-closed 白名单的唯一来源）。任一侧增删字段，必须同步修改对侧，否则白名单与类型漂移。
const MANIFEST_FIELDS = new Set(["version", "title", "customFonts", "size", "theme", "pages"]);
const CUSTOM_FONT_FIELDS = new Set(["family", "src", "weight", "style"]);
const THEME_FIELDS = new Set(["colors", "textStyles", "tableStyles"]);
const TEXT_STYLE_FIELDS = new Set([
  "color",
  "fontSize",
  "fontFamily",
  "bold",
  "italic",
  "backgroundColor",
  "lineHeight",
  "lineHeightPx",
  "letterSpacing",
  "marginTop",
]);
const TABLE_STYLE_FIELDS = new Set([
  "cellStyle",
  "firstRowStyle",
  "lastRowStyle",
  "firstColumnStyle",
  "lastColumnStyle",
  "bodyStyles",
  "rowOverColumn",
]);
const CELL_STYLE_FIELDS = new Set([...TEXT_STYLE_FIELDS, "fill", "border", "align"]);
const PAGE_FIELDS = new Set(["background", "elements"]);
const ELEMENT_BASE_FIELDS = new Set(["elementId", "elementType", "bounds", "rotation", "flip"]);
const TEXT_FIELDS = new Set(["opacity", "content"]);
const TEXT_CONTENT_FIELDS = new Set([
  "text",
  "style",
  "color",
  "fontSize",
  "fontFamily",
  "bold",
  "italic",
  "backgroundColor",
  "lineHeight",
  "lineHeightPx",
  "letterSpacing",
  "marginTop",
  "textDirection",
  "wrap",
  "align",
  "gradient",
  "shadow",
]);
const SHAPE_FIELDS = new Set(["shapeName", "adjustments", "viewBox", "path", "fill", "opacity", "shadow", "border"]);
const LINE_FIELDS = new Set(["viewBox", "points", "curve", "arrow", "border", "opacity", "shadow"]);
const IMAGE_FIELDS = new Set(["src", "cropShape", "fit", "crop", "opacity", "shadow", "border"]);
const ICON_FIELDS = new Set(["iconName", "fill", "opacity", "shadow", "border"]);
const TABLE_FIELDS = new Set(["columnWidths", "rowHeights", "rows", "style", "fill", "border", "shadow"]);
const TABLE_CELL_FIELDS = new Set([
  "text",
  "textStyle",
  "color",
  "fontSize",
  "fontFamily",
  "bold",
  "italic",
  "backgroundColor",
  "lineHeight",
  "lineHeightPx",
  "letterSpacing",
  "marginTop",
  "fill",
  "border",
  "align",
  "rowSpan",
  "colSpan",
]);
const SOLID_FILL_FIELDS = new Set(["type", "color"]);
const GRADIENT_FILL_FIELDS = new Set(["type", "gradientType", "stops", "angle"]);
const IMAGE_FILL_FIELDS = new Set(["type", "src", "fit", "crop", "opacity"]);
const COLOR_STOP_FIELDS = new Set(["position", "color"]);
const IMAGE_FIT_FIELDS = new Set(["mode"]);
const IMAGE_CROP_FIELDS = new Set(["left", "top", "right", "bottom"]);
const FONT_FAMILY_FIELDS = new Set(["latin", "ea"]);
const CHART_FIELDS = new Set([
  "data",
  "series",
  "seriesDefaults",
  "xAxis",
  "yAxis",
  "barWidth",
  "barGap",
  "categoryGap",
  "spokeAxis",
  "title",
  "legend",
  "dataLabels",
  "fontFamily",
  "fill",
  "border",
  "shadow",
]);
const CHART_DATA_FIELDS = new Set(["cols", "rows"]);
const CHART_TEXT_STYLE_FIELDS = new Set(["color", "fontSize", "fontFamily"]);
const CHART_TITLE_FIELDS = new Set([...CHART_TEXT_STYLE_FIELDS, "text"]);
const CHART_LEGEND_FIELDS = new Set([...CHART_TEXT_STYLE_FIELDS, "show", "position"]);
const CHART_DATA_LABEL_FIELDS = new Set([...CHART_TEXT_STYLE_FIELDS, "show", "content", "numberFormat"]);
const CHART_MARKER_FIELDS = new Set(["shape", "fill", "border", "size"]);
const CHART_LINE_STYLE_FIELDS = new Set(["style", "color", "width"]);
const CHART_AXIS_FIELDS = new Set(["show", "type", "min", "max", "reverse", "title", "label", "axisLine", "gridLine"]);
const CHART_AXIS_LABEL_FIELDS = new Set([...CHART_TEXT_STYLE_FIELDS, "numberFormat"]);
const CHART_AXIS_LINE_FIELDS = new Set([...CHART_LINE_STYLE_FIELDS, "arrow"]);
const CHART_SPOKE_FIELDS = new Set(["show", "min", "max", "label", "axisLine", "gridLine"]);
const CHART_UP_DOWN_BARS_FIELDS = new Set(["fill", "border"]);
const CHART_COLOR_SCALE_FIELDS = new Set(["type", "domain"]);
const CHART_DATA_FILTER_FIELDS = new Set(["col", "value"]);
const CHART_SERIES_DEFAULT_TYPES = new Set(["bar", "line", "area", "scatter", "bubble", "candlestick", "radar"]);
// chart 逐型词表单一来源 = contracts/chart-invariants.ts；checkUnknownFields 消费 Set 视图。
const CHART_SERIES_FIELD_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(CHART_SERIES_FIELDS).map(([type, fields]) => [type, new Set(fields)]),
);
const CHART_SERIES_DEFAULT_FIELDS = (type: string): Set<string> => {
  const fields = new Set(CHART_SERIES_FIELDS[type]);
  fields.delete("type");
  fields.delete("encode");
  return fields;
};

const CHART_TYPE_MIX_FREE = new Set(["bar", "line", "area", "scatter", "bubble"]);
const CHART_TYPE_CANDLESTICK_MIX = new Set(["bar", "line", "area"]);
const CHART_TYPE_EXCLUSIVE = new Set(["pie", "radar", "waterfall", "heatmap", "treemap", "sunburst", "sankey"]);
const DATA_LABEL_CONTENTS = new Set(["value", "percentage", "category"]);
const CHART_MARKER_SHAPES = new Set(["circle", "rect", "diamond", "triangle"]);
const CHART_LEGEND_POSITIONS = new Set(["top", "bottom", "left", "right"]);
const CHART_AXIS_TYPES = new Set(["category", "value"]);
const CHART_AXIS_ARROWS = new Set(["start", "end", "both"]);
const CHART_SIZE_SCALES = new Set(["linear", "sqrt", "log"]);
const CHART_NODE_ALIGNS = new Set(["left", "right", "justify"]);
const CHART_NULL_HANDLING = new Set(["zero", "gap", "connect"]);
const CHART_STACK_MODES = new Set(["value", "percent", "stream"]);
const CHART_COLOR_SCALE_TYPES = new Set(["linear", "diverging"]);
/**
 * validator 白名单组 → capabilityId 对账表（D4，与 matrix 单向派生的反向对账）：
 * (a) 每个 capabilityId 必须存在于冻结 matrix 且 active；
 * (b) 每个 active 行必须被 ≥1 组覆盖（test/pptd-backing.test.ts 双向夹住）。
 * 「derived」组收 PPTD 无输入字段的 active 行：其语义由 import/validate 机制保证
 * 不被伪输入冒充（fallback/measure = 栈与 1px=1pt 原样透传；image.pipeline =
 * crop/fit/cropShape 三字段无损入 canonical；measurement = 渲染期派生）。
 */
export const AUTHORING_VALIDATE_BACKING = {
  manifest: ["canvas.size", "font.registration"],
  page: ["canvas.background", "common.zOrder", "common.createDelete"],
  elementBase: [
    "common.elementId",
    "common.elementType",
    "common.bounds",
    "common.rotation",
    "common.opacity",
    "common.flip",
    "common.group",
  ],
  theme: ["common.theme", "common.styleInheritance"],
  color: ["common.color"],
  fill: ["fill.solid", "fill.gradientLinear", "fill.gradientRadial", "fill.image"],
  border: ["common.border"],
  shadow: ["common.shadow", "text.shadow"],
  text: [
    "text.plain",
    "text.paragraphs",
    "text.lineBreak",
    "text.runs.color",
    "text.runs.fontSize",
    "text.runs.fontFamily",
    "text.runs.backgroundColor",
    "text.bold",
    "text.italic",
    "text.underline",
    "text.strikethrough",
    "text.superscript",
    "text.subscript",
    "text.hyperlink",
    "text.lists",
    "text.listItemStyles",
    "text.latex",
    "text.color",
    "text.fontSize",
    "text.backgroundColor",
    "text.lineHeight",
    "text.lineHeightPx",
    "text.letterSpacing",
    "text.marginTop",
    "text.align",
    "text.paragraphAlign",
    "text.paragraphLineHeight",
    "text.paragraphMargin",
    "text.textDirection",
    "text.wrap",
    "text.gradient",
  ],
  font: ["font.familyUniform", "font.familyLatinEa", "font.fallback"],
  derived: ["font.measurement", "image.pipeline"],
  shape: ["shape.preset", "shape.adjustments", "shape.customPath"],
  line: ["line.points", "line.curve", "line.arrow"],
  image: ["image.src", "image.fit", "image.crop", "image.cropShape"],
  icon: ["icon.name"],
  table: [
    "table.grid",
    "table.cellText",
    "table.cellTextStyleRef",
    "table.cellTextProps",
    "table.cellFill",
    "table.cellBorder",
    "table.cellAlign",
    "table.merge",
    "table.styleRef",
    "table.styleSlots",
    "table.bodyStylesCycle",
    "table.rowOverColumn",
  ],
  chart: [
    "chart.data",
    "chart.encode",
    "chart.seriesDefaults",
    "chart.typeMixing",
    "chart.axisBasic",
    "chart.axisLabel",
    "chart.axisLineGrid",
    "chart.axisSecondary",
    "chart.spokeAxis",
    "chart.barLayout",
    "chart.title",
    "chart.legend",
    "chart.dataLabels",
    "chart.palette",
    "chart.bar",
    "chart.line",
    "chart.area",
    "chart.scatter",
    "chart.bubble",
    "chart.candlestick",
    "chart.pie",
    "chart.radar",
    "chart.waterfall",
    "chart.heatmap",
    "chart.treemap",
    "chart.sunburst",
    "chart.sankey",
  ],
} as const;

/** @deprecated Use AUTHORING_VALIDATE_BACKING. */
export const PPTD_VALIDATE_BACKING = AUTHORING_VALIDATE_BACKING;

function isRecord(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

interface Ctx {
  diagnostics: Diagnostic[];
  /** Filesystem mode: projectRoot set. Snapshot mode: snapshot set. Exactly one is set. */
  projectRoot?: string;
  snapshot?: ReadonlyMap<string, Uint8Array>;
  /** size 形态合法（[w, h] 数字对）时才有画布；E001/E002 均不妨碍 bounds 检查（尺寸已知）。 */
  canvas: { width: number; height: number } | null;
  themeColors: Set<string>;
  themeTextStyles: Set<string>;
  themeTableStyles: Set<string>;
  /** manifest.customFonts 已登记 family（E012 核对源）。 */
  registeredFonts: Set<string>;
}

function report(ctx: Ctx, code: DiagnosticCode, file: string, yamlPath: string, message: string): void {
  ctx.diagnostics.push({ code, path: `${file}#${yamlPath}`, message });
}

/** 未知字段一律 fail closed（E001）；事件处理器字段（on*）归 E004。 */
function checkUnknownFields(
  ctx: Ctx,
  rec: Raw,
  allowed: Set<string>,
  file: string,
  ypath: string,
  excludedKeys: ReadonlySet<string> = new Set(),
): void {
  for (const key of Object.keys(rec)) {
    if (allowed.has(key)) continue;
    if (excludedKeys.has(key)) continue;
    if (/^on/i.test(key)) {
      report(ctx, "PPTD-E004", file, `${ypath}.${key}`, "事件处理器字段不在 PPTD 合法子集");
    } else {
      report(ctx, "PPTD-E001", file, ypath ? `${ypath}.${key}` : key, `未知字段 "${key}"（fail closed）`);
    }
  }
}

/** 颜色：hex 或 `$` theme.colors 引用；悬空引用 E008（common.theme 行），非法 hex 串 E013（common.color 行）。 */
function checkColor(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (typeof value !== "string") {
    report(ctx, "PPTD-E001", file, ypath, "颜色必须是 hex 字符串或 $ theme 引用");
    return;
  }
  if (value.startsWith("$")) {
    if (!ctx.themeColors.has(value.slice(1))) {
      report(ctx, "PPTD-E008", file, ypath, `$ theme 引用 "${value}" 在 theme.colors 中不存在`);
    }
    return;
  }
  if (!HEX_COLOR_RE.test(value)) {
    report(ctx, "PPTD-E013", file, ypath, `颜色 "${value}" 不是合法 hex（common.color 行；其他色彩函数不在子集）`);
  }
}

/** 栈串 → face 列表（去引号去空白）。 */
/** E012（font.fallback/familyUniform 行）：栈内每个非 generic face 必须登记于 customFonts。 */
function checkFontFacesRegistered(ctx: Ctx, stack: string, file: string, ypath: string): void {
  for (const face of staticV1FontStackFaces(stack)) {
    if (isStaticV1FontRegistrationOptional(face)) continue;
    if (!ctx.registeredFonts.has(face)) {
      report(ctx, "PPTD-E012", file, ypath, `fontFamily 栈引用未登记 family "${face}"（须登记于 manifest customFonts）`);
    }
  }
}

/** fontFamily 结构（string 栈或 {latin, ea}）+ E012 逐 face 核对（font.familyLatinEa 行）。 */
function checkFontFamily(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  const familyError = staticV1FontFamilyError(value);
  if (familyError !== null) {
    report(ctx, "PPTD-E013", file, ypath, familyError);
    return;
  }
  if (typeof value === "string") {
    checkFontFacesRegistered(ctx, value, file, ypath);
    return;
  }
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "fontFamily 必须是字符串或 {latin, ea}");
    return;
  }
  checkUnknownFields(ctx, value, FONT_FAMILY_FIELDS, file, ypath);
  if (typeof value.latin !== "string" || typeof value.ea !== "string") {
    report(ctx, "PPTD-E001", file, ypath, "fontFamily 对象必须含字符串字段 latin 与 ea");
    return;
  }
  checkFontFacesRegistered(ctx, value.latin, file, `${ypath}.latin`);
  checkFontFacesRegistered(ctx, value.ea, file, `${ypath}.ea`);
}

/** 媒体/字体资产路径（E004 远程 / E005 缺失或逃逸）；isFontSrc 时 E004 message 注记上游偏差。 */
function checkMediaPath(ctx: Ctx, value: unknown, file: string, ypath: string, kind: "image" | "font" = "image"): void {
  if (typeof value !== "string" || value.length === 0) {
    report(ctx, "PPTD-E001", file, ypath, "src 必填且为字符串");
    return;
  }
  if (REMOTE_URL_RE.test(value)) {
    report(
      ctx,
      "PPTD-E004",
      file,
      ypath,
      kind === "font"
        ? "远程字体 URL 不在 Active Profile v1（上游允许 Google Fonts CSS；本地子集收紧为 media/ 字节，冻结裁决 D3）"
        : "远程 URL 不在 PPTD 合法子集",
    );
    return;
  }
  const segments = value.split("/");
  if (!value.startsWith("media/") || segments.includes("..") || segments.some((s) => s.length === 0)) {
    report(ctx, "PPTD-E005", file, ypath, "src 必须是 media/ 下相对路径（不得逃逸）");
    return;
  }
  const present = ctx.snapshot !== undefined ? ctx.snapshot.has(value) : existsSync(path.resolve(ctx.projectRoot!, value));
  if (!present) {
    report(ctx, "PPTD-E005", file, ypath, `引用媒体文件不存在：${value}（相对 projectRoot）`);
    return;
  }
  // #84 生成路径与命令路径同标准（revisions.ts）：语义引用的 media 字节必须是
  // 对应白名单格式的真实字节，不是扩展名声明。字节不可得（读取竞态）时保持
  // 存在性结论，由收集/渲染环节的既有检查兜底。
  const bytes = ctx.snapshot !== undefined
    ? ctx.snapshot.get(value)
    : (() => {
        try {
          return new Uint8Array(readFileSync(path.resolve(ctx.projectRoot!, value)));
        } catch {
          return undefined;
        }
      })();
  if (bytes !== undefined) {
    const valid = kind === "font" ? sniffStaticV1FontMime(bytes) !== null : sniffStaticV1ImageMime(bytes) !== null;
    if (!valid) {
      report(ctx, "PPTD-E013", file, ypath, kind === "font"
        ? "font bytes are not a structurally valid static-v1 TTF/TTC/OTF/WOFF/WOFF2 asset"
        : "image bytes are not a structurally valid static-v1 PNG/JPEG/GIF asset");
    }
  }
}

function checkFill(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "fill 必须是对象");
    return;
  }
  if (value.type === "solid") {
    checkUnknownFields(ctx, value, SOLID_FILL_FIELDS, file, ypath);
    checkColor(ctx, value.color, file, `${ypath}.color`);
    return;
  }
  if (value.type === "gradient") {
    checkUnknownFields(ctx, value, GRADIENT_FILL_FIELDS, file, ypath);
    if (value.gradientType !== "linear" && value.gradientType !== "radial") {
      report(ctx, "PPTD-E013", file, `${ypath}.gradientType`, `gradientType "${String(value.gradientType)}" 不在词表（linear/radial）`);
    }
    if (value.angle !== undefined) {
      // fill.gradientRadial 行 stricter reading：canonical radial 无 angle 字段，
      // 惰性 angle 会构成静默损失，故 radial 上的 angle 直接拒绝。
      if (value.gradientType === "radial") {
        report(ctx, "PPTD-E013", file, `${ypath}.angle`, "radial gradient 不接受 angle（仅 linear 生效；canonical 不承载惰性字段）");
      } else if (!isFiniteNumber(value.angle) || value.angle < 0 || value.angle >= 360) {
        report(ctx, "PPTD-E013", file, `${ypath}.angle`, "gradient angle 必须是 [0, 360) 数字");
      }
    }
    if (!Array.isArray(value.stops) || value.stops.length < 2) {
      report(ctx, "PPTD-E013", file, `${ypath}.stops`, "gradient stops 至少 2 个");
    } else {
      value.stops.forEach((stop, i) => {
        const sp = `${ypath}.stops[${i}]`;
        if (!isRecord(stop)) {
          report(ctx, "PPTD-E001", file, sp, "color stop 必须是对象");
          return;
        }
        checkUnknownFields(ctx, stop, COLOR_STOP_FIELDS, file, sp);
        if (!isFiniteNumber(stop.position) || stop.position < 0 || stop.position > 1) {
          report(ctx, "PPTD-E013", file, `${sp}.position`, "stop position 必须是 [0, 1] 数字");
        }
        checkColor(ctx, stop.color, file, `${sp}.color`);
      });
    }
    return;
  }
  if (value.type === "image") {
    checkUnknownFields(ctx, value, IMAGE_FILL_FIELDS, file, ypath);
    checkMediaPath(ctx, value.src, file, `${ypath}.src`);
    if (value.fit !== undefined) {
      if (!isRecord(value.fit)) {
        report(ctx, "PPTD-E001", file, `${ypath}.fit`, "image fill fit 必须是对象");
      } else {
        checkUnknownFields(ctx, value.fit, IMAGE_FIT_FIELDS, file, `${ypath}.fit`);
        if (typeof value.fit.mode !== "string" || !FIT_MODES.has(value.fit.mode)) {
          report(ctx, "PPTD-E013", file, `${ypath}.fit.mode`, `fit.mode "${String(value.fit.mode)}" 不在词表（fill/contain/cover）`);
        }
      }
    }
    if (value.crop !== undefined) checkImageCrop(ctx, value.crop, file, `${ypath}.crop`);
    if (value.opacity !== undefined) checkOpacityValue(ctx, value.opacity, file, `${ypath}.opacity`);
    return;
  }
  report(ctx, "PPTD-E013", file, `${ypath}.type`, `fill.type "${String(value.type)}" 不在词表（solid/gradient/image；canvas.background 行）`);
}

function checkOpacityValue(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    report(ctx, "PPTD-E013", file, ypath, "opacity 必须是 [0, 1] 数字");
  }
}

function checkImageCrop(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "crop 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, IMAGE_CROP_FIELDS, file, ypath);
  for (const k of ["left", "top", "right", "bottom"] as const) {
    if (value[k] !== undefined && !isFiniteNumber(value[k])) {
      report(ctx, "PPTD-E013", file, `${ypath}.${k}`, "crop 分量必须是数字");
    }
  }
  // image.crop 行：退化源矩形（left+right≥1 / top+bottom≥1）具名拒绝（pptd.md:262 约束）。
  const left = typeof value.left === "number" ? value.left : 0;
  const right = typeof value.right === "number" ? value.right : 0;
  const top = typeof value.top === "number" ? value.top : 0;
  const bottom = typeof value.bottom === "number" ? value.bottom : 0;
  if (left + right >= 1 || top + bottom >= 1) {
    report(ctx, "PPTD-E013", file, ypath, "crop 退化：必须满足 left+right<1 且 top+bottom<1");
  }
}

function checkShadow(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "shadow 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, new Set(["blur", "color", "offset"]), file, ypath);
  if (!isFiniteNumber(value.blur)) {
    report(ctx, "PPTD-E013", file, `${ypath}.blur`, "shadow.blur 必填且为数字");
  }
  checkColor(ctx, value.color, file, `${ypath}.color`);
  if (
    value.offset !== undefined &&
    (!Array.isArray(value.offset) || value.offset.length !== 2 || !value.offset.every(isFiniteNumber))
  ) {
    report(ctx, "PPTD-E013", file, `${ypath}.offset`, "shadow.offset 必须是 [x, y] 数字对");
  }
}

function checkBorder(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "border 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, new Set(["style", "width", "color"]), file, ypath);
  if (value.style !== undefined && (typeof value.style !== "string" || !BORDER_STYLES.has(value.style))) {
    report(ctx, "PPTD-E013", file, `${ypath}.style`, "border.style 必须是 solid/dash/dot");
  }
  if (value.width !== undefined && (!isFiniteNumber(value.width) || value.width <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.width`, "border.width 必须是正数");
  }
  if (value.color !== undefined) checkColor(ctx, value.color, file, `${ypath}.color`);
}

/** table.cellBorder 行：BorderSpec 单边/两边/四边/null 清除。 */
function checkBorderSpec(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (value === null) return;
  if (isRecord(value)) {
    checkBorder(ctx, value, file, ypath);
    return;
  }
  if (Array.isArray(value) && (value.length === 2 || value.length === 4)) {
    value.forEach((side, i) => {
      if (side === null) return;
      if (isRecord(side)) checkBorder(ctx, side, file, `${ypath}[${i}]`);
      else report(ctx, "PPTD-E013", file, `${ypath}[${i}]`, "BorderSpec 数组元素必须是 border 对象或 null");
    });
    return;
  }
  report(ctx, "PPTD-E013", file, ypath, "BorderSpec 必须是 border/null/[top-bottom,left-right]/[top,right,bottom,left]");
}

function checkBounds(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isFiniteNumber)) {
    report(ctx, "PPTD-E006", file, ypath, "bounds 缺失或畸形（须为 [x, y, w, h] 数字四元组）");
    return;
  }
  const [x, y, w, h] = value as [number, number, number, number];
  if (w <= 0 || h <= 0) {
    report(ctx, "PPTD-E006", file, ypath, "bounds 宽高必须为正数");
    return;
  }
  if (ctx.canvas && (x < 0 || y < 0 || x + w > ctx.canvas.width || y + h > ctx.canvas.height)) {
    report(ctx, "PPTD-E006", file, ypath, `bounds [${value.join(", ")}] 越出画布 ${ctx.canvas.width}×${ctx.canvas.height}`);
  }
}

/** 文本级公共字段（content 内联字段 / theme.textStyles / cell 内联字段共用）。 */
function checkTextStyleFields(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.fontSize !== undefined && (!isFiniteNumber(value.fontSize) || value.fontSize <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.fontSize`, "fontSize 必须是正数");
  }
  if (value.lineHeight !== undefined && !isValidLineHeightRatio(value.lineHeight)) {
    report(ctx, "PPTD-E013", file, `${ypath}.lineHeight`, "lineHeight 必须是 (0, 100] 倍数");
  }
  if (value.lineHeightPx !== undefined && !isValidLineHeightPx(value.lineHeightPx)) {
    report(ctx, "PPTD-E013", file, `${ypath}.lineHeightPx`, "lineHeightPx 必须是正数（px）");
  }
  if (value.letterSpacing !== undefined && (!isFiniteNumber(value.letterSpacing) || Math.abs(value.letterSpacing) > 1000)) {
    report(ctx, "PPTD-E013", file, `${ypath}.letterSpacing`, "letterSpacing 必须是 ±1000 内的数字（px）");
  }
  if (value.marginTop !== undefined && !isFiniteNumber(value.marginTop)) {
    report(ctx, "PPTD-E013", file, `${ypath}.marginTop`, "marginTop 必须是数字（px）");
  }
  if (value.bold !== undefined && typeof value.bold !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.bold`, "bold 必须是布尔值");
  }
  if (value.italic !== undefined && typeof value.italic !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.italic`, "italic 必须是布尔值");
  }
  if (value.backgroundColor !== undefined) checkColor(ctx, value.backgroundColor, file, `${ypath}.backgroundColor`);
  if (value.fontFamily !== undefined) checkFontFamily(ctx, value.fontFamily, file, `${ypath}.fontFamily`);
}

/** 富文本 AST 语义值核对（语法已由 richtext.ts 判定）：run 颜色 / 字体登记。 */
function checkRichTextAst(ctx: Ctx, paragraphs: BentoTextParagraphV4[], file: string, ypath: string): void {
  for (const [pi, para] of paragraphs.entries()) {
    const paragraphPath = `${ypath}#p${pi}`;
    if (para.lineHeight !== undefined && !isValidLineHeightValue(para.lineHeight)) {
      report(ctx, "PPTD-E013", file, `${paragraphPath}.lineHeight`, "paragraph lineHeight 必须是正倍数 ≤100 或正 px");
    }
    const listLineHeight = para.list?.style?.lineHeight;
    if (listLineHeight !== undefined && !isValidLineHeightValue(listLineHeight)) {
      report(ctx, "PPTD-E013", file, `${paragraphPath}.list.style.lineHeight`, "list lineHeight 必须是正倍数 ≤100 或正 px");
    }
    for (const [ri, run] of para.runs.entries()) {
      const rp = `${ypath}#p${pi}r${ri}`;
      if (run.color !== undefined) checkColor(ctx, run.color, file, `${rp}.color`);
      if (run.backgroundColor !== undefined) checkColor(ctx, run.backgroundColor, file, `${rp}.backgroundColor`);
      if (run.fontFamily !== undefined) checkFontFamily(ctx, run.fontFamily, file, `${rp}.fontFamily`);
      if (run.latex !== undefined) {
        const latexError = staticV1LatexSyntaxError(run.latex);
        if (latexError !== null) report(ctx, "PPTD-E013", file, `${rp}.latex`, `latex 非法：${latexError}`);
      }
    }
  }
}

function checkTextContent(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "text content 必填且为对象");
    return;
  }
  checkUnknownFields(ctx, value, TEXT_CONTENT_FIELDS, file, ypath);
  if (typeof value.text !== "string") {
    report(ctx, "PPTD-E001", file, `${ypath}.text`, "content.text 必填且为字符串");
  } else {
    const parsed = parseRichText(value.text);
    if (!parsed.ok) {
      report(ctx, "PPTD-E013", file, `${ypath}.text`, `富文本语法非法：${parsed.reason}`);
    } else {
      checkRichTextAst(ctx, parsed.paragraphs, file, `${ypath}.text`);
    }
  }
  if (value.style !== undefined) {
    if (typeof value.style !== "string" || !value.style.startsWith("$")) {
      report(ctx, "PPTD-E001", file, `${ypath}.style`, "content.style 必须是 \"$key\" 形式引用");
    } else if (!ctx.themeTextStyles.has(value.style.slice(1))) {
      report(ctx, "PPTD-E008", file, `${ypath}.style`, `$ textStyle 引用 "${value.style}" 在 theme.textStyles 中不存在`);
    }
  }
  if (value.color !== undefined) checkColor(ctx, value.color, file, `${ypath}.color`);
  checkTextStyleFields(ctx, value, file, ypath);
  if (value.lineHeight !== undefined && value.lineHeightPx !== undefined) {
    // text.lineHeight/lineHeightPx 行：互斥（pptd.md §1 全节规则）。
    report(ctx, "PPTD-E013", file, ypath, "lineHeight 与 lineHeightPx 互斥（lineHeightPx 优先语义由 C1 承载）");
  }
  if (value.textDirection !== undefined && (typeof value.textDirection !== "string" || !TEXT_DIRECTIONS.has(value.textDirection))) {
    report(ctx, "PPTD-E013", file, `${ypath}.textDirection`, "textDirection 必须是 horizontal/vertical");
  }
  if (value.wrap !== undefined && typeof value.wrap !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.wrap`, "wrap 必须是布尔值");
  }
  if (value.align !== undefined) {
    if (!isAlignment(value.align)) {
      report(ctx, "PPTD-E013", file, `${ypath}.align`, "align 必须是 [水平, 垂直] 合法枚举对");
    }
  }
  if (value.gradient !== undefined) {
    // text.gradient 行：GradientFill（linear/radial），不含 image。
    if (isRecord(value.gradient) && value.gradient.type === "image") {
      report(ctx, "PPTD-E013", file, `${ypath}.gradient`, "text gradient 不支持 image fill");
    } else {
      checkFill(ctx, value.gradient, file, `${ypath}.gradient`);
    }
  }
  if (value.shadow !== undefined) checkShadow(ctx, value.shadow, file, `${ypath}.shadow`);
}

function isAlignment(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    H_ALIGNS.has(value[0]) &&
    V_ALIGNS.has(value[1])
  );
}

/** ShapeDef：host-specific vocabulary + custom 须带 viewBox/path（E014）。 */
function checkShapeDef(
  ctx: Ctx,
  value: unknown,
  file: string,
  ypath: string,
  vocabulary: "shape" | "crop",
): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "ShapeDef 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, new Set(["shapeName", "adjustments", "viewBox", "path"]), file, ypath);
  if (typeof value.shapeName !== "string" || value.shapeName.length === 0) {
    report(ctx, "PPTD-E001", file, `${ypath}.shapeName`, "ShapeDef.shapeName 必填且为非空字符串");
    return;
  }
  const modeled = vocabulary === "crop"
    ? isStaticV1CropShape(value.shapeName)
    : isStaticV1ShapeName(value.shapeName);
  if (!modeled) {
    const admitted = vocabulary === "crop"
      ? "rect/roundRect/ellipse/oval/triangle/custom"
      : "rect/roundRect/ellipse/oval/triangle/arrow/custom";
    report(
      ctx,
      "PPTD-E013",
      file,
      `${ypath}.shapeName`,
      `shapeName "${value.shapeName}" 不在 ${vocabulary} modeled 词表（${admitted}）`,
    );
    return;
  }
  const adjustmentError = staticV1ShapeAdjustmentsError(
    value.shapeName as Parameters<typeof staticV1ShapeAdjustmentsError>[0],
    value.adjustments as readonly number[] | undefined,
  );
  if (adjustmentError !== null) report(ctx, "PPTD-E013", file, `${ypath}.adjustments`, adjustmentError);
  if (value.shapeName === "custom") {
    const vbOk = isStaticV1ViewBox(value.viewBox);
    if (!vbOk) {
      report(ctx, "PPTD-E014", file, `${ypath}.viewBox`, "custom 形状必须带 [w, h] viewBox");
    }
    if (typeof value.path !== "string") {
      report(ctx, "PPTD-E014", file, `${ypath}.path`, "custom 形状必须带 path");
    } else {
      const syntax = staticV1SvgPathSyntaxError(value.path);
      if (syntax !== null) {
        report(ctx, "PPTD-E014", file, `${ypath}.path`, `path 语法非法：${syntax}`);
      }
    }
    return;
  }
  // stricter reading（shape.customPath/image.cropShape 行）：viewBox/path 仅 custom 承载，
  // 非 custom 出现即拒绝（canonical 会构成静默丢弃）。
  if (value.viewBox !== undefined || value.path !== undefined) {
    report(ctx, "PPTD-E013", file, ypath, "viewBox/path 仅 shapeName=\"custom\" 时允许（canonical 不承载惰性字段）");
  }
}

// ---- 元素 ----

function checkElement(ctx: Ctx, rec: Raw, file: string, ypath: string, seenIds: Set<string>): void {
  const type = rec.elementType;
  if (typeof type !== "string") {
    report(ctx, "PPTD-E001", file, `${ypath}.elementType`, "elementType 必填且为字符串");
    return;
  }
  if (!ELEMENT_TYPES_SET.has(type)) {
    if (FORBIDDEN_ELEMENT_TYPES.has(type.toLowerCase())) {
      report(ctx, "PPTD-E004", file, `${ypath}.elementType`, `elementType "${type}" 属于 script/iframe/音视频类，hard reject`);
    } else {
      report(ctx, "PPTD-E003", file, `${ypath}.elementType`, `elementType "${type}" 不在 v4 词表（common.elementType 行 7 型）`);
    }
    return;
  }
  const kindFields =
    type === "text"
      ? TEXT_FIELDS
      : type === "shape"
        ? SHAPE_FIELDS
        : type === "line"
          ? LINE_FIELDS
          : type === "image"
            ? IMAGE_FIELDS
            : type === "table"
              ? TABLE_FIELDS
              : type === "chart"
                ? CHART_FIELDS
                : ICON_FIELDS;
  checkUnknownFields(ctx, rec, new Set([...ELEMENT_BASE_FIELDS, ...kindFields]), file, ypath);

  // common.rotation/flip 行：宿主集 = text/shape/line/image/icon；table/chart 出现即 E013。
  if ((type === "table" || type === "chart") && (rec.rotation !== undefined || rec.flip !== undefined)) {
    report(ctx, "PPTD-E013", file, ypath, `rotation/flip 不支持 table/chart 宿主（common.rotation/flip 行宿主集）`);
  }
  if (rec.rotation !== undefined && !isFiniteNumber(rec.rotation)) {
    report(ctx, "PPTD-E013", file, `${ypath}.rotation`, "rotation 必须是有限数字（度，顺时针）");
  }
  if (
    rec.flip !== undefined &&
    (!Array.isArray(rec.flip) || rec.flip.length !== 2 || rec.flip.some((f) => typeof f !== "boolean"))
  ) {
    report(ctx, "PPTD-E013", file, `${ypath}.flip`, "flip 必须是 [水平, 垂直] 布尔对");
  }

  // common.elementId 行：重复/缺失 → E014。
  if (typeof rec.elementId !== "string" || rec.elementId.length === 0) {
    report(ctx, "PPTD-E014", file, `${ypath}.elementId`, "elementId 必填且为非空字符串");
  } else if (seenIds.has(rec.elementId)) {
    report(ctx, "PPTD-E014", file, `${ypath}.elementId`, `elementId "${rec.elementId}" 页面内重复`);
  } else {
    seenIds.add(rec.elementId);
  }
  checkBounds(ctx, rec.bounds, file, `${ypath}.bounds`);
  if (rec.opacity !== undefined) checkOpacityValue(ctx, rec.opacity, file, `${ypath}.opacity`);

  switch (type) {
    case "text":
      checkTextContent(ctx, rec.content, file, `${ypath}.content`);
      break;
    case "shape": {
      if (typeof rec.shapeName !== "string" || rec.shapeName.length === 0) {
        report(ctx, "PPTD-E001", file, `${ypath}.shapeName`, "shapeName 必填且为非空字符串");
      } else if (!isStaticV1ShapeName(rec.shapeName)) {
        report(
          ctx,
          "PPTD-E013",
          file,
          `${ypath}.shapeName`,
          `shapeName "${rec.shapeName}" 不在 static-v1 modeled 词表（rect/roundRect/ellipse/oval/triangle/arrow/custom）`,
        );
      } else if (rec.shapeName === "custom") {
        const vbOk = isStaticV1ViewBox(rec.viewBox);
        if (!vbOk) {
          report(ctx, "PPTD-E014", file, `${ypath}.viewBox`, "custom 形状必须带 [w, h] viewBox");
        }
        if (typeof rec.path !== "string") {
          report(ctx, "PPTD-E014", file, `${ypath}.path`, "custom 形状必须带 path");
        } else {
          const syntax = staticV1SvgPathSyntaxError(rec.path);
          if (syntax !== null) {
            report(ctx, "PPTD-E014", file, `${ypath}.path`, `path 语法非法：${syntax}`);
          }
        }
      } else if (rec.viewBox !== undefined || rec.path !== undefined) {
        report(ctx, "PPTD-E013", file, ypath, "viewBox/path 仅 shapeName=\"custom\" 时允许（shape.customPath 行）");
      }
      if (isStaticV1ShapeName(rec.shapeName)) {
        const adjustmentError = staticV1ShapeAdjustmentsError(
          rec.shapeName,
          rec.adjustments as readonly number[] | undefined,
        );
        if (adjustmentError !== null) report(ctx, "PPTD-E013", file, `${ypath}.adjustments`, adjustmentError);
      }
      if (rec.fill !== undefined) checkFill(ctx, rec.fill, file, `${ypath}.fill`);
      if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
      if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
      break;
    }
    case "line": {
      const vb = rec.viewBox;
      const vbOk = isStaticV1ViewBox(vb);
      if (!vbOk) {
        report(ctx, "PPTD-E001", file, `${ypath}.viewBox`, "viewBox 必填且为正数 [w, h] 数字对");
      }
      if (typeof rec.points !== "string") {
        report(ctx, "PPTD-E014", file, `${ypath}.points`, "points 必填且为 bezier 路径点字符串");
      } else {
        const pts = rec.points.trim().split(/\s+/);
        const valid =
          pts.length >= 2 &&
          pts.every(
            (point) => {
              const comma = point.indexOf(",");
              if (comma <= 0 || comma === point.length - 1 || point.indexOf(",", comma + 1) !== -1) return false;
              const rawX = point.slice(0, comma);
              const rawY = point.slice(comma + 1);
              if (!LINE_COORD_RE.test(rawX) || !LINE_COORD_RE.test(rawY)) return false;
              const x = Number(rawX);
              const y = Number(rawY);
              return Number.isFinite(x) && Number.isFinite(y) &&
                (!vbOk || (x >= 0 && x <= vb[0] && y >= 0 && y <= vb[1]));
            },
          );
        // line.points 行 failureCode：E014（<2 点/坐标越 viewBox/串格式非法）。
        if (!valid) {
          report(ctx, "PPTD-E014", file, `${ypath}.points`, "points 至少 2 个 \"x,y\" 点且坐标在 viewBox 内");
        }
      }
      if (rec.curve !== undefined && (typeof rec.curve !== "string" || !CURVE_MODES.has(rec.curve))) {
        report(ctx, "PPTD-E013", file, `${ypath}.curve`, "curve 必须是 sharp/round/smooth");
      }
      if (rec.arrow !== undefined) {
        const ok =
          Array.isArray(rec.arrow) &&
          rec.arrow.length === 2 &&
          rec.arrow.every((a) => a === null || (typeof a === "string" && ARROWHEADS.has(a)));
        if (!ok) {
          report(ctx, "PPTD-E013", file, `${ypath}.arrow`, "arrow 必须是 [起, 终]，每端 null 或 arrow/stealth/diamond/oval");
        }
      }
      if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
      if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
      break;
    }
    case "image": {
      checkMediaPath(ctx, rec.src, file, `${ypath}.src`);
      if (rec.fit !== undefined) {
        if (!isRecord(rec.fit)) {
          report(ctx, "PPTD-E001", file, `${ypath}.fit`, "fit 必须是对象");
        } else {
          checkUnknownFields(ctx, rec.fit, IMAGE_FIT_FIELDS, file, `${ypath}.fit`);
          if (typeof rec.fit.mode !== "string" || !FIT_MODES.has(rec.fit.mode)) {
            report(ctx, "PPTD-E013", file, `${ypath}.fit.mode`, `fit.mode "${String(rec.fit.mode)}" 不在词表（fill/contain/cover；image.fit 行）`);
          }
        }
      }
      if (rec.crop !== undefined) checkImageCrop(ctx, rec.crop, file, `${ypath}.crop`);
      if (rec.cropShape !== undefined) checkShapeDef(ctx, rec.cropShape, file, `${ypath}.cropShape`, "crop");
      if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
      if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
      break;
    }
    case "icon": {
      try {
        resolveStaticV1IconMembership(rec.iconName);
      } catch (error) {
        report(
          ctx,
          "PPTD-E013",
          file,
          `${ypath}.iconName`,
          error instanceof Error ? error.message : "iconName 不在 static-v1 词表",
        );
      }
      if (rec.fill !== undefined) checkFill(ctx, rec.fill, file, `${ypath}.fill`);
      if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
      if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
      break;
    }
    case "table":
      checkTable(ctx, rec, file, ypath);
      break;
    case "chart":
      checkChart(ctx, rec, file, ypath);
      break;
  }
}

// ---- table（table.* 行） ----

/** 列/行比例数组：[0,1] 内数字、长度 ≥ 1、和为 1（table.grid 行 → E009）。 */
function checkRatios(ctx: Ctx, value: unknown, file: string, ypath: string): boolean {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => isFiniteNumber(v) && v >= 0 && v <= 1)) {
    report(ctx, "PPTD-E009", file, ypath, "必须是 [0,1] 内数字组成的非空数组");
    return false;
  }
  const sum = (value as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    report(ctx, "PPTD-E009", file, ypath, `各项和必须为 1，实际 ${sum}`);
    return false;
  }
  return true;
}

function checkTable(ctx: Ctx, rec: Raw, file: string, ypath: string): void {
  const widthsOk = rec.columnWidths !== undefined && checkRatios(ctx, rec.columnWidths, file, `${ypath}.columnWidths`);
  const heightsOk = rec.rowHeights !== undefined && checkRatios(ctx, rec.rowHeights, file, `${ypath}.rowHeights`);
  const rowsOk = Array.isArray(rec.rows) && rec.rows.every((row) => Array.isArray(row));
  if (!rowsOk) {
    report(ctx, "PPTD-E009", file, `${ypath}.rows`, "table rows 必填且为 Cell[][] 二维数组");
  } else if (heightsOk && (rec.rows as unknown[]).length !== (rec.rowHeights as unknown[]).length) {
    report(
      ctx,
      "PPTD-E009",
      file,
      `${ypath}.rows`,
      `rows 行数 ${(rec.rows as unknown[]).length} ≠ rowHeights 长度 ${(rec.rowHeights as unknown[]).length}`,
    );
  }
  if (rec.style !== undefined) {
    if (typeof rec.style === "string") {
      if (!rec.style.startsWith("$")) {
        report(ctx, "PPTD-E001", file, `${ypath}.style`, "table.style 字符串形式必须是 \"$key\" 引用");
      } else if (!ctx.themeTableStyles.has(rec.style.slice(1))) {
        report(ctx, "PPTD-E008", file, `${ypath}.style`, `$ tableStyle 引用 "${rec.style}" 在 theme.tableStyles 中不存在`);
      }
    } else if (isRecord(rec.style)) {
      checkTableStyleConfig(ctx, rec.style, file, `${ypath}.style`);
    } else {
      report(ctx, "PPTD-E001", file, `${ypath}.style`, "table.style 必须是 \"$key\" 引用或内联 TableStyleConfig");
    }
  }
  if (rec.fill !== undefined) checkFill(ctx, rec.fill, file, `${ypath}.fill`);
  if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
  if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
  if (!rowsOk || !widthsOk || !heightsOk) return;

  const rows = rec.rows as Raw[][];
  const nRows = rows.length;
  const cols = (rec.columnWidths as unknown[]).length;

  for (const [r, row] of rows.entries()) {
    for (const [ci, cell] of row.entries()) {
      const cp = `${ypath}.rows[${r}][${ci}]`;
      if (!isRecord(cell)) {
        report(ctx, "PPTD-E009", file, cp, "table cell 必须是对象");
        continue;
      }
      checkUnknownFields(ctx, cell, TABLE_CELL_FIELDS, file, cp);
      if (cell.text !== undefined) {
        if (typeof cell.text !== "string") {
          report(ctx, "PPTD-E001", file, `${cp}.text`, "cell.text 必须是字符串（富文本）");
        } else {
          const parsed = parseRichText(cell.text);
          if (!parsed.ok) {
            report(ctx, "PPTD-E013", file, `${cp}.text`, `富文本语法非法：${parsed.reason}`);
          } else {
            checkRichTextAst(ctx, parsed.paragraphs, file, `${cp}.text`);
          }
        }
      }
      if (cell.textStyle !== undefined) {
        if (typeof cell.textStyle !== "string" || !cell.textStyle.startsWith("$")) {
          report(ctx, "PPTD-E001", file, `${cp}.textStyle`, "cell.textStyle 必须是 \"$key\" 形式引用");
        } else if (!ctx.themeTextStyles.has(cell.textStyle.slice(1))) {
          report(ctx, "PPTD-E008", file, `${cp}.textStyle`, `$ textStyle 引用 "${cell.textStyle}" 在 theme.textStyles 中不存在`);
        }
      }
      checkCellStyleTextFields(ctx, cell, file, cp);
      if (cell.fill !== undefined) checkFill(ctx, cell.fill, file, `${cp}.fill`);
      if (cell.border !== undefined) checkBorderSpec(ctx, cell.border, file, `${cp}.border`);
      if (cell.align !== undefined && !isAlignment(cell.align)) {
        report(ctx, "PPTD-E013", file, `${cp}.align`, "align 必须是 [水平, 垂直] 合法枚举对");
      }
      if (cell.rowSpan !== undefined && !isPositiveInt(cell.rowSpan)) {
        report(ctx, "PPTD-E013", file, `${cp}.rowSpan`, "rowSpan 必须是正整数");
      }
      if (cell.colSpan !== undefined && !isPositiveInt(cell.colSpan)) {
        report(ctx, "PPTD-E013", file, `${cp}.colSpan`, "colSpan 必须是正整数");
      }
    }
  }
  checkTableMergeExpansion(ctx, rows, nRows, cols, file, ypath);
}

/** cell 内联文本字段（table.cellTextProps 行；与 content 级字段同 E013 口径）。 */
function checkCellStyleTextFields(ctx: Ctx, cell: Raw, file: string, ypath: string): void {
  const fields: Raw = {};
  for (const key of TEXT_STYLE_FIELDS) {
    if (cell[key] !== undefined) fields[key] = cell[key];
  }
  checkTextStyleFields(ctx, fields, file, ypath);
  if (cell.lineHeight !== undefined && cell.lineHeightPx !== undefined) {
    report(ctx, "PPTD-E013", file, ypath, "lineHeight 与 lineHeightPx 互斥");
  }
}

/** merge 展开（table.merge 行 → E014）：越界/重叠/覆盖不全。 */
function checkTableMergeExpansion(ctx: Ctx, rows: Raw[][], nRows: number, cols: number, file: string, ypath: string): void {
  const occupied: boolean[][] = Array.from({ length: nRows }, () => Array<boolean>(cols).fill(false));
  rows.forEach((row, r) => {
    let c = 0;
    for (const [ci, cell] of row.entries()) {
      const cp = `${ypath}.rows[${r}][${ci}]`;
      if (!isRecord(cell)) {
        c += 1;
        continue;
      }
      const rs = isPositiveInt(cell.rowSpan) ? cell.rowSpan : 1;
      const cs = isPositiveInt(cell.colSpan) ? cell.colSpan : 1;
      while (c < cols && occupied[r]![c]!) c += 1;
      if (c + cs > cols || r + rs > nRows) {
        report(ctx, "PPTD-E014", file, cp, `合并区 (${r},${c}) ${rs}×${cs} 越出 ${nRows}×${cols} grid`);
      }
      let overlap = false;
      for (let rr = r; rr < Math.min(r + rs, nRows); rr += 1) {
        for (let cc = c; cc < Math.min(c + cs, cols); cc += 1) {
          if (occupied[rr]![cc]!) overlap = true;
          else occupied[rr]![cc] = true;
        }
      }
      if (overlap) {
        report(ctx, "PPTD-E014", file, cp, `合并区 (${r},${c}) ${rs}×${cs} 与既有合并区重叠`);
      }
      c += cs;
    }
  });
  const total = nRows * cols;
  const covered = occupied.flat().filter(Boolean).length;
  if (covered !== total) {
    report(ctx, "PPTD-E014", file, `${ypath}.rows`, `table merge 覆盖不全：${covered}/${total} 格被合并展开覆盖`);
  }
}

function checkTableStyleConfig(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  checkUnknownFields(ctx, value, TABLE_STYLE_FIELDS, file, ypath);
  for (const slot of ["cellStyle", "firstRowStyle", "lastRowStyle", "firstColumnStyle", "lastColumnStyle"] as const) {
    const slotValue = value[slot];
    if (slotValue === undefined) continue;
    if (!isRecord(slotValue)) {
      report(ctx, "PPTD-E001", file, `${ypath}.${slot}`, "CellStyle 必须是对象");
      continue;
    }
    checkCellStyle(ctx, slotValue, file, `${ypath}.${slot}`);
  }
  if (value.bodyStyles !== undefined) {
    if (!Array.isArray(value.bodyStyles)) {
      report(ctx, "PPTD-E001", file, `${ypath}.bodyStyles`, "bodyStyles 必须是 CellStyle 数组");
    } else {
      value.bodyStyles.forEach((style, i) => {
        if (isRecord(style)) checkCellStyle(ctx, style, file, `${ypath}.bodyStyles[${i}]`);
        else report(ctx, "PPTD-E001", file, `${ypath}.bodyStyles[${i}]`, "CellStyle 必须是对象");
      });
    }
  }
  if (value.rowOverColumn !== undefined && typeof value.rowOverColumn !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.rowOverColumn`, "rowOverColumn 必须是布尔值");
  }
}

function checkCellStyle(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  checkUnknownFields(ctx, value, CELL_STYLE_FIELDS, file, ypath);
  checkCellStyleTextFields(ctx, value, file, ypath);
  if (value.fill !== undefined) checkFill(ctx, value.fill, file, `${ypath}.fill`);
  if (value.border !== undefined) checkBorderSpec(ctx, value.border, file, `${ypath}.border`);
  if (value.align !== undefined && !isAlignment(value.align)) {
    report(ctx, "PPTD-E013", file, `${ypath}.align`, "align 必须是 [水平, 垂直] 合法枚举对");
  }
}

// ---- chart（chart.* 行） ----

function checkChart(ctx: Ctx, rec: Raw, file: string, ypath: string): void {
  // The only boolean data channel in PPTD v2 is waterfall.encode.isTotal.
  // Keep the rectangular data check closed for every other chart type; a
  // generic boolean allowance would make ordinary numeric/category channels
  // silently acquire a new vocabulary.
  const booleanColumns = new Set<string>();
  if (Array.isArray(rec.series)) {
    for (const series of rec.series) {
      if (isRecord(series) && series.type === "waterfall" && isRecord(series.encode) && typeof series.encode.isTotal === "string") {
        booleanColumns.add(series.encode.isTotal);
      }
    }
  }
  checkChartData(ctx, rec.data, file, `${ypath}.data`, booleanColumns);

  if (!Array.isArray(rec.series)) {
    report(ctx, "PPTD-E001", file, `${ypath}.series`, "series 必填且为数组");
  } else {
    if (rec.series.length === 0) {
      report(ctx, "PPTD-E014", file, `${ypath}.series`, "series 长度必须 ≥ 1");
    }
    rec.series.forEach((series, i) => {
      checkChartSeries(ctx, series, file, `${ypath}.series[${i}]`);
    });
    checkWaterfallBooleanColumnRoles(ctx, rec, file, ypath);
    checkChartTypeMixing(ctx, rec.series, file, `${ypath}.series`);
  }

  if (rec.seriesDefaults !== undefined) {
    if (!isRecord(rec.seriesDefaults)) {
      report(ctx, "PPTD-E001", file, `${ypath}.seriesDefaults`, "seriesDefaults 必须是对象");
    } else {
      for (const [type, defaults] of Object.entries(rec.seriesDefaults)) {
        // chart.seriesDefaults 行 failureCode：未知 type → E013。
        if (!CHART_SERIES_DEFAULT_TYPES.has(type)) {
          report(ctx, "PPTD-E013", file, `${ypath}.seriesDefaults.${type}`, `seriesDefaults type "${type}" 不在词表（仅多 series 类型）`);
          continue;
        }
        if (!isRecord(defaults)) {
          report(ctx, "PPTD-E001", file, `${ypath}.seriesDefaults.${type}`, "defaults 必须是对象");
          continue;
        }
        checkUnknownFields(ctx, defaults, CHART_SERIES_DEFAULT_FIELDS(type), file, `${ypath}.seriesDefaults.${type}`);
        checkChartSeriesBody(ctx, type, defaults, file, `${ypath}.seriesDefaults.${type}`);
      }
    }
  }

  for (const axisKey of ["xAxis", "yAxis"] as const) {
    const axis = rec[axisKey];
    if (axis === undefined) continue;
    if (Array.isArray(axis)) {
      // chart.axisSecondary 行：副 x 轴不承诺；y 副轴仅 1 根（数组长度 ≤ 2）。
      if (axisKey === "xAxis") {
        report(ctx, "PPTD-E013", file, `${ypath}.${axisKey}`, "xAxis 数组（副 x 轴）不在 v1 承诺（chart.axisSecondary 行）");
      } else if (axis.length > 2) {
        report(ctx, "PPTD-E013", file, `${ypath}.${axisKey}`, "yAxis 数组长度 ≤ 2（chart.axisSecondary 行）");
      }
      axis.forEach((a, i) => checkChartAxis(ctx, a, file, `${ypath}.${axisKey}[${i}]`));
    } else if (isRecord(axis)) {
      checkChartAxis(ctx, axis, file, `${ypath}.${axisKey}`);
    } else {
      report(ctx, "PPTD-E001", file, `${ypath}.${axisKey}`, "axis 必须是对象或对象数组");
    }
  }

  if (rec.barWidth !== undefined && (!isFiniteNumber(rec.barWidth) || rec.barWidth <= 0 || rec.barWidth > 1)) {
    report(ctx, "PPTD-E013", file, `${ypath}.barWidth`, "barWidth 必须是 (0, 1] 数字（占类目槽宽比例）");
  }
  if (rec.barGap !== undefined && (!isFiniteNumber(rec.barGap) || rec.barGap < 0 || rec.barGap >= 1)) {
    report(ctx, "PPTD-E013", file, `${ypath}.barGap`, "barGap 必须是 [0, 1) 数字");
  }
  if (rec.categoryGap !== undefined && (!isFiniteNumber(rec.categoryGap) || rec.categoryGap < 0 || rec.categoryGap >= 1)) {
    report(ctx, "PPTD-E013", file, `${ypath}.categoryGap`, "categoryGap 必须是 [0, 1) 数字");
  }
  if (rec.spokeAxis !== undefined) {
    if (!isRecord(rec.spokeAxis)) {
      report(ctx, "PPTD-E001", file, `${ypath}.spokeAxis`, "spokeAxis 必须是对象");
    } else {
      checkUnknownFields(ctx, rec.spokeAxis, CHART_SPOKE_FIELDS, file, `${ypath}.spokeAxis`);
      checkChartSpokeBody(ctx, rec.spokeAxis, file, `${ypath}.spokeAxis`);
    }
  }
  if (rec.title !== undefined) {
    if (typeof rec.title === "string") {
      // string 形态合法。
    } else if (isRecord(rec.title)) {
      checkUnknownFields(ctx, rec.title, CHART_TITLE_FIELDS, file, `${ypath}.title`);
      if (typeof rec.title.text !== "string") {
        report(ctx, "PPTD-E001", file, `${ypath}.title.text`, "title.text 必填且为字符串");
      }
      checkChartTextStyle(ctx, rec.title, file, `${ypath}.title`);
    } else {
      report(ctx, "PPTD-E001", file, `${ypath}.title`, "title 必须是字符串或 TitleConfig");
    }
  }
  if (rec.legend !== undefined) {
    if (typeof rec.legend === "boolean") {
      // boolean 形态合法。
    } else if (isRecord(rec.legend)) {
      checkUnknownFields(ctx, rec.legend, CHART_LEGEND_FIELDS, file, `${ypath}.legend`);
      if (rec.legend.show !== undefined && typeof rec.legend.show !== "boolean") {
        report(ctx, "PPTD-E013", file, `${ypath}.legend.show`, "legend.show 必须是布尔值");
      }
      if (rec.legend.position !== undefined && (typeof rec.legend.position !== "string" || !CHART_LEGEND_POSITIONS.has(rec.legend.position))) {
        report(ctx, "PPTD-E013", file, `${ypath}.legend.position`, "legend.position 必须是 top/bottom/left/right");
      }
      checkChartTextStyle(ctx, rec.legend, file, `${ypath}.legend`);
    } else {
      report(ctx, "PPTD-E001", file, `${ypath}.legend`, "legend 必须是布尔值或 LegendConfig");
    }
  }
  if (rec.dataLabels !== undefined) {
    if (!isRecord(rec.dataLabels)) {
      report(ctx, "PPTD-E001", file, `${ypath}.dataLabels`, "dataLabels 必须是对象");
    } else {
      checkUnknownFields(ctx, rec.dataLabels, CHART_DATA_LABEL_FIELDS, file, `${ypath}.dataLabels`);
      checkChartDataLabel(ctx, rec.dataLabels, file, `${ypath}.dataLabels`);
    }
  }
  if (rec.fontFamily !== undefined) checkFontFamily(ctx, rec.fontFamily, file, `${ypath}.fontFamily`);
  if (rec.fill !== undefined) checkFill(ctx, rec.fill, file, `${ypath}.fill`);
  if (rec.border !== undefined) checkBorder(ctx, rec.border, file, `${ypath}.border`);
  if (rec.shadow !== undefined) checkShadow(ctx, rec.shadow, file, `${ypath}.shadow`);
}

/**
 * A boolean data column has exactly one modeled observation in PPTD v2:
 * waterfall.encode.isTotal.  Reject a column reused by x/y/category/value or
 * any other series channel; otherwise a validator pass could make the same
 * bytes mean both a boolean total marker and a numeric/category value.
 */
function checkWaterfallBooleanColumnRoles(ctx: Ctx, chart: Raw, file: string, ypath: string): void {
  if (!Array.isArray(chart.series)) return;
  const totalColumns = new Set<string>();
  for (const series of chart.series) {
    if (!isRecord(series) || series.type !== "waterfall" || !isRecord(series.encode)) continue;
    const totalColumn = series.encode.isTotal;
    if (typeof totalColumn === "string" && totalColumn.length > 0) totalColumns.add(totalColumn);
  }
  if (totalColumns.size === 0) return;
  for (const [seriesIndex, series] of chart.series.entries()) {
    if (!isRecord(series) || !isRecord(series.encode)) continue;
    for (const [channel, column] of Object.entries(series.encode)) {
      if (channel === "isTotal" || typeof column !== "string" || !totalColumns.has(column)) continue;
      report(
        ctx,
        "PPTD-E014",
        file,
        `${ypath}.series[${seriesIndex}].encode.${channel}`,
        `布尔 isTotal 列 "${column}" 不能复用 ${channel} 通道（仅允许 waterfall.encode.isTotal）`,
      );
    }
  }
}

/** chart.data 行五类完整性（E014）：DuplicateColumn/EmptyColumn/RowLength。 */
function checkChartData(ctx: Ctx, value: unknown, file: string, ypath: string, booleanColumns: ReadonlySet<string> = new Set()): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "chart data 必填且为对象");
    return;
  }
  checkUnknownFields(ctx, value, CHART_DATA_FIELDS, file, ypath);
  const cols = value.cols;
  if (!Array.isArray(cols) || cols.length === 0 || !cols.every((c) => typeof c === "string" && c.length > 0)) {
    report(ctx, "PPTD-E014", file, `${ypath}.cols`, "data.cols 必须是非空字符串的非空数组");
    return;
  }
  if (new Set(cols as string[]).size !== cols.length) {
    report(ctx, "PPTD-E014", file, `${ypath}.cols`, "data.cols 存在重复列名");
  }
  if (!Array.isArray(value.rows)) {
    report(ctx, "PPTD-E014", file, `${ypath}.rows`, "data.rows 必须是二维数组");
    return;
  }
  for (const [ri, row] of value.rows.entries()) {
    if (!Array.isArray(row) || row.length !== cols.length) {
      report(ctx, "PPTD-E014", file, `${ypath}.rows[${ri}]`, `行长度 ${Array.isArray(row) ? row.length : "非数组"} ≠ cols 长度 ${cols.length}`);
      continue;
    }
    for (const [ci, cell] of row.entries()) {
      // Waterfall's isTotal channel is an authored boolean column.  The
      // importer preserves it as "true"/"false" in canonical data.  Every
      // other channel stays number/string/null (fail closed).
      const booleanAllowed = typeof cell === "boolean" && booleanColumns.has(cols[ci] as string);
      if (!(cell === null || isFiniteNumber(cell) || typeof cell === "string" || booleanAllowed)) {
        report(ctx, "PPTD-E014", file, `${ypath}.rows[${ri}][${ci}]`, "数据格必须是 number/string/null");
      }
    }
  }
}

function checkChartSeries(ctx: Ctx, series: unknown, file: string, ypath: string): void {
  if (!isRecord(series)) {
    report(ctx, "PPTD-E001", file, ypath, "series 项必须是对象");
    return;
  }
  const type = series.type;
  if (typeof type !== "string" || !(CHART_SERIES_TYPES as readonly string[]).includes(type)) {
    report(ctx, "PPTD-E013", file, `${ypath}.type`, `series type "${String(type)}" 不在 13 型词表`);
    return;
  }
  checkUnknownFields(ctx, series, CHART_SERIES_FIELD_SETS[type]!, file, ypath);
  checkChartEncode(ctx, type, series.encode, file, `${ypath}.encode`);
  checkChartSeriesBody(ctx, type, series, file, ypath);
  // chart.axisSecondary 行：副 x 轴不承诺（xAxisIndex > 0 拒绝）；yAxisIndex 引用一致性在 mixing 后统一查。
  if (series.xAxisIndex !== undefined && (!isFiniteNumber(series.xAxisIndex) || series.xAxisIndex < 0 || !Number.isInteger(series.xAxisIndex))) {
    report(ctx, "PPTD-E013", file, `${ypath}.xAxisIndex`, "xAxisIndex 必须是非负整数");
  } else if (series.xAxisIndex !== undefined && (series.xAxisIndex as number) > 0) {
    report(ctx, "PPTD-E013", file, `${ypath}.xAxisIndex`, "副 x 轴（xAxisIndex > 0）不在 v1 承诺（chart.axisSecondary 行）");
  }
  if (series.yAxisIndex !== undefined && (!isFiniteNumber(series.yAxisIndex) || series.yAxisIndex < 0 || !Number.isInteger(series.yAxisIndex))) {
    report(ctx, "PPTD-E013", file, `${ypath}.yAxisIndex`, "yAxisIndex 必须是非负整数");
  }
}

/** encode 通道形态（E014）：必需通道齐全且为非空字符串；通道词表封闭。 */
function checkChartEncode(ctx: Ctx, type: string, encode: unknown, file: string, ypath: string): void {
  const required = CHART_ENCODE_REQUIRED[type]!;
  const optional = CHART_ENCODE_OPTIONAL[type] ?? [];
  if (!isRecord(encode)) {
    report(ctx, "PPTD-E014", file, ypath, `${type} encode 必须是对象（通道: 列名）`);
    return;
  }
  const allowed = new Set([...required, ...optional]);
  checkUnknownFields(ctx, encode, allowed, file, ypath);
  for (const channel of required) {
    const value = encode[channel];
    if (typeof value !== "string" || value.length === 0) {
      report(ctx, "PPTD-E014", file, `${ypath}.${channel}`, `${type} encode 缺必需通道 "${channel}"（非空字符串）`);
    }
  }
  for (const channel of optional) {
    const value = encode[channel];
    if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
      report(ctx, "PPTD-E014", file, `${ypath}.${channel}`, `encode 通道 "${channel}" 必须是非空字符串`);
    }
  }
}

/** series 逐类型字段的枚举/形态校验（defaults 与 series 共用；encode 由调用方处理）。 */
function checkChartSeriesBody(ctx: Ctx, type: string, body: Raw, file: string, ypath: string): void {
  const seriesFill = (value: unknown, sub: string, allowArray: false | 1 | 2 = false): void => {
    const okOne = (v: unknown): boolean => typeof v === "string" || (isRecord(v) && v.type === "gradient");
    const unsupportedDerivedFill = (v: unknown): boolean => {
      if (isRecord(v) && v.type === "gradient") return true;
      return Array.isArray(v) && v.some(unsupportedDerivedFill);
    };
    if (allowArray && Array.isArray(value)) {
      if (value.length === 0) {
        report(ctx, "PPTD-E013", file, sub, "series fill 数组元素必须是 Color/GradientFill（不支持 image）");
        return;
      }
      const oneDimensional = value.every(okOne);
      const twoDimensional = allowArray === 2 && value.every((v) =>
        Array.isArray(v) && v.length > 0 && v.every(okOne));
      if (!oneDimensional && !twoDimensional) {
        report(ctx, "PPTD-E013", file, sub, "series fill 必须是非空的一维 Color/GradientFill 数组，或（treemap）非空二维数组");
        return;
      }
      if ((type === "treemap" || type === "sunburst") && unsupportedDerivedFill(value)) {
        report(ctx, "PPTD-E013", file, sub, `${type} fill 只支持 solid 色（gradient 具名拒绝）`);
        return;
      }
      if (twoDimensional) {
        value.forEach((row, i) => (row as unknown[]).forEach((v, j) => checkFillValue(ctx, v, file, `${sub}[${i}][${j}]`)));
      } else {
        value.forEach((v, i) => checkFillValue(ctx, v, file, `${sub}[${i}]`));
      }
      return;
    }
    if (!okOne(value)) {
      report(ctx, "PPTD-E013", file, sub, "series fill 必须是 Color/GradientFill（pptd.md §5 通用规则：不支持 ImageFill）");
      return;
    }
    if ((type === "treemap" || type === "sunburst") && unsupportedDerivedFill(value)) {
      report(ctx, "PPTD-E013", file, sub, `${type} fill 只支持 solid 色（gradient 具名拒绝）`);
      return;
    }
    checkFillValue(ctx, value, file, sub);
  };

  switch (type) {
    case "bar":
      if (body.stack !== undefined && (typeof body.stack !== "string" || !["value", "percent"].includes(body.stack))) {
        report(ctx, "PPTD-E013", file, `${ypath}.stack`, "bar stack 必须是 value/percent");
      }
      if (body.symbol !== undefined) checkShapeDef(ctx, body.symbol, file, `${ypath}.symbol`, "shape");
      if (body.fill !== undefined) seriesFill(body.fill, `${ypath}.fill`);
      if (body.border !== undefined) checkBorder(ctx, body.border, file, `${ypath}.border`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "line":
    case "area":
    case "radar":
      checkLinearSeriesBody(ctx, body, file, ypath);
      if (type === "area") {
        if (body.stack !== undefined && (typeof body.stack !== "string" || !CHART_STACK_MODES.has(body.stack))) {
          report(ctx, "PPTD-E013", file, `${ypath}.stack`, "area stack 必须是 value/percent/stream");
        }
        if (body.areaColor !== undefined) seriesFill(body.areaColor, `${ypath}.areaColor`);
      }
      if (type === "radar" && body.areaColor !== undefined) seriesFill(body.areaColor, `${ypath}.areaColor`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "scatter":
    case "bubble":
      if (body.dataFilter !== undefined) {
        if (!isRecord(body.dataFilter)) {
          report(ctx, "PPTD-E001", file, `${ypath}.dataFilter`, "dataFilter 必须是对象");
        } else {
          checkUnknownFields(ctx, body.dataFilter, CHART_DATA_FILTER_FIELDS, file, `${ypath}.dataFilter`);
          if (typeof body.dataFilter.col !== "string" || body.dataFilter.col.length === 0) {
            report(ctx, "PPTD-E013", file, `${ypath}.dataFilter.col`, "dataFilter.col 必须是非空字符串");
          }
          if (body.dataFilter.value === undefined || !(typeof body.dataFilter.value === "string" || isFiniteNumber(body.dataFilter.value))) {
            report(ctx, "PPTD-E013", file, `${ypath}.dataFilter.value`, "dataFilter.value 必须是字符串或数字");
          }
        }
      }
      if (type === "scatter") {
        // 上游约束：scatter marker 不可为 false（无 marker 即无渲染对象）。
        if (body.marker === false) {
          report(ctx, "PPTD-E013", file, `${ypath}.marker`, "scatter marker 不可为 false");
        }
      }
      if (type === "bubble") {
        if (body.sizeScale !== undefined && (typeof body.sizeScale !== "string" || !CHART_SIZE_SCALES.has(body.sizeScale))) {
          report(ctx, "PPTD-E013", file, `${ypath}.sizeScale`, "sizeScale 必须是 linear/sqrt/log");
        }
        if (body.sizeRange !== undefined && (!Array.isArray(body.sizeRange) || body.sizeRange.length !== 2 || !body.sizeRange.every(isFiniteNumber))) {
          report(ctx, "PPTD-E013", file, `${ypath}.sizeRange`, "sizeRange 必须是 [min, max] 数字对");
        }
      }
      if (body.marker !== undefined && body.marker !== false) checkChartMarker(ctx, body.marker, file, `${ypath}.marker`);
      if (body.fill !== undefined) seriesFill(body.fill, `${ypath}.fill`);
      if (body.border !== undefined) checkBorder(ctx, body.border, file, `${ypath}.border`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "candlestick":
      if (body.upBars !== undefined) checkUpDownBars(ctx, body.upBars, file, `${ypath}.upBars`);
      if (body.downBars !== undefined) checkUpDownBars(ctx, body.downBars, file, `${ypath}.downBars`);
      if (body.wickStyle !== undefined) checkBorder(ctx, body.wickStyle, file, `${ypath}.wickStyle`);
      break;
    case "pie":
      if (body.innerRadius !== undefined && (!isFiniteNumber(body.innerRadius) || body.innerRadius < 0 || body.innerRadius > 1)) {
        report(ctx, "PPTD-E013", file, `${ypath}.innerRadius`, "innerRadius 必须是 [0, 1] 数字");
      }
      if (body.startAngle !== undefined && !isFiniteNumber(body.startAngle)) {
        report(ctx, "PPTD-E013", file, `${ypath}.startAngle`, "startAngle 必须是数字（度）");
      }
      if (body.fill !== undefined) seriesFill(body.fill, `${ypath}.fill`, 1);
      if (body.border !== undefined) checkBorder(ctx, body.border, file, `${ypath}.border`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "waterfall":
      for (const barsKey of ["totalBars", "increaseBars", "decreaseBars"] as const) {
        if (body[barsKey] !== undefined) checkUpDownBars(ctx, body[barsKey], file, `${ypath}.${barsKey}`);
      }
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "heatmap":
      if (body.colorScheme !== undefined && (!Array.isArray(body.colorScheme) || !body.colorScheme.every((c) => typeof c === "string"))) {
        report(ctx, "PPTD-E013", file, `${ypath}.colorScheme`, "colorScheme 必须是颜色字符串数组");
      } else if (Array.isArray(body.colorScheme)) {
        body.colorScheme.forEach((c, i) => checkColor(ctx, c, file, `${ypath}.colorScheme[${i}]`));
      }
      if (body.colorScale !== undefined) {
        if (!isRecord(body.colorScale)) {
          report(ctx, "PPTD-E001", file, `${ypath}.colorScale`, "colorScale 必须是对象");
        } else {
          checkUnknownFields(ctx, body.colorScale, CHART_COLOR_SCALE_FIELDS, file, `${ypath}.colorScale`);
          if (body.colorScale.type !== undefined && (typeof body.colorScale.type !== "string" || !CHART_COLOR_SCALE_TYPES.has(body.colorScale.type))) {
            report(ctx, "PPTD-E013", file, `${ypath}.colorScale.type`, "colorScale.type 必须是 linear/diverging");
          }
          if (
            body.colorScale.domain !== undefined &&
            (!Array.isArray(body.colorScale.domain) || body.colorScale.domain.length !== 2 || !body.colorScale.domain.every(isFiniteNumber))
          ) {
            report(ctx, "PPTD-E013", file, `${ypath}.colorScale.domain`, "colorScale.domain 必须是 [min, max] 数字对");
          }
        }
      }
      if (body.colorbar !== undefined && typeof body.colorbar !== "boolean") {
        if (!isRecord(body.colorbar)) {
          report(ctx, "PPTD-E001", file, `${ypath}.colorbar`, "colorbar 必须是布尔值或 LegendConfig");
        } else {
          checkUnknownFields(ctx, body.colorbar, CHART_LEGEND_FIELDS, file, `${ypath}.colorbar`);
          checkChartLegendBody(ctx, body.colorbar, file, `${ypath}.colorbar`);
        }
      }
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "treemap":
    case "sunburst":
      if (body.levels !== undefined && (!isFiniteNumber(body.levels) || body.levels < 1)) {
        report(ctx, "PPTD-E013", file, `${ypath}.levels`, "levels 必须是 ≥ 1 数字");
      }
      if (body.fill !== undefined) seriesFill(body.fill, `${ypath}.fill`, type === "treemap" ? 2 : 1);
      if (body.border !== undefined) checkBorder(ctx, body.border, file, `${ypath}.border`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
    case "sankey":
      if (body.nodeAlign !== undefined && (typeof body.nodeAlign !== "string" || !CHART_NODE_ALIGNS.has(body.nodeAlign))) {
        report(ctx, "PPTD-E013", file, `${ypath}.nodeAlign`, "nodeAlign 必须是 left/right/justify");
      }
      if (body.fill !== undefined) {
        if (isRecord(body.fill)) {
          // 按节点名映射形态
          for (const [k, v] of Object.entries(body.fill)) {
            checkFillValue(ctx, v, file, `${ypath}.fill.${k}`);
          }
        } else {
          seriesFill(body.fill, `${ypath}.fill`, 1);
        }
      }
      if (body.border !== undefined) checkBorder(ctx, body.border, file, `${ypath}.border`);
      if (body.dataLabels !== undefined) checkDataLabelAt(ctx, body.dataLabels, file, `${ypath}.dataLabels`);
      break;
  }
}

function checkLinearSeriesBody(ctx: Ctx, body: Raw, file: string, ypath: string): void {
  if (body.smooth !== undefined && typeof body.smooth !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.smooth`, "smooth 必须是布尔值");
  }
  if (body.lineStyle !== undefined && (typeof body.lineStyle !== "string" || !BORDER_STYLES.has(body.lineStyle))) {
    report(ctx, "PPTD-E013", file, `${ypath}.lineStyle`, "lineStyle 必须是 solid/dash/dot");
  }
  if (body.width !== undefined && (!isFiniteNumber(body.width) || body.width <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.width`, "width 必须是正数");
  }
  if (body.nullHandling !== undefined && (typeof body.nullHandling !== "string" || !CHART_NULL_HANDLING.has(body.nullHandling))) {
    report(ctx, "PPTD-E013", file, `${ypath}.nullHandling`, "nullHandling 必须是 zero/gap/connect");
  }
  if (body.marker !== undefined && body.marker !== false) checkChartMarker(ctx, body.marker, file, `${ypath}.marker`);
  if (body.lineColor !== undefined) {
    const ok = typeof body.lineColor === "string" || (isRecord(body.lineColor) && (body.lineColor.type === "solid" || body.lineColor.type === "gradient"));
    if (!ok) {
      report(ctx, "PPTD-E013", file, `${ypath}.lineColor`, "lineColor 必须是 Color/GradientFill（不支持 ImageFill）");
    } else {
      checkFillValue(ctx, body.lineColor, file, `${ypath}.lineColor`);
    }
  }
}

function checkChartMarker(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "marker 必须是 MarkerConfig 对象");
    return;
  }
  checkUnknownFields(ctx, value, CHART_MARKER_FIELDS, file, ypath);
  if (value.shape !== undefined && (typeof value.shape !== "string" || !CHART_MARKER_SHAPES.has(value.shape))) {
    report(ctx, "PPTD-E013", file, `${ypath}.shape`, "marker.shape 必须是 circle/rect/diamond/triangle");
  }
  if (value.fill !== undefined) {
    const ok = typeof value.fill === "string" || (isRecord(value.fill) && (value.fill.type === "solid" || value.fill.type === "gradient"));
    if (!ok) {
      report(ctx, "PPTD-E013", file, `${ypath}.fill`, "marker.fill 必须是 Color/GradientFill");
    } else {
      checkFillValue(ctx, value.fill, file, `${ypath}.fill`);
    }
  }
  if (value.border !== undefined) checkBorder(ctx, value.border, file, `${ypath}.border`);
  if (value.size !== undefined && (!isFiniteNumber(value.size) || value.size <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.size`, "marker.size 必须是正数（px）");
  }
}

function checkUpDownBars(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "bars 样式必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, CHART_UP_DOWN_BARS_FIELDS, file, ypath);
  if (value.fill !== undefined) checkColor(ctx, value.fill, file, `${ypath}.fill`);
  if (value.border !== undefined) checkBorder(ctx, value.border, file, `${ypath}.border`);
}

/** 单个 series fill 值（Color 串或 GradientFill 对象）的语义核对。 */
function checkFillValue(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (typeof value === "string") {
    checkColor(ctx, value, file, ypath);
    return;
  }
  if (isRecord(value) && value.type === "solid") {
    checkUnknownFields(ctx, value, SOLID_FILL_FIELDS, file, ypath);
    checkColor(ctx, value.color, file, `${ypath}.color`);
    return;
  }
  if (isRecord(value) && value.type === "gradient") {
    checkUnknownFields(ctx, value, GRADIENT_FILL_FIELDS, file, ypath);
    if (value.gradientType !== "linear" && value.gradientType !== "radial") {
      report(ctx, "PPTD-E013", file, `${ypath}.gradientType`, "gradientType 必须是 linear/radial");
    }
    if (value.angle !== undefined) {
      if (value.gradientType === "radial") {
        report(ctx, "PPTD-E013", file, `${ypath}.angle`, "radial gradient 不接受 angle（仅 linear 生效；canonical 不承载惰性字段）");
      } else if (!isFiniteNumber(value.angle) || value.angle < 0 || value.angle >= 360) {
        report(ctx, "PPTD-E013", file, `${ypath}.angle`, "gradient angle 必须是 [0, 360) 数字");
      }
    }
    if (!Array.isArray(value.stops) || value.stops.length < 2) {
      report(ctx, "PPTD-E013", file, `${ypath}.stops`, "gradient stops 至少 2 个");
    } else {
      value.stops.forEach((stop, i) => {
        if (isRecord(stop)) {
          checkUnknownFields(ctx, stop, COLOR_STOP_FIELDS, file, `${ypath}.stops[${i}]`);
          if (!isFiniteNumber(stop.position) || stop.position < 0 || stop.position > 1) {
            report(ctx, "PPTD-E013", file, `${ypath}.stops[${i}].position`, "stop position 必须是 [0, 1] 数字");
          }
          checkColor(ctx, stop.color, file, `${ypath}.stops[${i}].color`);
        } else {
          report(ctx, "PPTD-E001", file, `${ypath}.stops[${i}]`, "color stop 必须是对象");
        }
      });
    }
    return;
  }
  report(ctx, "PPTD-E013", file, ypath, "series fill 必须是 Color/GradientFill（不支持 ImageFill）");
}

function checkDataLabelAt(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "dataLabels 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, CHART_DATA_LABEL_FIELDS, file, ypath);
  checkChartDataLabel(ctx, value, file, ypath);
}

function checkChartDataLabel(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.show !== undefined && typeof value.show !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.show`, "dataLabels.show 必须是布尔值");
  }
  if (value.content !== undefined && (typeof value.content !== "string" || !DATA_LABEL_CONTENTS.has(value.content))) {
    report(ctx, "PPTD-E013", file, `${ypath}.content`, "dataLabels.content 必须是 value/percentage/category");
  }
  if (value.numberFormat !== undefined && typeof value.numberFormat !== "string") {
    report(ctx, "PPTD-E013", file, `${ypath}.numberFormat`, "numberFormat 必须是字符串");
  }
  checkChartTextStyle(ctx, value, file, ypath);
}

function checkChartTextStyle(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.color !== undefined) checkColor(ctx, value.color, file, `${ypath}.color`);
  if (value.fontSize !== undefined && (!isFiniteNumber(value.fontSize) || value.fontSize <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.fontSize`, "fontSize 必须是正数");
  }
  if (value.fontFamily !== undefined) checkFontFamily(ctx, value.fontFamily, file, `${ypath}.fontFamily`);
}

function checkChartLegendBody(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.show !== undefined && typeof value.show !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.show`, "legend.show 必须是布尔值");
  }
  if (value.position !== undefined && (typeof value.position !== "string" || !CHART_LEGEND_POSITIONS.has(value.position))) {
    report(ctx, "PPTD-E013", file, `${ypath}.position`, "legend.position 必须是 top/bottom/left/right");
  }
  checkChartTextStyle(ctx, value, file, ypath);
}

function checkChartAxis(ctx: Ctx, value: unknown, file: string, ypath: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, ypath, "axis 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, CHART_AXIS_FIELDS, file, ypath);
  if (value.show !== undefined && typeof value.show !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.show`, "axis.show 必须是布尔值");
  }
  if (value.type !== undefined && (typeof value.type !== "string" || !CHART_AXIS_TYPES.has(value.type))) {
    report(ctx, "PPTD-E013", file, `${ypath}.type`, "axis.type 必须是 category/value");
  }
  for (const k of ["min", "max"] as const) {
    if (value[k] !== undefined && !isFiniteNumber(value[k])) {
      report(ctx, "PPTD-E013", file, `${ypath}.${k}`, `axis.${k} 必须是数字`);
    }
  }
  if (value.reverse !== undefined && typeof value.reverse !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.reverse`, "axis.reverse 必须是布尔值");
  }
  if (value.title !== undefined) {
    if (typeof value.title === "string") {
      // string 形态合法。
    } else if (isRecord(value.title)) {
      checkUnknownFields(ctx, value.title, CHART_TITLE_FIELDS, file, `${ypath}.title`);
      if (typeof value.title.text !== "string") {
        report(ctx, "PPTD-E001", file, `${ypath}.title.text`, "title.text 必填且为字符串");
      }
      checkChartTextStyle(ctx, value.title, file, `${ypath}.title`);
    } else {
      report(ctx, "PPTD-E001", file, `${ypath}.title`, "axis.title 必须是字符串或 TitleConfig");
    }
  }
  if (value.label !== undefined && typeof value.label !== "boolean") {
    if (!isRecord(value.label)) {
      report(ctx, "PPTD-E001", file, `${ypath}.label`, "axis.label 必须是布尔值或 TextStyle+numberFormat");
    } else {
      checkUnknownFields(ctx, value.label, CHART_AXIS_LABEL_FIELDS, file, `${ypath}.label`);
      if (value.label.numberFormat !== undefined && typeof value.label.numberFormat !== "string") {
        report(ctx, "PPTD-E013", file, `${ypath}.label.numberFormat`, "label.numberFormat 必须是字符串");
      }
      checkChartTextStyle(ctx, value.label, file, `${ypath}.label`);
    }
  }
  if (value.axisLine !== undefined && typeof value.axisLine !== "boolean") {
    if (!isRecord(value.axisLine)) {
      report(ctx, "PPTD-E001", file, `${ypath}.axisLine`, "axisLine 必须是布尔值或 LineStyleConfig+arrow");
    } else {
      checkUnknownFields(ctx, value.axisLine, CHART_AXIS_LINE_FIELDS, file, `${ypath}.axisLine`);
      const arrow = value.axisLine.arrow;
      if (arrow !== undefined && typeof arrow !== "boolean" && !(typeof arrow === "string" && CHART_AXIS_ARROWS.has(arrow))) {
        report(ctx, "PPTD-E013", file, `${ypath}.axisLine.arrow`, "axisLine.arrow 必须是布尔值或 start/end/both");
      }
      checkChartLineStyle(ctx, value.axisLine, file, `${ypath}.axisLine`);
    }
  }
  if (value.gridLine !== undefined && typeof value.gridLine !== "boolean") {
    if (!isRecord(value.gridLine)) {
      report(ctx, "PPTD-E001", file, `${ypath}.gridLine`, "gridLine 必须是布尔值或 LineStyleConfig");
    } else {
      checkUnknownFields(ctx, value.gridLine, CHART_LINE_STYLE_FIELDS, file, `${ypath}.gridLine`);
      checkChartLineStyle(ctx, value.gridLine, file, `${ypath}.gridLine`);
    }
  }
}

function checkChartSpokeBody(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.show !== undefined && typeof value.show !== "boolean") {
    report(ctx, "PPTD-E013", file, `${ypath}.show`, "spokeAxis.show 必须是布尔值");
  }
  for (const k of ["min", "max"] as const) {
    if (value[k] !== undefined && !isFiniteNumber(value[k])) {
      report(ctx, "PPTD-E013", file, `${ypath}.${k}`, `spokeAxis.${k} 必须是数字`);
    }
  }
  if (value.label !== undefined && typeof value.label !== "boolean") {
    if (!isRecord(value.label)) {
      report(ctx, "PPTD-E001", file, `${ypath}.label`, "spokeAxis.label 必须是布尔值或 TextStyle+numberFormat");
    } else {
      checkUnknownFields(ctx, value.label, CHART_AXIS_LABEL_FIELDS, file, `${ypath}.label`);
      checkChartTextStyle(ctx, value.label, file, `${ypath}.label`);
    }
  }
  for (const k of ["axisLine", "gridLine"] as const) {
    const line = value[k];
    if (line === undefined || typeof line === "boolean") continue;
    if (!isRecord(line)) {
      report(ctx, "PPTD-E001", file, `${ypath}.${k}`, `spokeAxis.${k} 必须是布尔值或 LineStyleConfig`);
      continue;
    }
    checkUnknownFields(ctx, line, CHART_LINE_STYLE_FIELDS, file, `${ypath}.${k}`);
    checkChartLineStyle(ctx, line, file, `${ypath}.${k}`);
  }
}

function checkChartLineStyle(ctx: Ctx, value: Raw, file: string, ypath: string): void {
  if (value.style !== undefined && (typeof value.style !== "string" || !BORDER_STYLES.has(value.style))) {
    report(ctx, "PPTD-E013", file, `${ypath}.style`, "style 必须是 solid/dash/dot");
  }
  if (value.color !== undefined) checkColor(ctx, value.color, file, `${ypath}.color`);
  if (value.width !== undefined && (!isFiniteNumber(value.width) || value.width <= 0)) {
    report(ctx, "PPTD-E013", file, `${ypath}.width`, "width 必须是正数");
  }
}

/**
 * §5.4 混排矩阵（chart.typeMixing 行 → E014）：bar/line/area/scatter/bubble 自由混；
 * candlestick 仅可与 bar/line/area 共存；pie/radar/waterfall/heatmap/treemap/
 * sunburst/sankey 独占（series 数组只能有其一项）。
 */
function checkChartTypeMixing(ctx: Ctx, series: unknown[], file: string, ypath: string): void {
  const types = series
    .filter(isRecord)
    .map((s) => s.type)
    .filter((t): t is string => typeof t === "string");
  if (types.length === 0) return;
  const exclusive = [...new Set(types.filter((t) => CHART_TYPE_EXCLUSIVE.has(t)))];
  if (exclusive.length > 0) {
    const sole = exclusive[0]!;
    if (types.length > 1 || types.some((t) => t !== sole)) {
      report(ctx, "PPTD-E014", file, ypath, `series 类型 "${sole}" 独占（§5.4），不得与其他类型混排`);
    }
    return;
  }
  if (types.includes("candlestick")) {
    const invalid = [...new Set(types.filter((t) => t !== "candlestick" && !CHART_TYPE_CANDLESTICK_MIX.has(t)))];
    if (invalid.length > 0) {
      report(ctx, "PPTD-E014", file, ypath, `candlestick 仅可与 bar/line/area 混排（§5.4），发现 "${invalid.join(", ")}"`);
    }
  }
  const freeTypes = types.filter((t) => CHART_TYPE_MIX_FREE.has(t));
  if (freeTypes.includes("radar") === false && types.includes("radar")) {
    // radar 已由 exclusive 分支处理；此处不可达，防御性保留。
  }
  // chart.radar 行：同图 radar series 的 encode.category 必须同列（E014）。
  if (types.every((t) => t === "radar") && types.length > 1) {
    const categories = new Set<string>();
    for (const s of series) {
      if (isRecord(s) && isRecord(s.encode) && typeof s.encode.category === "string") {
        categories.add(s.encode.category);
      }
    }
    if (categories.size > 1) {
      report(ctx, "PPTD-E014", file, ypath, "radar 各 series 的 encode.category 必须同列（共享 spoke）");
    }
  }
}

// ---- page / theme / manifest ----

function checkPage(ctx: Ctx, rec: Raw, file: string): void {
  // excluded 能力输入具名拒绝（E011，capabilityId 进 message）。
  const excludedKeys = new Set<string>();
  for (const key of Object.keys(rec)) {
    const capabilityId = excludedPageCapabilityForInputKey(key);
    if (capabilityId !== null) {
      excludedKeys.add(key);
      report(ctx, EXCLUDED_FAILURE_CODES.get(capabilityId)!, file, key, `${key} 属 excluded 能力（${capabilityId} 行，产品范围外）`);
    }
  }
  checkUnknownFields(ctx, rec, PAGE_FIELDS, file, "", excludedKeys);
  if (rec.background !== undefined) checkFill(ctx, rec.background, file, "background");
  if (!Array.isArray(rec.elements)) {
    report(ctx, "PPTD-E001", file, "elements", "elements 必填且为数组");
    return;
  }
  const seenIds = new Set<string>();
  rec.elements.forEach((el, i) => {
    const ypath = `elements[${i}]`;
    if (!isRecord(el)) {
      report(ctx, "PPTD-E001", file, ypath, "element 必须是对象");
      return;
    }
    checkElement(ctx, el, file, ypath, seenIds);
  });
}

function checkTheme(ctx: Ctx, value: unknown, file: string): void {
  if (!isRecord(value)) {
    report(ctx, "PPTD-E001", file, "theme", "theme 必须是对象");
    return;
  }
  checkUnknownFields(ctx, value, THEME_FIELDS, file, "theme");
  if (value.colors !== undefined) {
    if (!isRecord(value.colors)) {
      report(ctx, "PPTD-E001", file, "theme.colors", "theme.colors 必须是对象");
    } else {
      for (const [k, v] of Object.entries(value.colors)) {
        ctx.themeColors.add(k);
        // theme 定义处只落 hex（一个含义一个地方：$ 引用只出现在使用处）；非 hex 值 → E013。
        if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
          report(ctx, "PPTD-E013", file, `theme.colors.${k}`, "theme.colors 值必须是 hex 颜色");
        }
      }
    }
  }
  if (value.textStyles !== undefined) {
    if (!isRecord(value.textStyles)) {
      report(ctx, "PPTD-E001", file, "theme.textStyles", "theme.textStyles 必须是对象");
    } else {
      for (const [k, style] of Object.entries(value.textStyles)) {
        ctx.themeTextStyles.add(k);
        const ypath = `theme.textStyles.${k}`;
        if (!isRecord(style)) {
          report(ctx, "PPTD-E001", file, ypath, "textStyle 必须是对象");
          continue;
        }
        checkUnknownFields(ctx, style, TEXT_STYLE_FIELDS, file, ypath);
        if (style.lineHeight !== undefined && style.lineHeightPx !== undefined) {
          report(ctx, "PPTD-E013", file, ypath, "lineHeight 与 lineHeightPx 互斥");
        }
        if (style.color !== undefined) checkColor(ctx, style.color, file, `${ypath}.color`);
        checkTextStyleFields(ctx, style, file, ypath);
      }
    }
  }
  if (value.tableStyles !== undefined) {
    if (!isRecord(value.tableStyles)) {
      report(ctx, "PPTD-E001", file, "theme.tableStyles", "theme.tableStyles 必须是对象");
    } else {
      for (const [k, style] of Object.entries(value.tableStyles)) {
        ctx.themeTableStyles.add(k);
        const ypath = `theme.tableStyles.${k}`;
        if (!isRecord(style)) {
          report(ctx, "PPTD-E001", file, ypath, "tableStyle 必须是对象");
          continue;
        }
        checkTableStyleConfig(ctx, style, file, ypath);
      }
    }
  }
}

/** font.registration 行：customFonts 逐条校验并登记 family（E012 核对源）。 */
function checkCustomFonts(ctx: Ctx, value: unknown, file: string): void {
  if (!Array.isArray(value)) {
    report(ctx, "PPTD-E001", file, "customFonts", "customFonts 必须是数组");
    return;
  }
  value.forEach((entry, i) => {
    const ypath = `customFonts[${i}]`;
    if (!isRecord(entry)) {
      report(ctx, "PPTD-E001", file, ypath, "customFont 必须是对象");
      return;
    }
    checkUnknownFields(ctx, entry, CUSTOM_FONT_FIELDS, file, ypath);
    const familyError = staticV1FontRegistrationFamilyError(entry.family);
    if (familyError !== null || typeof entry.family !== "string") {
      report(ctx, "PPTD-E013", file, `${ypath}.family`, familyError ?? "customFont.family 非法");
    } else {
      ctx.registeredFonts.add(entry.family);
    }
    checkMediaPath(ctx, entry.src, file, `${ypath}.src`, "font");
    for (const k of ["weight", "style"] as const) {
      if (entry[k] !== undefined) {
        const descriptorError = staticV1FontDescriptorError(entry[k]);
        if (descriptorError !== null) {
          report(ctx, "PPTD-E013", file, `${ypath}.${k}`, `customFont.${k} 非法：${descriptorError}`);
        }
      }
    }
  });
}

/** 读取并解析 YAML；失败产出 E001（path 落在文件本身）并返回 undefined。 */
function loadYaml(ctx: Ctx, absPath: string, file: string): unknown {
  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    report(ctx, "PPTD-E001", file, "", `文件不可读：${file}`);
    return undefined;
  }
  return parseYamlText(ctx, text, file);
}

/** Snapshot variant: parse immutable bytes; missing bytes = E001 file unreadable. Never touches FS. */
function loadYamlBytes(ctx: Ctx, bytes: Uint8Array | undefined, file: string): unknown {
  if (bytes === undefined) {
    report(ctx, "PPTD-E001", file, "", `文件不可读：${file}`);
    return undefined;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8").decode(bytes);
  } catch {
    report(ctx, "PPTD-E001", file, "", `文件不可读：${file}`);
    return undefined;
  }
  return parseYamlText(ctx, text, file);
}

function parseYamlText(ctx: Ctx, text: string, file: string): unknown {
  try {
    return parse(text);
  } catch (err) {
    report(ctx, "PPTD-E001", file, "", `不是合法 YAML：${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return undefined;
  }
}

const ELEMENT_TYPES_SET = new Set<string>(BENTO_ELEMENT_KINDS_V4);

export function validate(entryPath: string, opts: ValidateOptions): ValidationResult {
  const ctx: Ctx = {
    diagnostics: [],
    projectRoot: opts.projectRoot,
    canvas: null,
    themeColors: new Set(),
    themeTextStyles: new Set(),
    themeTableStyles: new Set(),
    registeredFonts: new Set(),
  };
  const entryDir = path.dirname(entryPath);
  const manifestFile = path.basename(entryPath);

  const productBoundary = validateProductBoundaryFile(entryPath);
  if (productBoundary !== null) return liveValidationResult(productBoundary);

  const raw = loadYaml(ctx, entryPath, manifestFile);
  return liveValidationResult(
    finishValidation(ctx, manifestFile, raw, (pageRel) =>
      loadYaml(ctx, path.resolve(entryDir, pageRel), pageRel),
    ),
  );
}

/**
 * Snapshot variant of the validator. Inputs are a normalized relative entry
 * path plus the complete immutable byte snapshot; page loading, media
 * existence, and font-byte sniffing all read only the snapshot. Diagnostic
 * codes, paths, messages, and ordering match the filesystem variant.
 *
 * @internal composition seam for intake only. Focused authoring tests may use
 * it with immutable bytes; cross-package production callers and closure
 * producers must use intakeAuthoring instead.
 */
export function validateSnapshot(entryRel: string, snapshot: ReadonlyMap<string, Uint8Array>): ValidationResult {
  const ctx: Ctx = {
    diagnostics: [],
    snapshot,
    canvas: null,
    themeColors: new Set(),
    themeTextStyles: new Set(),
    themeTableStyles: new Set(),
    registeredFonts: new Set(),
  };
  const normEntry = path.posix.normalize(entryRel);
  const manifestFile = normEntry.split("/").pop() ?? normEntry;

  const productBoundary = validateProductBoundarySnapshot(normEntry, snapshot);
  if (productBoundary !== null) return liveValidationResult(productBoundary);

  const raw = loadYamlBytes(ctx, snapshot.get(normEntry), manifestFile);
  const entryDir = path.posix.dirname(normEntry);
  return liveValidationResult(
    finishValidation(ctx, manifestFile, raw, (pageRel) => {
      const pageKey = path.posix.normalize(path.posix.join(entryDir, pageRel));
      return loadYamlBytes(ctx, snapshot.get(pageKey), pageRel);
    }),
  );
}

function finishValidation(
  ctx: Ctx,
  manifestFile: string,
  raw: unknown,
  loadPage: (pageRel: string) => unknown,
): FrozenAuthoringValidationResult {
  if (!isRecord(raw)) {
    if (raw !== undefined) report(ctx, "PPTD-E001", manifestFile, "", "manifest 必须是 YAML 映射");
    return { ok: false, diagnostics: ctx.diagnostics };
  }
  return validateV3(raw, manifestFile, loadPage, (rel) => {
    if (ctx.snapshot) return ctx.snapshot.get(rel);
    try { return new Uint8Array(readFileSync(path.resolve(ctx.projectRoot!, rel))); }
    catch { return undefined; }
  });
}
