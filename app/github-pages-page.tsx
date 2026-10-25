import { GitHubPagesDashboard } from "./_components/github-pages-dashboard";
import sampleProject from "../fixtures/projects/sample-project/project.json";
import { parseProjectDocument } from "@/lib/project-schema";

export default function GitHubPagesHome() {
  return <GitHubPagesDashboard initialProject={parseProjectDocument(sampleProject)} />;
}
