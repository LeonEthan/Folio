import { isStaticV1LatexSource } from "./contracts.ts";
import temml from "temml";

/** The authoring-time syntax seam uses the same pinned Temml release and
 * security configuration as the sealed renderer. Contracts owns the canonical
 * value grammar; this module owns host syntax only. */
export function staticV1LatexSyntaxError(source: unknown): string | null {
  if (!isStaticV1LatexSource(source)) return "latex must be non-empty and have no surrounding whitespace";
  try {
    const mathml = temml.renderToString(source, {
      throwOnError: true,
      trust: false,
    });
    if (!/^<math(?:\s|>)/.test(mathml) || !mathml.includes("</math>")) {
      return "Temml did not produce a MathML root";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
