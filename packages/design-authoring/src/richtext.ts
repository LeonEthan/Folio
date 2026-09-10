/**
 * 富文本语法模块（GD-4b Wave B2：上游 pptd.md "Rich Text Rules" 的单点实现，
 * validate 与 import 共用——一个含义一个地方）。
 *
 * 语法（skills/graphic-design/references/pptd.md "Rich Text Rules"，matrix
 * text.plain/paragraphs/lineBreak/text.runs.* 各行与 bold/italic/underline/
 * strikethrough/sup/sub/hyperlink/lists/listItemStyles/latex 各行）：
 * - 块级：<p>（style: text-align / line-height / margin-top / margin-left /
 *   margin-right）、<ul>/<ol>/<li>（li style 另含 letter-spacing / list-style*）、
 *   <br/>（段内换行 → run text 内 "\n"）；
 * - 行内：<span style="color / font-size / font-family / background-color">、
 *   <strong>/<b>、<em>/<i>、<u>、<s>、<sup>、<sub>、<a href>（scheme 白名单
 *   https/http/mailto）；
 * - LaTeX：\(...\) 公式（公式体内不允许任何标签；仅继承 color/font-size）；
 * - 纯文本简写：无任何标签时按 "\n" 切段（≡ 逐行 <p>）。
 *
 * fail closed 决策（stricter readings，均注 capabilityId）：
 * - 富文本模式（存在任何标签）下，顶层散文本/裸 <br/> → 拒绝（text.paragraphs 行
 *   只承诺 <p>/列表块级结构）；
 * - '<' 不构成合法标签 → 拒绝（无法与字面 '<' 消歧；text.plain 行的 plain 语义
 *   只属于无标签文本）；
 * - 标签只允许 style/href 属性；style 属性词表外的属性/值形态（含 <p> 上的
 *   letter-spacing、list-style-position/image、font-size 非 px）→ 拒绝
 *   （text.listItemStyles/paragraphLineHeight/paragraphMargin 行的精确词表）；
 * - 嵌套列表、块级标签互嵌 → 拒绝（上游无此语义）。
 * 颜色 hex/$ref 合法性与字体登记（E012）不在此处判定——本模块只管语法结构，
 * 语义值校验在 validate.ts。零依赖（contracts 类型为 types-only import）。
 */

import { parseLineHeightValue } from "./contracts.ts";
import type { BentoHorizontalAlignV4, BentoTextParagraphV4 } from "./contracts.ts";

export type RichTextParseResult =
  | { ok: true; paragraphs: BentoTextParagraphV4[] }
  | { ok: false; reason: string };

const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/;
const PX_RE = /^([-+]?\d+(?:\.\d+)?)px$/;
const H_ALIGN = new Set<string>(["left", "center", "right", "justify", "distributed"]);
const HREF_SCHEMES = new Set<string>(["https:", "http:", "mailto:"]);

type Tok =
  | { kind: "text"; text: string }
  | { kind: "formula"; body: string }
  | { kind: "tag"; name: string; closing: boolean; attrs: string };

interface Attrs {
  style?: string;
  href?: string;
}

interface InlineFrame {
  __tag: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  baselineShift?: "sup" | "sub";
  href?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: string;
}

interface ListDraft {
  ordered?: boolean;
  marker?: string;
  style?: {
    align?: BentoHorizontalAlignV4;
    lineHeight?: number | `${number}px`;
    letterSpacing?: number;
    marginTop?: number;
    marginLeft?: number;
    marker?: string;
  };
}

interface ParagraphDraft {
  runs: BentoTextParagraphV4["runs"];
  align?: BentoHorizontalAlignV4;
  lineHeight?: number | `${number}px`;
  margin?: { top?: number; left?: number; right?: number };
  list?: ListDraft;
}

const fail = (reason: string): RichTextParseResult => ({ ok: false, reason });

