import { NextResponse } from "next/server";
import { auth, devBypassEnabled } from "@/auth";

// Everything except sign-in itself and public assets needs a session: pages redirect to /signin, APIs get 401.
export default auth((req) => {
  if (req.auth || devBypassEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = new URL("/signin", req.url);
  if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: [
    "/((?!api/auth|signin|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icon|apple-icon|favicon\\.ico).*)",
  ],
};
