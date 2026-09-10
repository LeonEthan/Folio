/**
 * PPTD → BentoDoc v4 importer（GD-4b Wave B2，docs/gd-4-acceptance.md §3.2 步骤 3）。
 *
 * 唯一合法输入是 ValidatedPptd（品牌类型）+ AssetIndex（调用方在 import 前收集
 * media/ 字节并内容寻址；import 不接触字节，只做路径 → "asset:<sha256>" 固化）。
 * validator 已判定零 E 级；import 期才会出现的失败（AssetIndex 缺项、encode 引用
 * 未知列、数值通道含不可解析字符串）走 status:"unsupported" 具名拒绝（issues 携带
 * PPTD-E0xx 码 + path + sourceId），绝不产出伪可用文档（solution.md §8.3）。
 *
 * 确定性映射（零降级，最小语义口径，不物化 PPTD 默认值——image fit 例外，见下）：
 * - elementId → id 透传；bounds 复制；zIndex 由数组序显式化 0..n-1（common.zOrder 行）；
 * - sourceMap 1:1（elementId → [id]，v4 import 无降级拆分，solution.md §8.3）；
 * - theme `$` 引用（colors/textStyles/tableStyles）全部在 import 期解析为字面值
 *   （C24：一个含义一个地方，运行期不联动）；content 样式按 PPTD §1 优先级链
 *   （textStyle $ref 展开在前、显式字段在后覆盖，C25）；
 * - text：content.text 经 richtext.ts 解析为 paragraphs/runs（run 颜色 $ref 一并
 *   解析）；content.shadow 提为元素 base（common.shadow 行，text 宿主）；
 * - image：fit 一律显式写（PPTD 缺省 cover ≠ native 缺省 contain，image.fit 行）；
 *   crop {left,top,right,bottom} → [l,t,r,b] 1:1（缺省分量按 0；正=inset 负=outset
 *   两侧同语义，image.crop 行 C8——取代 v2 归一化矩形与 D101 丢弃）；
 * - table：columnWidths/rowHeights/rows（合并占位省略形态）1:1；cell.text 富文本
 *   解析为结构化 cell.text（table.cellText 行）；style $ref 解析为内联 TableStyleConfig
 *   （C24）；cell border 颜色递归解析；
 * - chart：data 1:1（isTotal 布尔列按 chart.waterfall 行映射为 "true"/"false" 串，
 *   adapter 以 encode.isTotal 列名复原布尔语义——canonical rows 词表 number|string/null）；
 *   seriesDefaults 一层深合并物化到各 series 后不随文档携带（可推导状态不重复持久化，
 *   "同一语义不双写"）；encode 仅存列名引用（import 期逐通道核对列存在 + 数值通道
 *   可解析性，chart.encode/chart.data 行）；palette = theme.colors 解析后的字面值
 *   循环数组（chart.palette 行，仅 theme.colors 存在时物化；B3 起 schema 已声明该
 *   TS 字段——BENTO_DOC_V4_FIELDS 只约束元素顶层键，不约束 chart 嵌套键）；
 * - fonts：manifest.customFonts → doc.fonts（src 经 AssetIndex 固化）+ E012 兜底核对
 *   （输出文档全部非 generic family 必须已登记，validator 之外的保险，D3）；
 * - background：页面缺省时按 PPTD 文档默认补白色 solid（BentoDoc background 必填，
 *   唯一补默认值例外）；diagnostics 成功恒 []（零静默损失）。
 */

import type {
  AssetIndex,
  BentoBorder,
  BentoBorderSpecV4,
  BentoCellBorderV4,
  BentoChartAxisV4,
  BentoChartDataLabelV4,
  BentoChartElementV4,
  BentoChartLegendV4,
  BentoChartSeriesV4,
  BentoChartSpokeAxisV4,
  BentoChartTextStyleV4,
  BentoChartTitleV4,
  BentoChartV4,
  BentoColor,
  BentoDocV4,
  BentoElementV4,
  BentoFillV4,
  BentoFontRegistrationV4,
  BentoIconElementV4,
  BentoImageElementV4,
  BentoLinearGradientFill,
  BentoLineElementV4,
  BentoRadialGradientFillV4,
  BentoShadow,
  BentoShapeElementV4,
  BentoTableCellStyleV4,
  BentoTableCellV4,
  BentoTableStyleV4,
  BentoTextContentV4,
  BentoTextElementV4,
  ImportIssue,
  ImportResult,
  PptdBorder,
  PptdBorderSpec,
  PptdChartAxis,
  PptdChartElement,
  PptdChartLineStyle,
  PptdChartSpokeAxis,
  PptdChartTextStyle,
  PptdColor,
  PptdElement,
  PptdFill,
  PptdIconElement,
  PptdImageElement,
  PptdLineElement,
  PptdManifest,
  PptdShadow,
  PptdShapeElement,
  PptdTableElement,
  PptdTableCell,
  PptdTableStyle,
  PptdCellStyle,
  PptdTextContent,
  PptdTextElement,
  PptdTextStyle,
  PptdTheme,
  ValidatedPptd,
} from "./contracts.ts";
import {
  resolveStaticV1IconMembership,
  staticV1FontDescriptorError,
  staticV1FontRegistrationFamilyError,
  staticV1UnregisteredFontFamilies,
} from "./contracts.ts";
import { staticV1LatexSyntaxError } from "./latex.ts";
import { parseRichText } from "./richtext.ts";
import { listSemanticAssetRefs } from "./semantic-assets.ts";

