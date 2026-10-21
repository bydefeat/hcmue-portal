export function toFormFields(fieldErrors: Record<string, string> | undefined) {
  return Object.entries(fieldErrors ?? {}).map(([path, error]) => ({ name: path.split(".")[0] as never, errors: [error] }));
}
