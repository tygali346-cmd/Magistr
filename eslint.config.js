import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "client/**",
      "server/**",
      "shared/**",
      "scripts/**",
      "data/**",
      "drizzle/**",
      "patches/**",
      "DRAFT_firestore.rules",
      "*.ts",
      "*.js",
      "*.mjs",
      "*.cjs",
    ],
  },
  firebaseRulesPlugin.configs["flat/recommended"],
];
