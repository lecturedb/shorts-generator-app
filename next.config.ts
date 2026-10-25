import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const [repositoryOwner = "", repositoryName = ""] =
  process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const isUserOrOrganizationSite =
  repositoryName.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`;
const basePath =
  isGitHubPagesBuild && repositoryName && !isUserOrOrganizationSite
    ? `/${repositoryName}`
    : "";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(isGitHubPagesBuild
    ? {
        output: "export" as const,
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_GITHUB_PAGES_BASE_PATH: basePath },
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  experimental: {
    agentFeedback: false,
  },
};

export default nextConfig;
