import { z } from "zod";

const blankAsUnset = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema);

const schema = z.object({
  DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DEFEAT_POSTGRES_POOL_MAX: blankAsUnset(z.coerce.number().int().min(1).max(100).default(10)),
  DEFEAT_POSTGRES_STATEMENT_TIMEOUT_MS: blankAsUnset(z.coerce.number().int().min(1000).default(15000)),
  DEFEAT_DATABASE_LOG_QUERIES: blankAsUnset(z.stringbool().default(false)),
});

export const env = schema.parse(process.env);
