import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const siteUrl = import.meta.env.SITE_URL;
  if (siteUrl) {
    try {
      const target = new URL(siteUrl);
      const current = new URL(context.request.url);
      if (current.origin !== target.origin) {
        const redirectUrl = new URL(current.pathname + current.search, target);
        return context.redirect(redirectUrl.toString(), 301);
      }
    } catch {
      // Ignore invalid SITE_URL and continue.
    }
  }

  const session = await auth.api
    .getSession({
      headers: context.request.headers,
    })
    .catch(() => null);

  if (session) {
    const freshUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    context.locals.user = freshUser
      ? { ...session.user, ...freshUser }
      : session.user;
    context.locals.session = session.session;
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }

  return next();
});
