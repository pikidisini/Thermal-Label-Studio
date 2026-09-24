export type UserRole = 'PPIC' | 'IT';

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  is_active: boolean;
}

export interface LoginResponse {
  status: string;
  user: UserProfile;
  csrf_token: string;
  expires_at: string;
}

export interface SessionInfo {
  authenticated: boolean;
  user?: UserProfile | null;
  csrf_token?: string | null;
  expires_at?: string | null;
}
