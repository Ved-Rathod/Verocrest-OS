import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@verocrest/ui-kit';
import { SignInForm } from '@/components/auth/signin-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInForm />
    </Suspense>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
