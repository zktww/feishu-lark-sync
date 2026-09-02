import obsidianmd from "eslint-plugin-obsidianmd";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "main.js",
      "data*",
      "note-backup-*",
      "tests/**",
      "scripts/**",
      "docs/**",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
  },
  prettier,
];
