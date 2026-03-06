export type GerRequirement = {
  id: string
  category: string
  label: string
  shortLabel: string
  type: 'courses' | 'units'
  required: number
  matchTags: string[]
}

export const GER_REQUIREMENTS: GerRequirement[] = [
  // COLLEGE
  {
    id: 'clge',
    category: 'COLLEGE',
    label: 'Civic, Liberal, and Global Education',
    shortLabel: 'COLLEGE',
    type: 'courses',
    required: 2,
    matchTags: ['civic, liberal, and global education', 'clge', 'college'],
  },
  // Writing & Rhetoric
  {
    id: 'pwr1',
    category: 'Writing & Rhetoric',
    label: 'PWR 1',
    shortLabel: 'PWR 1',
    type: 'courses',
    required: 1,
    matchTags: ['writing and rhetoric 1', 'pwr 1', 'pwr1', 'writing 1'],
  },
  {
    id: 'pwr2',
    category: 'Writing & Rhetoric',
    label: 'PWR 2',
    shortLabel: 'PWR 2',
    type: 'courses',
    required: 1,
    matchTags: ['writing and rhetoric 2', 'pwr 2', 'pwr2', 'writing 2'],
  },
  {
    id: 'wim',
    category: 'Writing & Rhetoric',
    label: 'Writing in the Major (WIM)',
    shortLabel: 'WIM',
    type: 'courses',
    required: 1,
    matchTags: ['writing in the major', 'wim'],
  },
  // Language
  {
    id: 'language',
    category: 'Language',
    label: 'First-Year Language',
    shortLabel: 'Language',
    type: 'courses',
    required: 3,
    matchTags: ['language'],
  },
  // Ways
  {
    id: 'way-aii',
    category: 'Ways',
    label: 'Ways: Aesthetic and Interpretive Inquiry',
    shortLabel: 'A-II',
    type: 'courses',
    required: 2,
    matchTags: ['ways: aesthetic and interpretive inquiry', 'way-a-ii', 'a-ii'],
  },
  {
    id: 'way-aqr',
    category: 'Ways',
    label: 'Ways: Applied Quantitative Reasoning',
    shortLabel: 'AQR',
    type: 'courses',
    required: 1,
    matchTags: ['ways: applied quantitative reasoning', 'way-aqr', 'aqr'],
  },
  {
    id: 'way-ce',
    category: 'Ways',
    label: 'Ways: Creative Expression',
    shortLabel: 'CE',
    type: 'units',
    required: 2,
    matchTags: ['ways: creative expression', 'way-ce', 'creative expression'],
  },
  {
    id: 'way-edp',
    category: 'Ways',
    label: 'Ways: Engaging Diversity',
    shortLabel: 'EDP',
    type: 'courses',
    required: 1,
    matchTags: ['ways: engaging diversity', 'way-edp', 'engaging diversity'],
  },
  {
    id: 'way-er',
    category: 'Ways',
    label: 'Ways: Ethical Reasoning',
    shortLabel: 'ER',
    type: 'courses',
    required: 1,
    matchTags: ['ways: ethical reasoning', 'way-er', 'ethical reasoning'],
  },
  {
    id: 'way-fr',
    category: 'Ways',
    label: 'Ways: Formal Reasoning',
    shortLabel: 'FR',
    type: 'courses',
    required: 1,
    matchTags: ['ways: formal reasoning', 'way-fr', 'formal reasoning'],
  },
  {
    id: 'way-si',
    category: 'Ways',
    label: 'Ways: Social Inquiry',
    shortLabel: 'SI',
    type: 'courses',
    required: 2,
    matchTags: ['ways: social inquiry', 'way-si', 'social inquiry'],
  },
  {
    id: 'way-sma',
    category: 'Ways',
    label: 'Ways: Scientific Method and Analysis',
    shortLabel: 'SMA',
    type: 'courses',
    required: 2,
    matchTags: ['ways: scientific method and analysis', 'way-sma', 'scientific method'],
  },
]

export const GER_CATEGORIES = ['COLLEGE', 'Writing & Rhetoric', 'Language', 'Ways'] as const
