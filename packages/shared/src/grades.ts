import { GRADE_RANK, RANK_TO_GRADE, type Grade } from "./types.js";

/** Ice DoT: downgrade quality by one step (F unchanged). */
export function downgradeGrade(grade: Grade): Grade {
  const rank = GRADE_RANK[grade];
  if (rank >= 4) return "F";
  return RANK_TO_GRADE[rank + 1];
}

export function isGrade(value: string): value is Grade {
  return value === "A" || value === "B" || value === "C" || value === "D" || value === "F";
}

/** Parse free-text grade list (A,B,C or lines / spaces). */
export function parseGradeList(input: string): Grade[] {
  const tokens = input
    .toUpperCase()
    .split(/[^A-F]+/)
    .filter(Boolean);
  const grades: Grade[] = [];
  for (const t of tokens) {
    if (isGrade(t)) grades.push(t);
  }
  return grades;
}
