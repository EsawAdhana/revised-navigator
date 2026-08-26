-- Ratings show an adjusted score plus where it sits in Stanford's own distribution.
-- Neither the shrinkage prior nor the percentile can be derived from one course's rows,
-- so refreshMetrics() precomputes both here.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS quality_n integer,
  ADD COLUMN IF NOT EXISTS quality_pct smallint,
  ADD COLUMN IF NOT EXISTS rating_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS cross_list_with text[];

COMMENT ON COLUMN courses.quality IS
  'Overall rating: the mean of the adjusted per-category scores in rating_breakdown. '
  'Not a pooled mean of raw responses -- the categories sit ~0.19 apart, so pooling made '
  'a course depend on which questions its evaluations happened to include.';
COMMENT ON COLUMN courses.quality_n IS
  'Largest per-category response count behind courses.quality.';
COMMENT ON COLUMN courses.quality_pct IS
  'Percentile rank (1-100) of courses.quality among all rated courses. 100 = highest rated.';
COMMENT ON COLUMN courses.rating_breakdown IS
  'Per-category {score, n, pct} for quality / learning / organization. Each category is '
  'shrunk toward its OWN corpus mean by its OWN empirical-Bayes weight, because response '
  'spread and average differ per question, then ranked within that category.';

COMMENT ON COLUMN courses.cross_list_with IS
  'Other catalog codes appearing on the same evaluation report as this one. Grouped with the '
  'codes the title declares: paired undergrad/grad listings (MATSCI 184/214, EE 267/267W) share '
  'students without the catalog declaring them cross-listed.';
