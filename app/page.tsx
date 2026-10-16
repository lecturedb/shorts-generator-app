import { ShortsDashboard } from "./_components/shorts-dashboard";
import sampleProject from "@/fixtures/projects/sample-project.json";
import { parseProjectDocument } from "@/lib/project-schema";

export default function Home() {
  const project = parseProjectDocument(sampleProject);

  return <ShortsDashboard project={project} />;
}
