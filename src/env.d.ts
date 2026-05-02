declare namespace App {
  interface Locals {
    session: import("better-auth").Session | null;
    user: (import("better-auth").User & { role?: string | null }) | null;
  }
}
