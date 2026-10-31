import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveOptions, splitOption } from "./options.js";
import type { OptionGroup } from "./provider.js";

const groups: OptionGroup[] = [
  {
    name: "Size",
    required: true,
    min: 1,
    max: 1,
    choices: [
      { name: "Regular", price: 0 },
      { name: "Large", price: 700 },
    ],
  },
  {
    name: "Extras",
    required: false,
    min: 0,
    max: 2,
    choices: [
      { name: "Cheese", price: 500 },
      { name: "Bacon", price: 800 },
      { name: "Large", price: 100 }, // same name as a Size choice
    ],
  },
];

test("resolves picks, sums prices and orders by menu", () => {
  const r = resolveOptions("Burger", groups, ["Extras=bacon", "Size=Regular", "cheese"]);
  assert.deepEqual(r.canonical, ["Size=Regular", "Extras=Bacon", "Extras=Cheese"]);
  assert.equal(r.delta, 1300);
});

test("matching ignores case and extra spaces", () => {
  assert.deepEqual(resolveOptions("Burger", groups, ["  size = Regular "]).canonical, ["Size=Regular"]);
});

test("a missing required group lists the choices", () => {
  assert.throws(() => resolveOptions("Burger", groups, []), /needs a choice for "Size": Regular, Large \(\+₦700\)/);
});

test("an unknown option is rejected", () => {
  assert.throws(() => resolveOptions("Burger", groups, ["Size=Huge"]), /has no option "Size=Huge"/);
});

test("an option that exists in two groups must name its group", () => {
  assert.throws(() => resolveOptions("Burger", groups, ["Large"]), /several groups \(Size, Extras\)/);
  assert.equal(resolveOptions("Burger", groups, ["Size=Large"]).delta, 700);
});

test("too many picks in a group are rejected", () => {
  assert.throws(
    () => resolveOptions("Burger", groups, ["Size=Regular", "Cheese", "Bacon", "Extras=Large"]),
    /"Extras" allows at most 2 choices, got 3/,
  );
  assert.throws(() => resolveOptions("Burger", groups, ["Size=Regular", "Size=Large"]), /"Size" allows at most 1 choice, got 2/);
});

test("the same option twice is rejected", () => {
  assert.throws(() => resolveOptions("Burger", groups, ["Size=Regular", "Extras=Cheese", "Cheese"]), /given twice/);
});

test("an item with no groups accepts no options", () => {
  assert.deepEqual(resolveOptions("Water", [], []), { canonical: [], delta: 0 });
  assert.throws(() => resolveOptions("Water", [], ["Ice"]), /has no option "Ice"/);
});

test("splitOption splits at the first equals sign", () => {
  assert.deepEqual(splitOption("Size=Large"), { group: "Size", choice: "Large" });
});
