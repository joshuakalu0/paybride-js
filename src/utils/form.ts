export function buildFormPayload(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  appendFormValue(params, "", input);

  return params;
}

function appendFormValue(params: URLSearchParams, prefix: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    params.append(prefix, "");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFormValue(params, `${prefix}[${index}]`, item);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPrefix = prefix ? `${prefix}[${key}]` : key;
      appendFormValue(params, nestedPrefix, nestedValue);
    }
    return;
  }

  params.append(prefix, String(value));
}
