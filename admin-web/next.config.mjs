/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the reference-selfie images (S3 pre-signed URLs) if ever displayed.
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
