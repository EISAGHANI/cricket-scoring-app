// Shared flat ESLint config for non-Next packages (engine, schemas, db, services).
// apps/web extends eslint-config-next instead and adds the same TS strictness rules.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @param {{ node?: boolean }} [options] */
export function baseConfig(options = {}) {
	return tseslint.config(
		{ ignores: ["dist/**", "coverage/**", ".turbo/**", "node_modules/**"] },
		js.configs.recommended,
		...tseslint.configs.strict,
		{
			languageOptions: {
				globals: options.node ? globals.node : {},
			},
			rules: {
				// `any` is allowed only with an inline eslint-disable comment justifying it.
				"@typescript-eslint/no-explicit-any": "error",
				"@typescript-eslint/consistent-type-imports": "error",
				"@typescript-eslint/no-unused-vars": [
					"error",
					{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
				],
			},
		},
		{
			// Tests and dev tools may assert presence with `!`; source code may not.
			files: ["**/*.test.ts", "**/test/**/*.ts", "**/tools/**/*.ts"],
			rules: { "@typescript-eslint/no-non-null-assertion": "off" },
		},
		prettier,
	);
}
