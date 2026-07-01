#!/usr/bin/env node
/**
 * validate_locations.js — validate locations.json against the zod Location[] schema.
 *
 * Imports the compiled schema from memove/shared/dist/index.cjs (the built @memove/shared
 * package). Run `pnpm build` in memove/shared/ first if the schema has changed.
 *
 * Usage:
 *   node scripts/validate_locations.js
 *   # -> prints validation results, exits 0 on success / 1 on failure
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");
const { locationSchema } = require("../memove/shared/dist/index.cjs");
const { z } = require("zod");

const REPO_ROOT = resolve(__dirname, "..");
const LOCATIONS_PATH = resolve(
  REPO_ROOT,
  "sources/processed/relocation/locations.json",
);

function main() {
  console.log("=== validate_locations.js — zod schema validation ===\n");

  const raw = readFileSync(LOCATIONS_PATH, "utf-8");
  const data = JSON.parse(raw);
  console.log(
    `Loaded ${data.length} locations from sources/processed/relocation/locations.json`,
  );

  const arraySchema = z.array(locationSchema);
  const result = arraySchema.safeParse(data);

  if (result.success) {
    console.log(
      `\n\u2705 VALIDATION PASSED \u2014 all ${data.length} locations conform to the schema`,
    );
    const sample = result.data[0];
    console.log(`\nSample location: ${sample.name} (${sample.id})`);
    console.log(`  totalScore: ${sample.blended.totalScore0to100}`);
    console.log(
      `  medianHomeValue: $${sample.cost.medianHomeValue.toLocaleString()}`,
    );
    process.exit(0);
  } else {
    console.error(
      `\n\u274c VALIDATION FAILED \u2014 ${result.error.issues.length} issues\n`,
    );

    // Group issues by path for readability
    const byPath = {};
    for (const issue of result.error.issues) {
      const pathStr = issue.path.join(".") || "(root)";
      if (!byPath[pathStr]) byPath[pathStr] = [];
      byPath[pathStr].push(issue);
    }

    let shown = 0;
    for (const [pathStr, issues] of Object.entries(byPath)) {
      if (shown >= 20) {
        console.error(
          `  ... and ${result.error.issues.length - shown} more issues\n`,
        );
        break;
      }
      console.error(`  Path: ${pathStr} (${issues.length} issue(s))`);
      for (const issue of issues.slice(0, 3)) {
        console.error(`    [${issue.code}] ${issue.message}`);
      }
      if (issues.length > 3) {
        console.error(`    ... and ${issues.length - 3} more`);
      }
      shown += Math.min(issues.length, 3);
      console.error();
    }

    process.exit(1);
  }
}

main();