/** 主入口：PPTD content.text / Cell.text → canonical 段落结构（或具名拒绝原因）。 */
export function parseRichText(raw: string): RichTextParseResult {
  let tokens: Tok[];
  try {
    tokens = tokenize(raw);
  } catch (error) {
    return fail((error as Error).message);
  }
  const hasTags = tokens.some((t) => t.kind === "tag");
  if (!hasTags) return { ok: true, paragraphs: parsePlain(raw) };
  const parser = new RichParser(tokens);
  try {
    return { ok: true, paragraphs: parser.parseBlocks() };
  } catch (error) {
    return fail((error as Error).message);
  }
}

// ---- 词法 ----

function tokenize(raw: string): Tok[] {
  const tokens: Tok[] = [];
  let text = "";
  let i = 0;
  const flush = (): void => {
    if (text.length > 0) {
      tokens.push({ kind: "text", text });
      text = "";
    }
  };
  while (i < raw.length) {
    if (raw.startsWith("\\(", i)) {
      const end = raw.indexOf("\\)", i + 2);
      if (end === -1) throw new Error("LaTeX 公式缺少 \\) 结束符");
      const body = raw.slice(i + 2, end);
      if (body.includes("<")) throw new Error("LaTeX 公式体内不允许富文本标签");
      flush();
      tokens.push({ kind: "formula", body });
      i = end + 2;
      continue;
    }
    if (raw[i] === "<") {
      const match = TAG_RE.exec(raw.slice(i));
      if (!match) throw new Error(`无法解析的 "<"（不是合法标签）`);
      flush();
      tokens.push({
        kind: "tag",
        name: match[2]!.toLowerCase(),
        closing: match[1] === "/",
        attrs: match[3] ?? "",
      });
      i += match[0].length;
      continue;
    }
    text += raw[i];
    i += 1;
  }
  flush();
  return tokens;
}

function parseAttrs(attrs: string, tag: string): Attrs {
  const out: Attrs = {};
  let i = 0;
  while (i < attrs.length) {
    while (i < attrs.length && /\s/.test(attrs[i]!)) i += 1;
    if (i >= attrs.length) break;
    let name = "";
    while (i < attrs.length && /[^\s=]/.test(attrs[i]!)) name += attrs[i++];
    while (i < attrs.length && /\s/.test(attrs[i]!)) i += 1;
    if (attrs[i] !== "=") throw new Error(`<${tag}> 属性 "${name}" 缺少值（只允许 style/href）`);
    i += 1;
    while (i < attrs.length && /\s/.test(attrs[i]!)) i += 1;
    const quote = attrs[i];
    let value = "";
    if (quote === '"' || quote === "'") {
      i += 1;
      const end = attrs.indexOf(quote, i);
      if (end === -1) throw new Error(`<${tag}> 属性 "${name}" 引号未闭合`);
      value = attrs.slice(i, end);
      i = end + 1;
    } else {
      while (i < attrs.length && /[^\s]/.test(attrs[i]!)) value += attrs[i++];
    }
    if (name === "style" || name === "href") {
      out[name] = value;
    } else {
      throw new Error(`<${tag}> 属性 "${name}" 不在子集（只允许 style/href）`);
    }
  }
  return out;
}

// ---- 纯文本简写（无标签；公式允许）：逐行切段 ----

function parsePlain(raw: string): BentoTextParagraphV4[] {
  return raw.split("\n").map((line) => ({ runs: lineToRuns(line) }));
}

/** 单行 → 公式/文本 run 序列（空行 = 单个空 run 段）。 */
function lineToRuns(line: string): BentoTextParagraphV4["runs"] {
  const runs: BentoTextParagraphV4["runs"] = [];
  let buffer = "";
  let rest = line;
  while (rest.length > 0) {
    if (rest.startsWith("\\(")) {
      const end = rest.indexOf("\\)", 2);
      if (end !== -1 && !rest.slice(2, end).includes("<")) {
        if (buffer.length > 0) {
          runs.push({ text: buffer });
          buffer = "";
        }
        runs.push({ text: "", latex: rest.slice(2, end) });
        rest = rest.slice(end + 2);
        continue;
      }
    }
    buffer += rest[0];
    rest = rest.slice(1);
  }
  if (buffer.length > 0) runs.push({ text: buffer });
  if (runs.length === 0) runs.push({ text: "" });
  return runs;
}

