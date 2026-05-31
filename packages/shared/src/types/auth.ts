export type AuthContext = {
  sub: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  name?: string;
  preferredUsername?: string;
  email?: string;
};
