import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    { ignores: ["dist/**", "node_modules/**"] },

    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,

    // Type-aware linting needs a program for every TypeScript file it sees,
    // including the config files at the repo root.
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Allow deliberately unused args/vars when prefixed with an
            // underscore, and allow the `const { omitted, ...rest }` idiom.
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            // Only demand `const` when every binding in a destructuring
            // pattern can be const; mixed patterns stay `let`.
            "prefer-const": ["error", { destructuring: "all" }],
        },
    },

    // Test helpers stub browser APIs, which means casting through shapes that
    // deliberately do not match the real DOM types.
    {
        files: ["test/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-call": "off",
        },
    },

    // Build config files are plain ESM, linted without type information.
    {
        files: ["**/*.js"],
        ...tseslint.configs.disableTypeChecked,
    },

    // Must stay last so formatting-related rules defer to Prettier.
    prettier,
);
