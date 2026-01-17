import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "electron/**",
      "next-env.d.ts",
    ],
  },
  // Custom rules for code quality and performance
  // - no-unused-vars: Detects unused imports and variables for bundle size optimization
  // - react-hooks: Prevents infinite loops and ensures correct hook usage
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-unused-vars': 'off', // Turn off base rule as @typescript-eslint version is used
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      // Allow inline styles for react-window virtual scrolling (required for dynamic positioning)
      'react/forbid-dom-props': 'off',
      'react/no-inline-styles': 'off',
      '@next/next/no-css-tags': 'off',
      'css-modules/no-unused-class': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  // Enforce strict typing for auth-critical files
  {
    files: [
      'lib/auth.ts',
      'lib/authCookies.ts',
      'lib/authConfig.ts',
      'app/api/auth/**/*.ts',
      'app/context/**/*.tsx'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  // Specific override for LeadTable component to allow react-window style prop
  {
    files: ['app/components/LeadTable.tsx'],
    rules: {
      'react/no-inline-styles': 'off',
      '@next/next/no-css-tags': 'off'
    }
  },
  // Allow legacy scripts and config files to use require() imports (Node tools)
  {
    files: ['scripts/**', 'next.config.ts', 'electron/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  // Enforce hard separation: lib/auth.ts must not import cookies
  {
    files: ['lib/auth.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/headers',
              message: 'lib/auth.ts is a pure domain module and must NEVER import next/headers. All session functions must accept explicit token parameters. Cookie reading is the caller\'s responsibility.'
            },
            {
              name: 'next/server',
              message: 'lib/auth.ts is a pure domain module. NextResponse is API-layer only.'
            },
            {
              name: 'lib/authCookies',
              message: 'lib/auth.ts must not import cookie helpers. Cookie operations are API-layer only.'
            }
          ]
        }
      ]
    }
  },
  // Enforce: authCookies can only be imported by API routes
  {
    files: ['app/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: 'app/actions/auth',
              message: 'API routes should not import server actions. Use lib/auth.ts domain functions directly.'
            }
          ]
        }
      ]
    }
  },
  // Enforce strict restriction for lib/authCookies in all other files
  {
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    ignores: ['app/api/**'], // API routes are allowed to import authCookies
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/authCookies', '@/lib/authCookies'],
              message: 'lib/authCookies can ONLY be imported by API routes (app/api/**). Server actions and components must use cookies() from next/headers to read tokens, then call *ByToken domain functions.'
            }
          ]
        }
      ]
    }
  },
  // Enforce: Server actions must not import authCookies
  {
    files: ['app/actions/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // Already covered by pattern above but keeping for specific message clarity if needed, or rely on pattern.
            // But pattern might not catch exact "lib/authCookies" if using alias.
            {
              name: 'lib/authCookies',
              message: 'Server actions must not import cookie helpers. Cookie operations are API-layer only.'
            }
            // Removed next/headers restriction to allow reading cookies
          ]
        }
      ]
    }
  },
  // Enforce: UI components must not import auth server actions
  {
    files: ['app/components/**/*.tsx', 'app/context/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'app/actions/auth',
              message: 'UI components must not import auth server actions. Use UserContext.login() and UserContext.logout() instead.'
            },
            {
              name: 'lib/authCookies',
              message: 'UI components must not import cookie helpers. Cookie operations are API-layer only.'
            }
          ]
        }
      ]
    }
  }
];

export default eslintConfig;
