import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  const trailingSegment = "/index";
  const url = new URL(context.request.url);

  // redirect /path/index to /path/
  if (url.pathname.endsWith(trailingSegment)) {
    // remove trailingSegment from the path
    const redirectPath = url.pathname.slice(0, -trailingSegment.length) + "/";
    return context.redirect(redirectPath || "/");
  }
  return next();
});
