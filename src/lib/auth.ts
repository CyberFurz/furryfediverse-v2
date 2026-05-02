import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { admin } from "better-auth/plugins";
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      ac,
      roles: {
        admin: adminRole,
        reviewer: reviewerRole,
        user: userRole,
      },
      adminRoles: ["admin"],
    }),
  ],
});
