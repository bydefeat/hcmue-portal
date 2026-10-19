import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/authentication/authentication.lib";

export const { GET, POST } = toNextJsHandler(auth);
