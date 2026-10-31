// Validates the options a user picks for a menu item against the groups the vendor offers.
import type { OptionGroup } from "./provider.js";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface ResolvedOptions {
  /** Canonical "Group=Choice" strings, in menu order. */
  canonical: string[];
  /** Extra naira the choices add to one unit. */
  delta: number;
}

/**
 * Turns picks like "Cheese" or "Extras=Cheese" into canonical "Group=Choice" strings and checks
 * the group rules (unknown or ambiguous choices, too many picks, missing required groups).
 */
export function resolveOptions(item: string, groups: OptionGroup[], wanted: string[]): ResolvedOptions {
  const picked = new Map<number, string[]>();
  let delta = 0;

  for (const w of wanted) {
    const eq = w.indexOf("=");
    const group = eq >= 0 ? norm(w.slice(0, eq)) : "";
    const choice = norm(eq >= 0 ? w.slice(eq + 1) : w);
    const hits: Array<[number, number]> = [];
    groups.forEach((g, gi) => {
      if (group && norm(g.name) !== group) return;
      g.choices.forEach((c, ci) => {
        if (norm(c.name) === choice) hits.push([gi, ci]);
      });
    });
    if (hits.length === 0) {
      throw new Error(`"${item}" has no option "${w}"; list them with \`chowdeck options VENDOR_ID ITEM_ID\``);
    }
    if (hits.length > 1) {
      const names = hits.map(([gi]) => groups[gi]!.name).join(", ");
      throw new Error(`option "${w}" exists in several groups (${names}); write it as "Group=${w}"`);
    }
    const [gi, ci] = hits[0]!;
    const c = groups[gi]!.choices[ci]!;
    const list = picked.get(gi) ?? [];
    if (list.includes(c.name)) throw new Error(`option "${w}" was given twice`);
    picked.set(gi, [...list, c.name]);
    delta += c.price;
  }

  groups.forEach((g, gi) => {
    const n = picked.get(gi)?.length ?? 0;
    if (n > g.max) throw new Error(`"${item}": "${g.name}" allows at most ${g.max} choice${g.max === 1 ? "" : "s"}, got ${n}`);
    if (g.required && n < Math.max(g.min, 1)) {
      const list = g.choices.map((c) => c.name + (c.price ? ` (+₦${c.price})` : "")).join(", ");
      throw new Error(`"${item}" needs ${g.max === 1 ? "a choice" : `${g.min} choices`} for "${g.name}": ${list}`);
    }
  });

  const canonical: string[] = [];
  groups.forEach((g, gi) => (picked.get(gi) ?? []).forEach((n) => canonical.push(`${g.name}=${n}`)));
  return { canonical, delta };
}

/** Parses "Group=Choice" back into its parts. */
export function splitOption(spec: string): { group: string; choice: string } {
  const eq = spec.indexOf("=");
  return { group: spec.slice(0, eq), choice: spec.slice(eq + 1) };
}
