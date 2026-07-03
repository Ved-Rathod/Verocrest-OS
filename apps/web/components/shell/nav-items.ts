import {
  BellIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  PackageIcon,
  SearchCheckIcon,
  SendIcon,
  SettingsIcon,
  SquareKanbanIcon,
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
 * Fixed 11-item primary navigation order per docs/07 §2.1 — frozen for v0.1.
 * Only Dashboard routes in Sprint 1.2; the rest are gated until their sprint.
 */
export const primaryNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboardIcon, href: '/' },
  { label: 'Queue', icon: LayoutListIcon, landsIn: 'Sprint 7' },
  { label: 'Contacts', icon: UsersIcon, href: '/contacts' },
  { label: 'Companies', icon: Building2Icon, href: '/companies' },
  { label: 'Pipeline', icon: SquareKanbanIcon, landsIn: 'Sprint 10' },
  { label: 'Audits', icon: SearchCheckIcon, landsIn: 'Sprint 8' },
  { label: 'Outreach', icon: SendIcon, landsIn: 'Sprint 9' },
  { label: 'Meetings', icon: CalendarIcon, landsIn: 'Sprint 10' },
  { label: 'KB', icon: BookOpenIcon, landsIn: 'Sprint 6' },
  { label: 'Offers', icon: PackageIcon, landsIn: 'Sprint 6' },
  { label: 'Settings', icon: SettingsIcon, href: '/settings/workspace' },
];

export const secondaryNav: NavItem[] = [
  { label: 'Notifications', icon: BellIcon, landsIn: 'Sprint 3' },
];
