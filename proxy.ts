import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/login", "/callback"],
  },
});

export const config = {
  matcher: [
    "/today/:path*",
    "/signals/:path*",
    "/actions/:path*",
    "/connections/:path*",
    "/settings/:path*",
    "/invite/:path*",
    "/onboarding/:path*",
    "/api/chat",
  ],
};
