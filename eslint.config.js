import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='split'][arguments.0.value='/']",
          message:
            "Avoid split('/') for path operations. Use path.basename() or path.dirname() from 'shared/platform.ts'. If this is not a path operation (e.g., URL parsing), add // eslint-disable-next-line no-restricted-syntax",
        },
        {
          selector: "CallExpression[callee.property.name='lastIndexOf'][arguments.0.value='/']",
          message:
            "Avoid lastIndexOf('/') for path operations. Use path.dirname() from 'shared/platform.ts'. If intentional, add // eslint-disable-next-line no-restricted-syntax",
        },
        {
          selector: "CallExpression[callee.property.name='indexOf'][arguments.0.value='/']",
          message:
            "Avoid indexOf('/') for path operations. Use path utilities from 'shared/platform.ts'. If intentional, add // eslint-disable-next-line no-restricted-syntax",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "preserve-caught-error": "off",
      "no-case-declarations": "off",
      "prefer-const": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "**/*.test.ts", "**/*.test.js", "scripts/", "*.config.*"],
  }
);
