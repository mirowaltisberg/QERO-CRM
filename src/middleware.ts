import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Check if MFA verification is pending (password accepted but MFA not yet verified)
  const mfaPending = request.cookies.get("qero_mfa_pending")?.value === "1";

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/register", "/auth/callback", "/auth/confirm"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Setup route - requires auth but allows users needing setup
  const isSetupRoute = pathname === "/setup-account";

  // If user is not logged in and trying to access protected route
  if (!user && !isPublicRoute && !isSetupRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user is not logged in but trying to access setup page, redirect to login
  if (!user && isSetupRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // For authenticated users, check AAL to determine if MFA is really needed
  if (user && !isPublicRoute && !isSetupRoute) {
    // Check actual AAL level from Supabase
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    
    // If user needs MFA (has enrolled factor at aal2 but currently at aal1)
    if (aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2") {
      // MFA is required but not completed - redirect to login with mfa flag
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("mfa", "1");
      return NextResponse.redirect(url);
    }
    
    // If user has aal2 (completed MFA) or doesn't need MFA (nextLevel is also aal1)
    // Clear the MFA pending cookie via response header and allow through
    if (mfaPending && (aalData?.currentLevel === "aal2" || 
        (aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal1"))) {
      // Delete the stale MFA pending cookie
      supabaseResponse.cookies.set("qero_mfa_pending", "", { 
        maxAge: 0, 
        path: "/" 
      });
    }
  }

  // If user is logged in (and MFA not pending) and trying to access auth pages, redirect to app
  if (user && !mfaPending && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/calling";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)",
  ],
};

