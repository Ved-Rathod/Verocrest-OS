import type { BadgeProps } from '@verocrest/ui-kit';
import type { FindingSeverity } from '@verocrest/domain-website-intelligence';

/** Grade → badge colour (0–100). */
export function gradeVariant(grade: number): BadgeProps['variant'] {
  if (grade >= 80) return 'success';
  if (grade >= 60) return 'warning';
  return 'danger';
}

export function severityVariant(severity: FindingSeverity): BadgeProps['variant'] {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'neutral';
  }
}
