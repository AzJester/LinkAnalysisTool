import test from "node:test";
import assert from "node:assert/strict";
import { parseProfileCsv, csvCell } from "../src/files.mjs";

test("CSV profile parses explicit SI columns and BOM", () => {
  assert.deepEqual(
    parseProfileCsv(
      "\uFEFFdistance_m,elevation_m\r\n0,100\r\n100,105\r\n200,102",
    ),
    [
      { distance_m: 0, elevation_m: 100 },
      { distance_m: 100, elevation_m: 105 },
      { distance_m: 200, elevation_m: 102 },
    ],
  );
});
test("CSV rejects empty cells, duplicate distances, missing units and nonfinite values", () => {
  for (const text of [
    "distance,elevation\n0,100\n1,101\n2,102",
    "distance_m,elevation_m\n0,100\n0,101\n2,102",
    "distance_m,elevation_m\n0,100\n1,\n2,102",
    "distance_m,elevation_m\n0,100\n1,Infinity\n2,102",
  ])
    assert.throws(() => parseProfileCsv(text));
});
test("spreadsheet formulas in labels are escaped while numeric losses stay numeric", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell(-85), '"-85"');
  assert.equal(csvCell("ridge, east"), '"ridge, east"');
});
