/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel Functions under /api are handled by the project's api/ dir; this
  // file only configures the Next.js App Router (dashboard + app/api routes).
  // Keep default serverless target for Vercel.
};
export default nextConfig;
