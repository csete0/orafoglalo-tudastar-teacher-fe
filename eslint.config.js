// @ts-check
// Lint a tanári apphoz (FE-refaktor E csomag, 2026-10-23).
// Szándékosan szűk szabálykészlet: a refaktor-terv őrkorlátai, nem teljes "recommended" stílus-átírás.
// A már tiszta szabályok error-ok; a `no-explicit-any` / `template/no-any` / `prefer-signals` /
// `prefer-on-push-component-change-detection` warn, ezeket a Z csomag állítja error-ra, amikor a
// csomagok kitakarították az előfordulásokat. Megjegyzés: a `template/no-any` a `+$any(...)` és az
// `$any(...).value = ''` alakot nem jelzi (3 hely), ezekre a metrikaszkript `$any` grepje az őr.
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
      '@typescript-eslint/no-explicit-any': 'warn',
      '@angular-eslint/prefer-signals': 'warn',
      // Egyetlen kivétel a turnstile-widget (SH/Z csomag teszi OnPush-ra).
      '@angular-eslint/prefer-on-push-component-change-detection': 'warn',
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
      '@angular-eslint/template/no-any': 'warn',
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
);