// ---- 富文本结构解析（共享游标） ----

class RichParser {
  private i = 0;
  private stack: InlineFrame[] = [];
  private readonly tokens: Tok[];

  constructor(tokens: Tok[]) {
    this.tokens = tokens;
  }

  parseBlocks(): BentoTextParagraphV4[] {
    const paragraphs: ParagraphDraft[] = [];
    while (this.i < this.tokens.length) {
      const tok = this.tokens[this.i++];
      if (tok === undefined) break; // unreachable under the length guard; satisfies noUncheckedIndexedAccess
      if (tok.kind === "text") {
        if (tok.text.trim().length > 0) {
          throw new Error("富文本模式下不允许 <p>/<ul>/<ol> 之外的散文本");
        }
        continue; // 块级标签之间的空白
      }
      if (tok.kind === "formula") {
        throw new Error("富文本模式下公式必须位于 <p> 或 <li> 内");
      }
      if (!tok.closing) {
        if (tok.name === "p") {
          const draft: ParagraphDraft = { runs: [] };
          this.applyParagraphStyle(draft, parseAttrs(tok.attrs, "p").style);
          this.consumeInline(draft, "p");
          paragraphs.push(finishParagraph(draft));
          continue;
        }
        if (tok.name === "ul" || tok.name === "ol") {
          this.consumeList(tok.name === "ol", paragraphs);
          continue;
        }
        throw new Error(`<${tok.name}> 不允许出现在块级上下文（只允许 <p>/<ul>/<ol>）`);
      }
      throw new Error(`多余的闭合标签 </${tok.name}>`);
    }
    return paragraphs.map(finishParagraph);
  }

  /** 消费 <p>|<li> 的行内内容，直到匹配的闭合标签（起始标签已消费）。 */
  private consumeInline(draft: ParagraphDraft, root: "p" | "li"): void {
    while (true) {
      const tok = this.tokens[this.i++];
      if (tok === undefined) throw new Error(`<${root}> 未闭合`);
      if (tok.kind === "text") {
        this.pushRun(draft, { text: tok.text });
        continue;
      }
      if (tok.kind === "formula") {
        // 公式仅继承 color/font-size（pptd.md Rich Text Rules）。
        const frame = this.top();
        this.pushRun(draft, {
          text: "",
          latex: tok.body,
          ...(frame.color !== undefined ? { color: frame.color } : {}),
          ...(frame.fontSize !== undefined ? { fontSize: frame.fontSize } : {}),
        });
        continue;
      }
      if (tok.name === "br") {
        if (tok.closing) throw new Error("</br> 不是合法标签");
        this.pushRun(draft, { text: "\n" });
        continue;
      }
      if (tok.closing) {
        if (tok.name === root) {
          if (this.stack.length > 0) {
            throw new Error(`<${root}> 内存在未闭合的行内标签`);
          }
          return;
        }
        const frame = this.stack.pop();
        if (frame === undefined || frame.__tag !== tok.name) {
          throw new Error(`</${tok.name}> 与开启标签不匹配`);
        }
        continue;
      }
      switch (tok.name) {
        case "span": {
          const frame: InlineFrame = { __tag: "span" };
          this.applySpanStyle(frame, parseAttrs(tok.attrs, "span").style);
          this.stack.push(frame);
          break;
        }
        case "strong":
        case "b":
          this.stack.push({ __tag: tok.name, bold: true });
          break;
        case "em":
        case "i":
          this.stack.push({ __tag: tok.name, italic: true });
          break;
        case "u":
          this.stack.push({ __tag: "u", underline: true });
          break;
        case "s":
          this.stack.push({ __tag: "s", strikethrough: true });
          break;
        case "sup":
          this.stack.push({ __tag: "sup", baselineShift: "sup" });
          break;
        case "sub":
          this.stack.push({ __tag: "sub", baselineShift: "sub" });
          break;
        case "a": {
          const href = parseAttrs(tok.attrs, "a").href;
          if (href === undefined) throw new Error("<a> 缺少 href 属性");
          if (!schemeAllowed(href)) {
            throw new Error(`<a href> scheme 不在白名单（https/http/mailto）`);
          }
          this.stack.push({ __tag: "a", href });
          break;
        }
        default:
          throw new Error(`<${tok.name}> 不允许出现在 <${root}> 内`);
      }
    }
  }

