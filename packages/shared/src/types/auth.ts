export type AuthContext = {
  sub: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
};
