import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '_',
    isArray: (name) => ['course', 'section', 'schedule', 'instructor', 'attribute', 'day'].includes(name),
    textNodeName: '_text',
});

const res = await fetch('https://explorecourses.stanford.edu/search?q=CS106B&view=xml-20200810&filter-coursestatus-Active=on', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'jsenabled=1' }
});
const xml = await res.text();
const parsed = parser.parse(xml);
const courses = Array.isArray(parsed?.courses?.course) ? parsed.courses.course : [];
console.log('Total courses parsed:', courses.length);

for (const c of courses.slice(0, 5)) {
    const s = String(c?.subject || '').replace(/\s+/g, '').toUpperCase();
    const cd = String(c?.code || '').replace(/\s+/g, '').toUpperCase();
    console.log(`  subject="${c.subject}" code="${c.code}" -> "${s}${cd}"`);
}

const match = courses.find(c => {
    const s = String(c?.subject || '').replace(/\s+/g, '').toUpperCase();
    const cd = String(c?.code || '').replace(/\s+/g, '').toUpperCase();
    return s + cd === 'CS106B';
});
console.log('Match found:', !!match);
if (match) {
    const secs = Array.isArray(match?.sections?.section) ? match.sections.section : [];
    console.log('Sections count:', secs.length);
    if (secs.length > 0) {
        const s = secs[0];
        console.log('First section classId:', s?.classId);
        const scheds = Array.isArray(s?.schedules?.schedule) ? s.schedules.schedule : [];
        console.log('  schedules:', scheds.length);
        if (scheds.length > 0) {
            console.log('  days keys:', Object.keys(scheds[0]?.days || {}));
            console.log('  startTime:', scheds[0]?.startTime);
        }
    }
}