  private consumeList(ordered: boolean, paragraphs: ParagraphDraft[]): void {
    const closeTag = ordered ? "ol" : "ul";
    while (true) {
      const tok = this.tokens[this.i++];
      if (tok === undefined) throw new Error(`<${closeTag}> 未闭合`);
      if (tok.kind === "text") {
        if (tok.text.trim().length > 0) {
          throw new Error("列表内不允许 <li> 之外的散文本");
        }
        continue;
      }
      if (tok.kind === "formula") throw new Error("列表内公式必须位于 <li> 内");
      if (tok.closing && tok.name === closeTag) {
        if (this.stack.length > 0) throw new Error("列表闭合时存在未闭合的行内标签");
        return;
      }
      if (!tok.closing && tok.name === "li") {
        const draft: ParagraphDraft = { runs: [], list: ordered ? { ordered: true } : {} };
        this.applyListItemStyle(draft, parseAttrs(tok.attrs, "li").style);
        this.consumeInline(draft, "li");
        paragraphs.push(finishParagraph(draft));
        continue;
      }
      throw new Error(`<${closeTag}> 内只允许 <li>（嵌套列表不在子集）`);
    }
  }

  private top(): InlineFrame {
    return this.stack[this.stack.length - 1] ?? { __tag: "" };
  }

  private pushRun(draft: ParagraphDraft, run: BentoTextParagraphV4["runs"][number]): void {
    if (run.text.length === 0 && run.latex === undefined) return;
    const frame = this.top();
    if (frame.bold) run.bold = true;
    if (frame.italic) run.italic = true;
    if (frame.underline) run.underline = true;
    if (frame.strikethrough) run.strikethrough = true;
    if (frame.baselineShift) run.baselineShift = frame.baselineShift;
    if (frame.href !== undefined) run.href = frame.href;
    if (frame.color !== undefined) run.color = frame.color;
    if (frame.fontSize !== undefined) run.fontSize = frame.fontSize;
    if (frame.fontFamily !== undefined) run.fontFamily = frame.fontFamily;
    if (frame.backgroundColor !== undefined) run.backgroundColor = frame.backgroundColor;
    // 同帧相邻 run 合并（<br/> 产生的 "\n" 分段保持同帧可合并性）。
    const last = draft.runs[draft.runs.length - 1];
    if (last !== undefined && run.latex === undefined && sameStyle(last, run)) {
      last.text += run.text;
      return;
    }
    draft.runs.push(run);
  }

  private applyParagraphStyle(draft: ParagraphDraft, style: string | undefined): void {
    if (style === undefined) return;
    for (const decl of style.split(";")) {
      if (decl.trim().length === 0) continue;
      const colon = decl.indexOf(":");
      if (colon === -1) throw new Error(`<p style> 声明 "${decl.trim()}" 缺少冒号`);
      const prop = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      switch (prop) {
        case "text-align":
          if (!H_ALIGN.has(value)) throw new Error(`text-align 值 "${value}" 不在词表`);
          draft.align = value as BentoHorizontalAlignV4;
          break;
        case "line-height":
          draft.lineHeight = parseLineHeight(value);
          break;
        case "margin-top":
          draft.margin = { ...draft.margin, top: parsePx(value, prop) };
          break;
        case "margin-left":
          draft.margin = { ...draft.margin, left: parsePx(value, prop) };
          break;
        case "margin-right":
          draft.margin = { ...draft.margin, right: parsePx(value, prop) };
          break;
        default:
          throw new Error(`<p style> 属性 "${prop}" 不在词表（letter-spacing 请用 content 级字段）`);
      }
    }
  }

