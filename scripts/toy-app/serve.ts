/**
 * Simple HTTP server for the toy catalog testbed.
 * Serves index.html on all routes so URL query params work.
 * Usage: npx tsx scripts/toy-app/serve.ts [--port N]
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '3001', 10)
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(PORT, () => {
  console.log(`Toy catalog app running at http://localhost:${PORT}`)
  console.log(`  All bugs:  http://localhost:${PORT}/?bugs=all`)
  console.log(`  No bugs:   http://localhost:${PORT}/?bugs=none`)
  console.log(`  Specific:  http://localhost:${PORT}/?bugs=conflict,crash`)
})