/** 一次 import 的上下文：theme 解析源、资产索引、当前页路径（诊断用）、具名拒绝收集。 */
interface ImportCtx {
  theme: PptdTheme;
  pagePath: string;
  assets: AssetIndex;
  issues: ImportIssue[];
}

const NUMERIC_ENCODE_CHANNELS = new Set(["value", "size", "open", "high", "low", "close", "flow"]);
const NUMERIC_Y_SERIES_TYPES = new Set(["bar", "line", "area", "scatter", "bubble", "radar", "waterfall"]);
const NUMERIC_POINT_SERIES_TYPES = new Set(["scatter", "bubble"]);

/** Keep import-time encode checks aligned with the renderer's channel roles. */
function numericEncodeChannel(type: string, channel: string): boolean {
  return NUMERIC_ENCODE_CHANNELS.has(channel) ||
    (channel === "y" && NUMERIC_Y_SERIES_TYPES.has(type)) ||
    (channel === "x" && NUMERIC_POINT_SERIES_TYPES.has(type));
}

export function importPptd(validated: ValidatedPptd, assets: AssetIndex): ImportResult {
  // BentoDoc 只有单画布语义；多页在 validator 已被 E011 拒绝，此处为不可达守卫。
  if (validated.pages.length !== 1) {
    throw new Error(`BentoDoc models exactly one page; got ${validated.pages.length}`);
  }
  const page = validated.pages[0]!;
  const ctx: ImportCtx = {
    theme: validated.manifest.theme ?? {},
    pagePath: validated.manifest.pages[0] ?? "",
    assets,
    issues: [],
  };

  // ValidatedPptd is a brand, not a trust boundary. Re-check the shared
  // registration grammar before any forged payload reaches CSS/native sinks.
  for (const [index, font] of (validated.manifest.customFonts ?? []).entries()) {
    const familyError = staticV1FontRegistrationFamilyError(font.family);
    if (familyError !== null) {
      ctx.issues.push({
        path: `manifest#customFonts[${index}].family`,
        code: "PPTD-E013",
        message: `customFont.family 非法：${familyError}`,
      });
    }
    for (const field of ["weight", "style"] as const) {
      if (font[field] === undefined) continue;
      const descriptorError = staticV1FontDescriptorError(font[field]);
      if (descriptorError !== null) {
        ctx.issues.push({
          path: `manifest#customFonts[${index}].${field}`,
          code: "PPTD-E013",
          message: `customFont.${field} 非法：${descriptorError}`,
        });
      }
    }
  }
  if (ctx.issues.length > 0) return { status: "unsupported", issues: ctx.issues };

  // ① 资产索引核对（E005 具名拒绝）：image src / 全部 image fill src / customFonts src。
  checkAssets(validated, ctx);
  if (ctx.issues.length > 0) return { status: "unsupported", issues: ctx.issues };

  // ② 元素映射 + sourceMap（1:1）。
  const elements: BentoElementV4[] = [];
  const sourceMap: Record<string, readonly string[]> = {};
  page.elements.forEach((element, index) => {
    const mapped = mapElement(element, index, ctx);
    elements.push(mapped);
    sourceMap[element.elementId] = [element.elementId];
  });
  // zIndex 由数组序显式化（0..n-1）。
  elements.forEach((element, index) => {
    element.zIndex = index;
  });

  const fonts = mapFonts(validated.manifest.customFonts, ctx);
  const [width, height] = validated.manifest.size;
  const document: BentoDocV4 = {
    schemaVersion: 4,
    canvas: { width, height },
    background: page.background
      ? resolveFill(page.background, ctx)
      : { type: "solid", color: "#FFFFFF" },
    ...(fonts.length > 0 ? { fonts } : {}),
    elements,
    diagnostics: [],
  };

  // ③ E012 兜底（belt-and-suspenders）：输出文档内全部非 generic family 必须已登记。
  const registered = (document.fonts ?? []).map((f) => f.family);
  for (const family of staticV1UnregisteredFontFamilies(document.elements, registered)) {
    ctx.issues.push({
      path: ctx.pagePath,
      code: "PPTD-E012",
      message: `fontFamily 栈引用未登记 family "${family}"（须登记于 manifest customFonts）`,
    });
  }
  if (ctx.issues.length > 0) return { status: "unsupported", issues: ctx.issues };

  // profileVersion = 冻结 matrix activeProfileVersion（v1.json），字面量随 D7。
  return { status: "ok", document, sourceMap, profileVersion: "v1", degradations: [] };
}

