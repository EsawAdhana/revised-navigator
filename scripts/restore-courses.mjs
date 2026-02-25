/**
 * One-time restore: upload courses from a saved JSON backup into Supabase.
 * Usage: node --env-file=.env.local scripts/restore-courses.mjs /path/to/courses.json
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars. Run with: node --env-file=.env.local scripts/restore-courses.mjs')
    process.exit(1)
}

const inputFile = process.argv[2] || '/Users/esawadhana/Downloads/courses.json'
console.log(`📂 Reading courses from: ${inputFile}`)

const raw = readFileSync(inputFile, 'utf-8')
const courses = JSON.parse(raw)
console.log(`📦 Loaded ${courses.length} courses`)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
})

// Map the API response format back to the DB row format
const rows = courses.map(c => ({
    course_id: c.course_id,
    quarter: null, // not available in light export
    subject: c.subject || '',
    code: c.code || '',
    title: c.title || '',
    description: c.description || '',
    units: c.units || '',
    grading: c.grading || '',
    instructors: c.instructors || [],
    terms: c.terms || [],
    dept: c.dept || null,
    sections: c.sections || [],
    exam_type: c.exam_type || null
}))

const BATCH_SIZE = 200
let uploaded = 0

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
        .from('courses')
        .upsert(batch, { onConflict: 'course_id' })

    if (error) {
        console.error(`\n❌ Error at batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message)
        process.exit(1)
    }

    uploaded += batch.length
    const pct = ((uploaded / rows.length) * 100).toFixed(1)
    process.stdout.write(`\r✅ Uploaded ${uploaded}/${rows.length} (${pct}%)`)
}

console.log(`\n\n🎉 Done! ${uploaded} courses restored to Supabase.`)
console.log('⚠️  Note: sections/descriptions are empty since the backup was from the light API.')
console.log('   The app will work for browsing but course detail pages will lack schedule times.')
