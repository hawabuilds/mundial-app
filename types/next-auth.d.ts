import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string | null;
    };
  }

  interface User {
    username?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string | null;
    twitterId?: string | null;
  }
}
