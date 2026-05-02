import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
  article: ["approve", "reject", "list"],
} as const;

const ac = createAccessControl(statement);

const adminRole = ac.newRole({
  ...adminAc.statements,
  article: ["approve", "reject", "list"],
});

const reviewerRole = ac.newRole({
  article: ["approve", "reject", "list"],
});

const userRole = ac.newRole({
  user: ["list"],
});

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    adminClient({
      ac,
      roles: {
        admin: adminRole,
        reviewer: reviewerRole,
        user: userRole,
      },
    })
  ]
});