  private applyListItemStyle(draft: ParagraphDraft, style: string | undefined): void {
    if (style === undefined) return;
    const list = draft.list!;
    for (const decl of style.split(";")) {
      if (decl.trim().length === 0) continue;
      const colon = decl.indexOf(":");
      if (colon === -1) throw new Error(`<li style> 声明 "${decl.trim()}" 缺少冒号`);
      const prop = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      switch (prop) {
        case "text-align":
          if (!H_ALIGN.has(value)) throw new Error(`text-align 值 "${value}" 不在词表`);
          list.style = { ...list.style, align: value as BentoHorizontalAlignV4 };
          break;
        case "line-height":
          list.style = { ...list.style, lineHeight: parseLineHeight(value) };
          break;
        case "letter-spacing":
          list.style = { ...list.style, letterSpacing: parsePx(value, prop) };
          break;
        case "margin-top":
          list.style = { ...list.style, marginTop: parsePx(value, prop) };
          break;
        case "margin-left":
          list.style = { ...list.style, marginLeft: parsePx(value, prop) };
          break;
        case "list-style-type":
          list.style = { ...list.style, marker: value };
          break;
        case "list-style":
          // list-style 简写仅接受单 token marker 关键词（position/image 形态不在子集）。
          if (/\s/.test(value) || value.includes("url(")) {
            throw new Error("list-style 简写仅支持单一 marker 关键词（list-style-position/image 不在子集）");
          }
          list.style = { ...list.style, marker: value };
          break;
        default:
          throw new Error(`<li style> 属性 "${prop}" 不在词表`);
      }
    }
  }

  private applySpanStyle(frame: InlineFrame, style: string | undefined): void {
    if (style === undefined) return;
    for (const decl of style.split(";")) {
      if (decl.trim().length === 0) continue;
      const colon = decl.indexOf(":");
      if (colon === -1) throw new Error(`<span style> 声明 "${decl.trim()}" 缺少冒号`);
      const prop = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      switch (prop) {
        case "color":
          frame.color = value;
          break;
        case "background-color":
          frame.backgroundColor = value;
          break;
        case "font-size":
          frame.fontSize = parsePx(value, prop);
          break;
        case "font-family":
          frame.fontFamily = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
          break;
        default:
          throw new Error(`<span style> 属性 "${prop}" 不在词表`);
      }
    }
  }
}

function schemeAllowed(href: string): boolean {
  const colon = href.indexOf(":");
  if (colon === -1) return false;
  return HREF_SCHEMES.has(href.slice(0, colon + 1).toLowerCase());
}

function parseLineHeight(value: string): number | `${number}px` {
  const parsed = parseLineHeightValue(value);
  if (parsed !== undefined) return parsed;
  throw new Error(`line-height 值 "${value}" 非法（无单位倍数或 px）`);
}

function parsePx(value: string, prop: string): number {
  const match = PX_RE.exec(value);
  if (!match) throw new Error(`${prop} 值 "${value}" 非法（必须为 px）`);
  return Number(match[1]);
}

function finishParagraph(draft: ParagraphDraft): BentoTextParagraphV4 {
  const out: BentoTextParagraphV4 = { runs: draft.runs };
  if (draft.align !== undefined) out.align = draft.align;
  if (draft.lineHeight !== undefined) out.lineHeight = draft.lineHeight;
  if (draft.margin !== undefined) out.margin = draft.margin;
  if (draft.list !== undefined) {
    const { style, ...rest } = draft.list;
    out.list = {
      ...rest,
      ...(style !== undefined && Object.keys(style).length > 0 ? { style } : {}),
    };
  }
  return out;
}

const STYLE_KEYS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "baselineShift",
  "href",
  "color",
  "fontSize",
  "fontFamily",
  "backgroundColor",
] as const;

function sameStyle(
  a: BentoTextParagraphV4["runs"][number],
  b: BentoTextParagraphV4["runs"][number],
): boolean {
  return STYLE_KEYS.every((k) => a[k] === b[k]);
}