// ---- ① 资产索引核对 ----

function checkAssets(validated: ValidatedPptd, ctx: ImportCtx): void {
  // Single truth for semantic asset locations lives in semantic-assets.ts;
  // admission here only checks index presence, preserving historical paths.
  for (const { ref, path, sourceId } of listSemanticAssetRefs(validated, ctx.pagePath)) {
    if (ctx.assets[ref] === undefined) {
      ctx.issues.push({
        ...(sourceId !== undefined ? { sourceId } : {}),
        path,
        code: "PPTD-E005",
        message: `资产索引缺项：${ref}（AssetIndex 未登记）`,
      });
    }
  }
}

// ---- ② 元素映射 ----

function mapElement(element: PptdElement, sourceIndex: number, ctx: ImportCtx): BentoElementV4 {
  const at = (sub: string): string => `${ctx.pagePath}#elements[${sourceIndex}]${sub}`;
  switch (element.elementType) {
    case "text":
      return mapText(element, ctx, at);
    case "shape":
      return mapShape(element, ctx);
    case "line":
      return mapLine(element, ctx);
    case "image":
      return mapImage(element, ctx, at);
    case "icon":
      return mapIcon(element, ctx);
    case "table":
      return mapTable(element, ctx, at);
    case "chart":
      return mapChart(element, ctx, at);
  }
  // Unreachable: PptdElement is a closed union over the seven kinds above.
  throw new Error("unreachable: unknown elementType");
}

interface ElementBaseFields {
  id: string;
  bounds: [number, number, number, number];
  zIndex: number;
  rotation?: number;
  flip?: [boolean, boolean];
  opacity?: number;
  shadow?: BentoShadow;
}

/** 公共字段：rotation/flip 透传（度/顺时针零换算）；opacity/shadow 提升为 base；zIndex 先置 0 由数组序重排。 */
function baseFields(element: PptdElement, ctx: ImportCtx): ElementBaseFields {
  const out: ElementBaseFields = {
    id: element.elementId,
    bounds: [...element.bounds] as [number, number, number, number],
    zIndex: 0,
  };
  if (element.rotation !== undefined) out.rotation = element.rotation;
  if (element.flip !== undefined) out.flip = [element.flip[0]!, element.flip[1]!];
  if ("opacity" in element && element.opacity !== undefined) out.opacity = element.opacity;
  if ("shadow" in element && element.shadow !== undefined) out.shadow = resolveShadow(element.shadow, ctx);
  return out;
}

function mapText(element: PptdTextElement, ctx: ImportCtx, at: (sub: string) => string): BentoTextElementV4 {
  const base = baseFields(element, ctx);
  const text: BentoTextContentV4 = mapTextContent(element.content, ctx, at(".content"));
  if (element.content.shadow !== undefined) base.shadow = resolveShadow(element.content.shadow, ctx);
  return { ...base, kind: "text", text };
}

function mapTextContent(content: PptdTextContent, ctx: ImportCtx, at: string): BentoTextContentV4 {
  const out: BentoTextContentV4 = { paragraphs: parseTextParagraphs(content.text, ctx, at) };
  // C25 优先级链：textStyle $ref 展开值在前，content 显式字段在后覆盖。
  const sources: PptdTextStyle[] = [];
  if (content.style !== undefined) sources.push(lookupTextStyle(content.style, ctx.theme));
  sources.push(content);
  for (const source of sources) {
    if (source.color !== undefined) out.color = resolveColor(source.color, ctx);
    if (source.fontSize !== undefined) out.fontSize = source.fontSize;
    if (source.fontFamily !== undefined) out.fontFamily = source.fontFamily;
    if (source.bold !== undefined) out.bold = source.bold;
    if (source.italic !== undefined) out.italic = source.italic;
    if (source.backgroundColor !== undefined) out.backgroundColor = resolveColor(source.backgroundColor, ctx);
    if (source.lineHeight !== undefined) out.lineHeight = source.lineHeight;
    if (source.lineHeightPx !== undefined) out.lineHeightPx = source.lineHeightPx;
    if (source.letterSpacing !== undefined) out.letterSpacing = source.letterSpacing;
    if (source.marginTop !== undefined) out.marginTop = source.marginTop;
  }
  if (content.textDirection !== undefined) out.textDirection = content.textDirection;
  if (content.wrap !== undefined) out.wrap = content.wrap;
  if (content.align !== undefined) out.align = [content.align[0], content.align[1]];
  if (content.gradient !== undefined) out.gradient = resolveTextGradient(content.gradient, ctx);
  return out;
}

