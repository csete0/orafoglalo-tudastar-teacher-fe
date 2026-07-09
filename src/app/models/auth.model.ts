export interface TeacherUserLoginDto {
  id: number;
  userName: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

export interface SignInModel {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponseDto {
  user: TeacherUserLoginDto;
  accessToken?: string;
  expiresIn?: number;
  isAuthenticated: boolean;
}

export interface TokenPair {
  accessToken: string;
}

export interface StoredAuthData extends TokenPair {
  user: TeacherUserLoginDto;
}

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'teacher_access_token',
  USER_DATA: 'teacher_user_data',
  AUTH_TIMESTAMP: 'teacher_auth_timestamp',
} as const;

export const TIMING_CONFIG = {
  REFRESH_THRESHOLD: 5 * 60 * 1000,
  REFRESH_CHECK_INTERVAL: 60 * 1000,
  TOKEN_CACHE_DURATION: 1000,
} as const;
