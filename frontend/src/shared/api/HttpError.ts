export class HttpError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
  get isInputError() { return this.status === 400 || this.status === 422; }
}

export async function responseError(response: Response, fallback: string): Promise<HttpError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  const message = typeof detail?.message === 'string' ? detail.message
    : Array.isArray(detail) ? detail.map(item => `${Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : 'Input'}: ${item.msg ?? 'Invalid value'}`).join('; ')
    : fallback;
  return new HttpError(message, response.status);
}