/** content.text/cell.text → canonical paragraphs（run 颜色 $ref 一并解析；validator 保证可解析）。 */
function parseTextParagraphs(text: string, ctx: ImportCtx, at: string): BentoTextContentV4["paragraphs"] {
  const parsed = parseRichText(text);
  if (!parsed.ok) {
    // validator 的 E013 已拒绝；到达此处即不变量被破坏（fail closed）。
    throw new Error(`rich text in validated document failed to parse: ${parsed.reason} (at ${at})`);
  }
  for (const [paragraphIndex, para] of parsed.paragraphs.entries()) {
    for (const [runIndex, run] of para.runs.entries()) {
      if (run.color !== undefined) run.color = resolveColor(run.color, ctx);
      if (run.backgroundColor !== undefined) run.backgroundColor = resolveColor(run.backgroundColor, ctx);
      if (run.latex !== undefined) {
        const error = staticV1LatexSyntaxError(run.latex);
        if (error !== null) {
          ctx.issues.push({
            path: `${at}#p${paragraphIndex}r${runIndex}.latex`,
            code: "PPTD-E013",
            message: `latex is not accepted by pinned Temml: ${error}`,
          });
        }
      }
    }
  }
  return parsed.paragraphs;
}

function mapShape(element: PptdShapeElement, ctx: ImportCtx): BentoShapeElementV4 {
  const out: BentoShapeElementV4 = { ...baseFields(element, ctx), kind: "shape", shapeName: element.shapeName };
  if (element.adjustments !== undefined) out.adjustments = [...element.adjustments];
  if (element.viewBox !== undefined) out.viewBox = [element.viewBox[0], element.viewBox[1]];
  if (element.path !== undefined) out.path = element.path;
  if (element.fill !== undefined) out.fill = resolveFill(element.fill, ctx);
  if (element.border !== undefined) out.border = resolveBorder(element.border, ctx);
  return out;
}

function mapLine(element: PptdLineElement, ctx: ImportCtx): BentoLineElementV4 {
  const out: BentoLineElementV4 = {
    ...baseFields(element, ctx),
    kind: "line",
    viewBox: [element.viewBox[0], element.viewBox[1]],
    points: element.points,
  };
  if (element.curve !== undefined) out.curve = element.curve;
  if (element.arrow !== undefined) out.arrow = [element.arrow[0], element.arrow[1]];
  if (element.border !== undefined) out.border = resolveBorder(element.border, ctx);
  return out;
}

function mapImage(element: PptdImageElement, ctx: ImportCtx, at: (sub: string) => string): BentoImageElementV4 {
  const asset = ctx.assets[element.src];
  // checkAssets 已核对；不可达守卫。
  if (asset === undefined) throw new Error(`asset index missing for image src "${element.src}" (at ${at(".src")})`);
  const out: BentoImageElementV4 = { ...baseFields(element, ctx), kind: "image", src: asset };
  // image.fit 行：import 一律显式写（PPTD 缺省 cover）。
  out.fit = element.fit?.mode ?? "cover";
  if (element.crop !== undefined) out.crop = cropToEdges(element.crop);
  if (element.cropShape !== undefined) out.cropShape = { ...element.cropShape };
  // common.border 行（image 宿主）：border 必须落 canonical，静默丢弃即违约。
  if (element.border !== undefined) out.border = resolveBorder(element.border, ctx);
  return out;
}

function mapIcon(element: PptdIconElement, ctx: ImportCtx): BentoIconElementV4 {
  const out: BentoIconElementV4 = {
    ...baseFields(element, ctx),
    kind: "icon",
    iconName: resolveStaticV1IconMembership(element.iconName).iconName,
  };
  if (element.fill !== undefined) out.fill = resolveFill(element.fill, ctx);
  // common.border 行（icon 宿主）：border 必须落 canonical，静默丢弃即违约。
  if (element.border !== undefined) out.border = resolveBorder(element.border, ctx);
  return out;
}

function mapTable(element: PptdTableElement, ctx: ImportCtx, at: (sub: string) => string): BentoElementV4 {
  const out: BentoElementV4 = {
    ...baseFields(element, ctx),
    kind: "table",
    table: {
      columnWidths: [...element.columnWidths],
      rowHeights: [...element.rowHeights],
      rows: element.rows.map((row, r) =>
        row.map((cell, c) => mapTableCell(cell, ctx, at(`.rows[${r}][${c}]`))),
      ),
      ...(element.style !== undefined ? { style: resolveTableStyle(element.style, ctx) } : {}),
    },
    ...(element.fill !== undefined ? { fill: resolveFill(element.fill, ctx) } : {}),
    ...(element.border !== undefined ? { border: resolveBorder(element.border, ctx) } : {}),
  };
  return out;
}

