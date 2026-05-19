export interface RegisteredUser {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  image: string | null;
  token: string;
}
