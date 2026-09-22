export interface MemberProfile {
  name: string;
  email: string;
  role: 'member' | 'admin';
  active: boolean;
}

export interface GoogleIdentity {
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  providerIds: string[];
}

export type GoogleMemberAccess =
  | { status: 'signed-out' }
  | { status: 'untrusted-provider' }
  | { status: 'unverified-email' }
  | { status: 'allowed'; member: MemberProfile };

export function resolveGoogleMember(identity: GoogleIdentity | null): GoogleMemberAccess {
  if (!identity) return { status: 'signed-out' };
  if (!identity.providerIds.includes('google.com')) return { status: 'untrusted-provider' };
  if (!identity.email || !identity.emailVerified) return { status: 'unverified-email' };

  return {
    status: 'allowed',
    member: {
      name: identity.displayName?.trim() || identity.email.split('@')[0],
      email: identity.email,
      role: 'member',
      active: true,
    },
  };
}
