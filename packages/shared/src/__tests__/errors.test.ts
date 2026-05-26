import { describe, it, expect } from "vitest";
import { AppError, NotFoundError, UnauthorizedError, ForbiddenError } from "../errors";

describe("AppError hierarchy", () => {
  it("AppError preserves code and statusCode", () => {
    const err = new AppError("boom", "BOOM", 500);
    expect(err.message).toBe("boom");
    expect(err.code).toBe("BOOM");
    expect(err.statusCode).toBe(500);
    expect(err).toBeInstanceOf(Error);
  });

  it("NotFoundError uses 404", () => {
    const err = new NotFoundError("Tenant", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("abc-123");
  });

  it("UnauthorizedError uses 401", () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it("ForbiddenError uses 403", () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });
});
