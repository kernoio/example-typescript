export interface User {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  image: string | null;
  demo?: boolean;
}
