import { redirect } from "next/navigation";

/** Old link. Selling has no application any more. */
export default function ApplyRedirect() {
  redirect("/creator/start");
}
