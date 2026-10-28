export class HttpError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
  get isInputError() { return this.status === 400 || this.status === 422; }
}

export async function responseError(response: Response, fallback: string): Promise<HttpError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail?.message === 'string') return new HttpError(detail.message, response.status);
  let message = fallback;
  if (Array.isArray(detail)) {
    message = detail.map(item => {
      const location = Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : 'Input';
      return `${location}: ${item.msg ?? 'Invalid value'}`;
    }).join('; ');
  }
  return new HttpError(message, response.status);
}
