export type AccessLevel = 'owner' | 'family' | 'friend' | 'viewer';

export interface MemorySpaceAccess {
  email: string;
  level: AccessLevel;
  spaceId: string;
  displayName?: string;
}

export interface AccessDecision {
  allowed: boolean;
  email: string;
  level?: AccessLevel;
  spaceId?: string;
  message: string;
}

export const APPROVED_MEMORY_USERS: MemorySpaceAccess[] = [
  { email: 'demo@memoriam.app', level: 'owner', spaceId: 'college-2021-2024', displayName: 'Demo User' },
  { email: 'test@example.com', level: 'owner', spaceId: 'college-2021-2024', displayName: 'Test User' },
  { email: 'friend@example.com', level: 'friend', spaceId: 'college-2021-2024', displayName: 'Friend Space' },
  { email: 'family@example.com', level: 'family', spaceId: 'family-demo', displayName: 'Family Space' },
];

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getAccessDecision = (rawEmail: string): AccessDecision => {
  const email = normalizeEmail(rawEmail);
  const match = APPROVED_MEMORY_USERS.find(user => user.email === email);

  if (!match) {
    return {
      allowed: false,
      email,
      message: 'This memory world is private. Ask the owner to add your email before entering.',
    };
  }

  return {
    allowed: true,
    email,
    level: match.level,
    spaceId: match.spaceId,
    message: `Welcome to ${match.displayName ?? 'your memory space'}.`,
  };
};
