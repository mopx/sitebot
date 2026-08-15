// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/worker-configuration.d.ts",
      "**/public/widget.js",
    ],
  },
  js.configs.recommended,
  {
    // Plain Node.js scripts (build tooling, this config file itself).
    files: ["**/*.mjs", "**/*.cjs", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
      // Workers globals (crypto, fetch, DurableObjectState, D1Database, ...)
      // and DOM globals (document, HTMLElement, ...) both come from
      // @cloudflare/workers-types and lib.dom.d.ts respectively — `tsc` (run
      // separately via `type-check`) already verifies every identifier
      // against those. `no-undef` can't see ambient .d.ts globals and
      // produces wall-to-wall false positives on this codebase, so it's
      // off for .ts files; it stays on for the plain-JS files above.
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off",
      "no-console": "off",
    },
  },
  {
    // Declaration-merging pattern (`declare module "cloudflare:test" { interface ProvidedEnv extends Env {} }`)
    // is how @cloudflare/vitest-pool-workers' typing hook works — an
    // intentionally "empty" interface, not a mistake.
    files: ["**/env.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];
