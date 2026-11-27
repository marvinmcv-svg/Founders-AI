/** Typed errors, one per documented status (plan 11: problem+json bodies). */

export type Problem = { type?: string; title?: string; status?: number; detail?: string; [k: string]: unknown };

export class FoundersAIError extends Error {
  override name = "FoundersAIError";
}

export class APIError extends FoundersAIError {
  override name = "APIError";
  constructor(
    readonly status: number,
    readonly problem: Problem,
    readonly requestId: string | null,
  ) {
    super(`${status} ${problem.title ?? "Error"}${problem.detail ? `: ${problem.detail}` : ""}`);
  }
}

export class BadRequestError extends APIError {
  override name = "BadRequestError";
}
export class AuthenticationError extends APIError {
  override name = "AuthenticationError";
}
export class InsufficientCreditsError extends APIError {
  override name = "InsufficientCreditsError";
}
export class PermissionDeniedError extends APIError {
  override name = "PermissionDeniedError";
}
/** 404: misses are never charged. */
export class NotFoundError extends APIError {
  override name = "NotFoundError";
}
export class ConflictError extends APIError {
  override name = "ConflictError";
}
export class RateLimitError extends APIError {
  override name = "RateLimitError";
}
/** 501: endpoint launches in a later release (`available_in`); never charged. */
export class NotAvailableYetError extends APIError {
  override name = "NotAvailableYetError";
}
export class ServerError extends APIError {
  override name = "ServerError";
}

export function errorFor(status: number, problem: Problem, requestId: string | null): APIError {
  const E =
    status === 400 || status === 422 ? BadRequestError
    : status === 401 ? AuthenticationError
    : status === 402 ? InsufficientCreditsError
    : status === 403 ? PermissionDeniedError
    : status === 404 ? NotFoundError
    : status === 409 ? ConflictError
    : status === 429 ? RateLimitError
    : status === 501 ? NotAvailableYetError
    : status >= 500 ? ServerError
    : APIError;
  return new E(status, problem, requestId);
}
