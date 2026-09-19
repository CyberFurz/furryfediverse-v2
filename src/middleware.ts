import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const siteUrl = import.meta.env.SITE_URL;
  if (siteUrl) {
    try {
      const target = new URL(siteUrl);
      const requestUrl = new URL(context.request.url);
      // Behind a TLS-terminating proxy the request scheme seen by the app is
      // http while SITE_URL is https. Honor X-Forwarded-Proto (which the node
      // adapter already does in production) so the origin comparison doesn't
      // redirect every request to itself, while still enforcing scheme/host/
      // port — including the http->https upgrade on direct http access.
      const forwardedProto = context.request.headers.get("x-forwarded-proto");
      const proto = forwardedProto?.split(",")[0]?.trim() || requestUrl.protocol.replace(":", "");
      const current = `${proto}://${requestUrl.host}`;
      if (current !== target.origin) {
        const redirectUrl = new URL(requestUrl.pathname + requestUrl.search, target);
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