function mapTableCell(cell: PptdTableCell, ctx: ImportCtx, at: string): BentoTableCellV4 {
  const out: BentoTableCellV4 = {};
  if (cell.text !== undefined) {
    out.text = { paragraphs: parseTextParagraphs(cell.text, ctx, `${at}.text`) };
  }
  // C24：textStyle $ref 展开为 cell 内联文本字段（仅文本字段，table.cellTextStyleRef 行）；
  // C25：展开值在前、cell 显式字段在后覆盖。
  const sources: PptdTextStyle[] = [];
  if (cell.textStyle !== undefined) sources.push(lookupTextStyle(cell.textStyle, ctx.theme));
  sources.push(cell);
  for (const source of sources) {
    if (source.color !== undefined) out.color = resolveColor(source.color, ctx);
    if (source.fontSize !== undefined) out.fontSize = source.fontSize;
    if (source.fontFamily !== undefined) out.fontFamily = source.fontFamily;
    if (source.bold !== undefined) out.bold = source.bold;
    if (source.italic !== undefined) out.italic = source.italic;
    if (source.backgroundColor !== undefined) out.backgroundColor = resolveColor(source.backgroundColor, ctx);
    if (source.lineHeight !== undefined) out.lineHeight = source.lineHeight;
    if (source.lineHeightPx !== undefined) out.lineHeightPx = source.lineHeightPx;
    if (source.letterSpacing !== undefined) out.letterSpacing = source.letterSpacing;
    if (source.marginTop !== undefined) out.marginTop = source.marginTop;
  }
  if (cell.fill !== undefined) out.fill = resolveFill(cell.fill, ctx);
  if (cell.border !== undefined) out.border = resolveBorderSpec(cell.border, ctx);
  if (cell.align !== undefined) out.align = [cell.align[0], cell.align[1]];
  if (cell.rowSpan !== undefined) out.rowSpan = cell.rowSpan;
  if (cell.colSpan !== undefined) out.colSpan = cell.colSpan;
  return out;
}

function mapChart(element: PptdChartElement, ctx: ImportCtx, at: (sub: string) => string): BentoChartElementV4 {
  const waterfallBooleanColumns = new Set(
    element.series
      .map((series) => series.type === "waterfall" ? series.encode.isTotal : undefined)
      .filter((column): column is string => typeof column === "string"),
  );
  const chart: BentoChartV4 = {
    data: mapChartData(element.data, waterfallBooleanColumns, ctx, at(".data"), element.elementId),
    series: element.series.map((series, si) => mapChartSeries(series, element, ctx, at(`.series[${si}]`), element.elementId)),
  };
  // chart.palette 行：theme.colors 循环数组物化为字面值（$ref 已解析，运行期不联动）。
  const themeColors = ctx.theme.colors ? Object.values(ctx.theme.colors) : [];
  if (themeColors.length > 0) {
    chart.palette = themeColors.map((c) => resolveColor(c, ctx));
  }
  if (element.xAxis !== undefined) {
    // 副 x 轴（数组形态）已由 validator E013 拒绝；此处只可能是单对象。
    chart.xAxis = mapChartAxis(element.xAxis as PptdChartAxis, ctx);
  }
  if (element.yAxis !== undefined) {
    chart.yAxis = Array.isArray(element.yAxis)
      ? element.yAxis.map((a) => mapChartAxis(a, ctx))
      : mapChartAxis(element.yAxis, ctx);
  }
  if (element.barWidth !== undefined) chart.barWidth = element.barWidth;
  if (element.barGap !== undefined) chart.barGap = element.barGap;
  if (element.categoryGap !== undefined) chart.categoryGap = element.categoryGap;
  if (element.spokeAxis !== undefined) chart.spokeAxis = mapChartSpokeAxis(element.spokeAxis, ctx);
  if (element.title !== undefined) {
    chart.title = typeof element.title === "string" ? element.title : mapChartTextStyle(element.title, ctx) as unknown as BentoChartTitleV4;
  }
  if (element.legend !== undefined) {
    chart.legend = typeof element.legend === "boolean" ? element.legend : mapChartTextStyle(element.legend, ctx) as unknown as BentoChartLegendV4;
  }
  if (element.dataLabels !== undefined) chart.dataLabels = mapChartTextStyle(element.dataLabels, ctx) as unknown as BentoChartDataLabelV4;
  if (element.fontFamily !== undefined) chart.fontFamily = element.fontFamily;
  if (element.fill !== undefined) chart.fill = resolveFill(element.fill, ctx);
  const out: BentoChartElementV4 = { ...baseFields(element, ctx), kind: "chart", chart };
  if (element.border !== undefined) out.border = resolveBorder(element.border, ctx);
  return out;
}

/**
 * data 1:1；canonical BentoDoc v4 的 data cell 词表没有 boolean，因此只
 * 将 waterfall.encode.isTotal 声明的布尔列转换为 "true"/"false"；任何
 * 其他布尔值同时记录 E014，保证 importer 与 validator 都是闭世界。
 */
function mapChartData(
  data: PptdChartElement["data"],
  booleanColumns: ReadonlySet<string>,
  ctx: ImportCtx,
  dataPath: string,
  sourceId: string,
): BentoChartV4["data"] {
  return {
    cols: [...data.cols],
    rows: data.rows.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        if (typeof cell !== "boolean") return cell;
        const column = data.cols[columnIndex];
        if (typeof column !== "string" || !booleanColumns.has(column)) {
          ctx.issues.push({
            sourceId,
            path: `${dataPath}.rows[${rowIndex}][${columnIndex}]`,
            code: "PPTD-E014",
            message: `布尔数据格只能出现在 waterfall.encode.isTotal 列（当前列 ${JSON.stringify(column)}）`,
          });
        }
        return cell ? "true" : "false";
      }),
    ),
  };
}

