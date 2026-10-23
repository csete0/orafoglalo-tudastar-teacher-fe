// @ts-check
// Lint a tanári apphoz (FE-refaktor E csomag, 2026-10-23).
// Szándékosan szűk szabálykészlet: a refaktor-terv őrkorlátai, nem teljes "recommended" stílus-átírás.
// Minden szabály error (a Z csomag a kitakarítás után a korábbi warningokat is error-ra állította).
// Megjegyzés: a `template/no-any` a `+$any(...)` és az `$any(...).value = ''` alakot nem jelzi,
// ezekre a metrikaszkript `$any` grepje az őr.
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig(
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@angular-eslint': angular.tsPlugin,
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@angular-eslint/prefer-signals': 'error',
      // Zoneless változásérzékelés: minden komponens OnPush.
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      // A `tab` alias a `?tab=` query-paraméter kötése (withComponentInputBinding), a név ott kötött.
      '@angular-eslint/no-input-rename': ['error', { allowedNames: ['tab'] }],
      '@angular-eslint/use-lifecycle-interface': 'error',
    },
  },
  {
    files: ['src/**/*.html'],
    languageOptions: {
      parser: angular.templateParser,
    },
    plugins: {
      '@angular-eslint/template': angular.templatePlugin,
    },
    rules: {
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
);
