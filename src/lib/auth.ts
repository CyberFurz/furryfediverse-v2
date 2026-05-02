import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
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
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your Furry Fediverse password",
        text: `Click the link to reset your password: ${url}`,
        html: `<p>Click the link to reset your password:</p><p><a href="${url}">${url}</a></p>`,
      }).catch((error) => {
        console.error("[auth] Failed to send reset password email", {
          email: user.email,
          error,
        });
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your Furry Fediverse email",
        text: `Click the link to verify your email: ${url}`,
        html: `<p>Click the link to verify your email:</p><p><a href="${url}">${url}</a></p>`,
      }).catch((error) => {
        console.error("[auth] Failed to send verification email", {
          email: user.email,
          error,
        });
      });
    },
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
