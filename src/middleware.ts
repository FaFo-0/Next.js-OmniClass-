import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth/google/(.*)",
]);

const isOrgSelectRoute = createRouteMatcher(["/onboarding/select-org(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const session = await auth();
  if (!session.userId) {
    return session.redirectToSignIn();
  }

  // Signed in but no active organization → force org selector.
  // (Onboarding routes themselves are exempt so user can pick / create one.)
  if (!session.orgId && !isOrgSelectRoute(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding/select-org";
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
