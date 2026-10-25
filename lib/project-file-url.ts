const githubPagesBasePath = process.env.NEXT_PUBLIC_GITHUB_PAGES_BASE_PATH;

export function projectFileUrl(projectId: string, relativePath: string) {
  if (
    githubPagesBasePath !== undefined &&
    projectId === "sample-space-project"
  ) {
    return `${githubPagesBasePath}/demo/${relativePath}`;
  }

  return `/api/projects/${projectId}/files/content?path=${encodeURIComponent(relativePath)}`;
}
