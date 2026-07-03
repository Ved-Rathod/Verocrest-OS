import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Set new password' };

// Protected route: requires the recovery session established by /auth/callback.
// Middleware redirects to /signin when no session is present.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