/** seriesDefaults 一层深合并物化（chart.seriesDefaults 行）+ encode 列名核对（chart.encode 行）。 */
function mapChartSeries(
  series: PptdChartElement["series"][number],
  element: PptdChartElement,
  ctx: ImportCtx,
  at: string,
  sourceId: string,
): BentoChartSeriesV4 {
  const clone = structuredClone(series) as unknown as Raw;
  const defaults = (element.seriesDefaults as unknown as Record<string, Raw> | undefined)?.[series.type];
  if (defaults !== undefined) {
    for (const [key, dv] of Object.entries(defaults)) {
      if (key in clone) {
        // 一层深合并：对象字段浅合并（series 子字段胜）；标量/数组 series 整体胜（pptd.md §3.4）。
        if (isPlainObject(dv) && isPlainObject(clone[key])) {
          clone[key] = { ...dv, ...clone[key] };
        }
      } else {
        clone[key] = structuredClone(dv);
      }
    }
  }
  delete clone.type;
  const encode = clone.encode as Record<string, string>;
  delete clone.encode;
  // chart.encode 行：通道列名核对（未知列 → import 期 E014 具名拒绝）。
  for (const [channel, col] of Object.entries(encode)) {
    if (!element.data.cols.includes(col)) {
      ctx.issues.push({
        sourceId,
        path: `${at}.encode.${channel}`,
        code: "PPTD-E014",
        message: `encode 通道 "${channel}" 引用未知列 "${col}"（data.cols 不含）`,
      });
      continue;
    }
    if (numericEncodeChannel(series.type, channel)) {
      const ci = element.data.cols.indexOf(col);
      for (const [ri, row] of element.data.rows.entries()) {
        const cell = row[ci];
        if (cell === null || typeof cell === "number") continue;
        if (typeof cell === "string" && cell.trim() !== "" && Number.isFinite(Number(cell))) continue;
        ctx.issues.push({
          sourceId,
          path: `${at}.encode.${channel}`,
          code: "PPTD-E014",
          message: `数值通道 "${channel}" 引用列 "${col}" 第 ${ri} 行值不可解析为数字：${JSON.stringify(cell)}`,
        });
        break;
      }
    }
  }
  const out = { type: series.type, encode, ...clone } as unknown as BentoChartSeriesV4;
  resolveSeriesColors(out, ctx);
  return out;
}

/** series 内 Color $ref 解析（fill/lineColor/areaColor/marker/bars/colorScheme 已知色位）。 */
function resolveSeriesColors(series: BentoChartSeriesV4, ctx: ImportCtx): void {
  const fillVal = (v: unknown): unknown =>
    typeof v === "string"
      ? resolveColor(v, ctx)
      : Array.isArray(v)
        ? v.map(fillVal)
        : isPlainObject(v)
          ? resolveGradientColors(v, ctx)
          : v;
  const s = series as unknown as Raw;
  for (const k of ["fill", "lineColor", "areaColor"] as const) {
    if (s[k] !== undefined) s[k] = fillVal(s[k]);
  }
  if (isPlainObject(s.marker) && s.marker.fill !== undefined) s.marker.fill = fillVal(s.marker.fill);
  for (const k of ["upBars", "downBars", "totalBars", "increaseBars", "decreaseBars"] as const) {
    const bars = s[k];
    if (isPlainObject(bars)) {
      if (bars.fill !== undefined) bars.fill = resolveColor(bars.fill as PptdColor, ctx);
      if (isPlainObject(bars.border) && bars.border.color !== undefined) {
        bars.border.color = resolveColor(bars.border.color as PptdColor, ctx);
      }
    }
  }
  if (Array.isArray(s.colorScheme)) s.colorScheme = (s.colorScheme as unknown[]).map((c) => resolveColor(c as PptdColor, ctx));
  if (isPlainObject(s.wickStyle) && s.wickStyle.color !== undefined) s.wickStyle.color = resolveColor(s.wickStyle.color as PptdColor, ctx);
}

// ---- chart 子结构（已知色位解析） ----

function mapChartAxis(axis: PptdChartAxis, ctx: ImportCtx): BentoChartAxisV4 {
  const out: Raw = {};
  const a = axis as unknown as Raw;
  for (const k of ["show", "type", "min", "max", "reverse"] as const) {
    if (a[k] !== undefined) out[k] = a[k];
  }
  if (axis.title !== undefined) {
    out.title = typeof axis.title === "string" ? axis.title : mapChartTextStyle(axis.title, ctx) as unknown as BentoChartTitleV4;
  }
  if (axis.label !== undefined) {
    out.label =
      typeof axis.label === "boolean"
        ? axis.label
        : mapChartTextStyle(axis.label as PptdChartTextStyle & { numberFormat?: string }, ctx);
  }
  if (axis.axisLine !== undefined) {
    out.axisLine = typeof axis.axisLine === "boolean" ? axis.axisLine : mapChartLineStyleExt(axis.axisLine, ctx);
  }
  if (axis.gridLine !== undefined) {
    out.gridLine = typeof axis.gridLine === "boolean" ? axis.gridLine : mapChartLineStyle(axis.gridLine, ctx);
  }
  return out as unknown as BentoChartAxisV4;
}

