import type { SessionUser } from '@/lib/types';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export type AuthOutcome =
  | { ok: true; user: SessionUser; notice?: string }
  | { ok: false; error: string; field?: 'email' | 'password' | 'fullName' | '_form' };

export interface ResetRequestOutcome {
  ok: true;
  /**
   * Development only. With no mail provider configured the local driver has no
   * way to deliver the link, so it returns it and the page shows it instead of
   * pretending an e-mail was sent.
   */
  devLink?: string;
}

export interface AuthProvider {
  readonly kind: 'local' | 'supabase';
  /** Whether a new account must confirm its e-mail before signing in. */
  readonly emailVerificationRequired: boolean;

  signUp(input: SignUpInput): Promise<AuthOutcome>;
  signIn(input: SignInInput): Promise<AuthOutcome>;
  signOut(): Promise<void>;
  currentUser(): Promise<SessionUser | null>;
  requestPasswordReset(email: string): Promise<ResetRequestOutcome>;
  resetPassword(token: string, password: string): Promise<AuthOutcome>;
  updateFullName(userId: string, fullName: string): Promise<void>;
}
