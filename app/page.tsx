import { connection } from "next/server";
import { ShortsDashboard } from "./_components/shorts-dashboard";

export const instant = false;

export default async function Home() {
  await connection();
  const configuredImageModel = process.env.FAL_IMAGE_MODEL?.trim() || null;
  return <ShortsDashboard configuredImageModel={configuredImageModel} />;
}
