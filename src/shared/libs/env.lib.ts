import { z } from "zod";

const schema = z.object({
  DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export const env = schema.parse(process.env);
