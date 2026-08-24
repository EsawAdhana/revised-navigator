export interface Section {
  term: string;
  classId: number;
  sectionNumber: string;
  component: string;
  units: number | string;
  grading: string;
  classLevel: string;
  instructionalMode: string;
  status: string;
  enrolled: number;
  capacity: number;
  waitlist: number;
  waitlistMax: number;
  openSeats: number;
  startDate: string;
  endDate: string;
  meetings: {
    days: string;
    time: string;
    location: string;
    instructors: string[];
  }[];
  finalExam?: {
    date: string;
    location: string;
  };
  gers?: string[];
}

export interface Course {
  id: string;
  subject: string;
  code: string;
  title: string;
  description: string;
  units: string;
  grading: string;
  instructors: string[];
  terms?: string[];
  sections?: Section[];
  selectedTerm?: string; // The term selected by the user for their schedule
  selectedSectionIds?: number[]; // Selected sections (classIds), at most one per component (e.g. a LEC and a DIS)
  selectedUnits?: number; // When course/section has variable units (e.g. 3-4), the user's choice
  optionalMeetings?: string[]; // Array of meeting keys that are marked as optional/not in class
  color?: string; // User-selected color theme for the course (e.g. 'sky', 'emerald')
  /** Precomputed from evaluations (hrs/wk median) */
  hours?: number;
  /** Precomputed from evaluations (1-5 rating) */
  quality?: number;
  /** Precomputed: hours / units */
  difficulty?: number;
  /** Precomputed: not scheduled in any of the three prior catalogs, and no evaluations from those years */
  isNew?: boolean;
}

// --- Course Evaluation Types ---

export interface EvalOption {
  text: string;
  weight: number;
  count: number;
  pct: string;
}

export interface EvalQuestion {
  text: string;
  type: 'rating' | 'numeric';
  mean: number;
  median: number;
  std: number;
  responseRate: string;
  options: EvalOption[];
}

export interface CourseEvaluation {
  term: string;
  instructor: string;
  courseCode: string;
  respondents: string;
  questions: EvalQuestion[];
  comments: string[];
  /** Median % of class sessions attended online (from eval survey) */
  onlineAttendancePct?: number;
  /** Median % of class sessions attended in person (from eval survey) */
  inPersonAttendancePct?: number;
}
