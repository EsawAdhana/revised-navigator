const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('public/data/2026_courses.json', 'utf8'));
  const ids = new Set();
  let dupes = 0;
  data.forEach((c, i) => {
    if (ids.has(c.course_id)) {
      dupes++;
      if (dupes < 5) console.log('Duplicate:', c.course_id);
    }
    ids.add(c.course_id);
  });
  console.log('Total:', data.length, 'Unique:', ids.size, 'Duplicates:', dupes);
} catch (err) {
  console.error(err.message);
}
