import { redirect } from "next/navigation";

export default function Page() {
  redirect("/authentication/sign-in");
}
