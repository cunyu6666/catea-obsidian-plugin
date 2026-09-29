/**
 * [WHO]: Provides supportPromptDue, supportPromptMonth
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/support-prompt.ts - provides local calendar-month gating for the optional GitHub support prompt
 */

export function supportPromptMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function supportPromptDue(lastShown: string | undefined, date = new Date()): boolean {
  return lastShown !== supportPromptMonth(date)
}