function mapChartSpokeAxis(axis: PptdChartSpokeAxis, ctx: ImportCtx): BentoChartSpokeAxisV4 {
  const out: Raw = {};
  const a = axis as unknown as Raw;
  for (const k of ["show", "min", "max"] as const) {
    if (a[k] !== undefined) out[k] = a[k];
  }
  if (axis.label !== undefined) {
    out.label =
      typeof axis.label === "boolean"
        ? axis.label
        : mapChartTextStyle(axis.label as PptdChartTextStyle & { numberFormat?: string }, ctx);
  }
  for (const k of ["axisLine", "gridLine"] as const) {
    const line = a[k];
    if (line === undefined) continue;
    out[k] = typeof line === "boolean" ? line : mapChartLineStyle(line as PptdChartLineStyle, ctx);
  }
  return out as unknown as BentoChartSpokeAxisV4;
}

function mapChartTextStyle(value: object, ctx: ImportCtx): BentoChartTextStyleV4 {
  const v = value as Raw;
  const out: Raw = {};
  if (v.text !== undefined) out.text = v.text;
  if (v.show !== undefined) out.show = v.show;
  if (v.position !== undefined) out.position = v.position;
  if (v.content !== undefined) out.content = v.content;
  if (v.numberFormat !== undefined) out.numberFormat = v.numberFormat;
  if (v.color !== undefined) out.color = resolveColor(v.color as PptdColor, ctx);
  if (v.fontSize !== undefined) out.fontSize = v.fontSize;
  if (v.fontFamily !== undefined) out.fontFamily = v.fontFamily;
  return out as BentoChartTextStyleV4;
}

function mapChartLineStyleExt(value: PptdChartLineStyle & { arrow?: boolean | "start" | "end" | "both" }, ctx: ImportCtx): Raw {
  const out = mapChartLineStyle(value, ctx) as Raw;
  if (value.arrow !== undefined) out.arrow = value.arrow;
  return out;
}

function mapChartLineStyle(value: PptdChartLineStyle, ctx: ImportCtx): Raw {
  const out: Raw = {};
  if (value.style !== undefined) out.style = value.style;
  if (value.color !== undefined) out.color = resolveColor(value.color, ctx);
  if (value.width !== undefined) out.width = value.width;
  return out;
}

// ---- table style（C24 内联解析） ----

function resolveTableStyle(style: string | PptdTableStyle, ctx: ImportCtx): BentoTableStyleV4 {
  const config: PptdTableStyle = typeof style === "string" ? lookupTableStyle(style, ctx.theme) : style;
  const out: Raw = {};
  for (const slot of ["cellStyle", "firstRowStyle", "lastRowStyle", "firstColumnStyle", "lastColumnStyle"] as const) {
    const value = config[slot];
    if (value !== undefined) out[slot] = resolveCellStyle(value, ctx);
  }
  if (config.bodyStyles !== undefined) {
    out.bodyStyles = config.bodyStyles.map((cellStyle) => resolveCellStyle(cellStyle, ctx));
  }
  if (config.rowOverColumn !== undefined) out.rowOverColumn = config.rowOverColumn;
  return out as unknown as BentoTableStyleV4;
}

function resolveCellStyle(style: PptdCellStyle, ctx: ImportCtx): BentoTableCellStyleV4 {
  const out: Raw = {};
  if (style.color !== undefined) out.color = resolveColor(style.color, ctx);
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.fontFamily !== undefined) out.fontFamily = style.fontFamily;
  if (style.bold !== undefined) out.bold = style.bold;
  if (style.italic !== undefined) out.italic = style.italic;
  if (style.backgroundColor !== undefined) out.backgroundColor = resolveColor(style.backgroundColor, ctx);
  if (style.lineHeight !== undefined) out.lineHeight = style.lineHeight;
  if (style.lineHeightPx !== undefined) out.lineHeightPx = style.lineHeightPx;
  if (style.letterSpacing !== undefined) out.letterSpacing = style.letterSpacing;
  if (style.marginTop !== undefined) out.marginTop = style.marginTop;
  if (style.fill !== undefined) out.fill = resolveFill(style.fill, ctx);
  if (style.border !== undefined) out.border = resolveBorderSpec(style.border, ctx);
  if (style.align !== undefined) out.align = [style.align[0], style.align[1]];
  return out as BentoTableCellStyleV4;
}

// ---- 资产 / 字体 ----

