// Next 16: "next lint" is not a valid CLI command (parsed as dev + directory "lint").
// Use ESLint directly so "npm run lint" works on Vercel.
import nextPlugin from '@next/eslint-plugin-next'

export default [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts']
  },
  nextPlugin.configs['core-web-vitals']
]
