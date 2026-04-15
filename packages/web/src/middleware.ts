import { defineMiddleware } from "astro:middleware";
import { checkAuthWithDaemon, getDaemonUrl, requiresAuth } from "./lib/auth.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

  if (!requiresAuth(pathname)) {
    return next();
  }

  const cookieHeader = context.request.headers.get("cookie");
  const daemonUrl = getDaemonUrl();
  const authenticated = await checkAuthWithDaemon(cookieHeader, daemonUrl);

  if (authenticated === null) {
    return next();
  }

  if (authenticated) {
    return next();
  }

  const loginUrl = new URL("/login", context.url);
  return context.redirect(loginUrl.toString());
});
