import {
  AlarmClockIcon,
  BellIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  PackageIcon,
  RocketIcon,
  SearchCheckIcon,
  SendIcon,
  SettingsIcon,
  SquareKanbanIcon,
  UserSearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Route when the surface exists; undefined renders a gated item (docs/07 §9.6). */
  href?: string;
  /** BUILD_ROADMAP sprint in which the surface lands (shown in the gated tooltip). */
  landsIn?: string;
};

/**
 * Fixed primary navigation order per docs/07 §2.1 — AMENDED (Amendment 002):
 * a dedicated Leads item after Queue; AMENDED (Amendment 003): a dedicated
 * Reminders item after Companies, making the order 13 items.
 * Surfaces route when built; the rest are gated until their sprint (docs/07 §9.6).
 */
export const primaryNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboardIcon, href: '/' },
  { label: 'Queue', icon: LayoutListIcon, landsIn: 'Sprint 7' },
  { label: 'Leads', icon: UserSearchIcon, href: '/leads' },
  { label: 'Contacts', icon: UsersIcon, href: '/contacts' },
  { label: 'Companies', icon: Building2Icon, href: '/companies' },
  { label: 'Reminders', icon: AlarmClockIcon, href: '/reminders' },
  { label: 'Pipeline', icon: SquareKanbanIcon, landsIn: 'Sprint 10' },
  { label: 'Audits', icon: SearchCheckIcon, landsIn: 'Sprint 8' },
  { label: 'Outreach', icon: SendIcon, landsIn: 'Sprint 9' },
  { label: 'Meetings', icon: CalendarIcon, landsIn: 'Sprint 10' },
  { label: 'KB', icon: BookOpenIcon, href: '/kb' },
  { label: 'Offers', icon: PackageIcon, landsIn: 'Sprint 6' },
  { label: 'Settings', icon: SettingsIcon, href: '/settings/workspace' },
];

export const secondaryNav: NavItem[] = [
  { label: 'Notifications', icon: BellIcon, landsIn: 'Sprint 3' },
];

/**
 * First-run onboarding entry (docs/07 §2.1). Rendered above the primary nav only
 * while the workspace is not yet onboarded; the Sidebar gates it on
 * `workspace.onboardedAt`.
 */
export const onboardingNav: NavItem = { label: 'Setup', icon: RocketIcon, href: '/onboarding' };
