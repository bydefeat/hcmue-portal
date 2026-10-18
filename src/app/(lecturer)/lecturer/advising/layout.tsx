import { notFound } from "next/navigation";
import { getCurrentLecturer } from "@/modules/users/users.query";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lecturer = await getCurrentLecturer();
  if (!lecturer.isAdvisor) notFound();
  return children;
}
