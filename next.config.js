/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel Functions under /api are handled by the project's api/ dir; this
  // file only configures the Next.js App Router (dashboard + app/api routes).
  // Keep default serverless target for Vercel.
  // NOTE: this repo ships no ESLint config (eslint-config-next is not
  // installed), so the build's lint step cannot run. Disable linting during
  // `next build` to allow production builds to succeed; `npm run lint`
  // (next lint) remains available if a config is added later.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
