import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const PROJECT_ROOT = process.cwd()
const SRC_DIR = path.join(PROJECT_ROOT, 'src')

const VIOLATIONS = [
    {
        pattern: /['"`]1 units['"`]/i,
        message: 'Found hardcoded "1 units". Use "1 unit" instead.'
    },
    {
        pattern: /\$\{\s*1\s*\}\s*units\b/i,
        message: 'Found "${1} units". Use "1 unit" instead.'
    },
    {
        pattern: />\s*1\s*units\s*</i,
        message: 'Found "1 units" in JSX text. Use "1 unit" instead.'
    },
    {
        // Catches things like {count} units where count might be 1.
        // We exclude lines that already use unitsLabel or formatUnits.
        pattern: /\$\{([^}]+)\}\s+units\b/i,
        exclude: /unitsLabel|formatUnits|range|min|max|–|-|\+/i,
        message: 'Found dynamic "units" without pluralization helper. Use unitsLabel() or formatUnits().'
    }
]

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    let errors = []

    lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return

        VIOLATIONS.forEach(({ pattern, exclude, message }) => {
            if (pattern.test(line)) {
                if (exclude && exclude.test(line)) return

                errors.push({
                    line: index + 1,
                    content: line.trim(),
                    message
                })
            }
        })
    })

    return errors
}

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f)
        const isDirectory = fs.statSync(dirPath).isDirectory()
        if (isDirectory) {
            if (f !== 'node_modules' && f !== '.next' && f !== '.git') {
                walkDir(dirPath, callback)
            }
        } else {
            if (f.endsWith('.tsx') || f.endsWith('.ts')) {
                callback(dirPath)
            }
        }
    })
}

let totalErrors = 0
console.log('Checking for improper "units" pluralization...')

walkDir(SRC_DIR, (filePath) => {
    const fileErrors = checkFile(filePath)
    if (fileErrors.length > 0) {
        console.log(`\nFile: ${path.relative(PROJECT_ROOT, filePath)}`)
        fileErrors.forEach(err => {
            console.log(`  Line ${err.line}: ${err.message}`)
            console.log(`    > ${err.content}`)
            totalErrors++
        })
    }
})

if (totalErrors > 0) {
    console.log(`\nFound ${totalErrors} potential pluralization issues.`)
    process.exit(1)
} else {
    console.log('\nNo pluralization issues found! 🎉')
    process.exit(0)
}
