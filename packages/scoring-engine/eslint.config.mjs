import { baseConfig } from "@cricket/config/eslint";

export default [
	...baseConfig({ node: true }),
	{
		// The engine must stay pure and portable: no I/O, no platform APIs (ADR-0006).
		files: ["src/**/*.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["node:*", "fs", "path", "react", "next", "next/*"],
							message: "The engine must not depend on I/O or frameworks.",
						},
					],
				},
			],
			"no-restricted-globals": [
				"error",
				"Date",
				"process",
				"window",
				"document",
				"fetch",
				"setTimeout",
			],
			"no-restricted-properties": [
				"error",
				{ object: "Math", property: "random", message: "The engine must be deterministic." },
			],
		},
	},
];