function mapFonts(customFonts: PptdManifest["customFonts"], ctx: ImportCtx): BentoFontRegistrationV4[] {
  if (customFonts === undefined) return [];
  const out: BentoFontRegistrationV4[] = [];
  for (const font of customFonts) {
    const asset = ctx.assets[font.src];
    // checkAssets 已核对；不可达守卫。
    if (asset === undefined) throw new Error(`asset index missing for font src "${font.src}"`);
    out.push({
      family: font.family,
      src: asset,
      ...(font.weight !== undefined ? { weight: font.weight } : {}),
      ...(font.style !== undefined ? { style: font.style } : {}),
    });
  }
  return out;
}

// ---- theme `$` 引用解析（唯一解析点） ----

function resolveColor(color: PptdColor, ctx: ImportCtx): BentoColor {
  if (!color.startsWith("$")) return color;
  const resolved = ctx.theme.colors?.[color.slice(1)];
  // validator 的 E008 保证可解析；落空即不变量被破坏。
  if (resolved === undefined) {
    throw new Error(`dangling theme color reference "${color}" in validated document`);
  }
  return resolved;
}

function lookupTextStyle(ref: string, theme: PptdTheme): PptdTextStyle {
  const key = ref.startsWith("$") ? ref.slice(1) : ref;
  const style = theme.textStyles?.[key];
  if (style === undefined) {
    throw new Error(`dangling textStyle reference "${ref}" in validated document`);
  }
  return style;
}

function lookupTableStyle(ref: string, theme: PptdTheme): PptdTableStyle {
  const key = ref.startsWith("$") ? ref.slice(1) : ref;
  const style = theme.tableStyles?.[key];
  if (style === undefined) {
    throw new Error(`dangling tableStyle reference "${ref}" in validated document`);
  }
  return style;
}

function resolveFill(fill: PptdFill, ctx: ImportCtx): BentoFillV4 {
  if (fill.type === "solid") {
    return { type: "solid", color: resolveColor(fill.color, ctx) };
  }
  if (fill.type === "gradient") {
    return resolveGradientColors(fill as unknown as Raw, ctx);
  }
  const asset = ctx.assets[fill.src];
  // checkAssets 已核对；不可达守卫。
  if (asset === undefined) throw new Error(`asset index missing for fill image src "${fill.src}"`);
  return {
    type: "image",
    src: asset,
    // fill 缺省 fit = cover（pptd.md ImageFill），显式写避免默认值分歧。
    fit: fill.fit?.mode ?? "cover",
    ...(fill.crop !== undefined ? { crop: cropToEdges(fill.crop) } : {}),
    ...(fill.opacity !== undefined ? { opacity: fill.opacity } : {}),
  };
}

function resolveTextGradient(gradient: PptdFill, ctx: ImportCtx): BentoLinearGradientFill | BentoRadialGradientFillV4 {
  if (gradient.type !== "gradient") {
    // validator E013 已拒绝 image；不可达守卫。
    throw new Error("text gradient must be GradientFill");
  }
  return resolveGradientColors(gradient as unknown as Raw, ctx);
}

/** GradientFill 对象内 stop 颜色解析（fill / series fill / text gradient 共用尾部）。 */
function resolveGradientColors(value: Raw, ctx: ImportCtx): BentoLinearGradientFill | BentoRadialGradientFillV4 {
  const stops = (value.stops as { position: number; color: PptdColor }[]).map((stop) => ({
    position: stop.position,
    color: resolveColor(stop.color, ctx),
  }));
  if (value.gradientType === "radial") {
    return { type: "gradient", gradientType: "radial", stops };
  }
  const out: BentoLinearGradientFill = { type: "gradient", gradientType: "linear", stops };
  if (value.angle !== undefined) out.angle = value.angle as number;
  return out;
}

/** {left,top,right,bottom} → [l,t,r,b]，缺省分量按 0（image.crop 行 1:1，正=inset 负=outset）。 */
function cropToEdges(crop: { left?: number; top?: number; right?: number; bottom?: number }): [number, number, number, number] {
  return [crop.left ?? 0, crop.top ?? 0, crop.right ?? 0, crop.bottom ?? 0];
}

function resolveShadow(shadow: PptdShadow, ctx: ImportCtx): BentoShadow {
  const out: BentoShadow = { blur: shadow.blur, color: resolveColor(shadow.color, ctx) };
  if (shadow.offset !== undefined) out.offset = [shadow.offset[0], shadow.offset[1]];
  return out;
}

function resolveBorder(border: PptdBorder, ctx: ImportCtx): BentoBorder {
  const out: BentoBorder = {};
  if (border.style !== undefined) out.style = border.style;
  if (border.width !== undefined) out.width = border.width;
  if (border.color !== undefined) out.color = resolveColor(border.color, ctx);
  return out;
}

function resolveBorderSpec(spec: PptdBorderSpec, ctx: ImportCtx): BentoCellBorderV4 {
  if (spec === null) return null;
  if (!Array.isArray(spec)) return resolveBorder(spec, ctx);
  return spec.map((side) => (side === null ? null : resolveBorder(side, ctx))) as BentoBorderSpecV4;
}

// ---- 小工具 ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Raw = Record<string, unknown>;
