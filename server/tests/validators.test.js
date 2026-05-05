import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../src/shared/validators/authSchemas.js";
import { chatMessageSchema } from "../src/shared/validators/chatSchemas.js";

describe("request validators", () => {
  it("accepts valid register payload", () => {
    const parsed = registerSchema.safeParse({
      body: {
        name: "Ajay",
        email: "ajay@example.com",
        password: "DemoPass1",
      },
      params: {},
      query: {},
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects weak register password", () => {
    const parsed = registerSchema.safeParse({
      body: {
        name: "Ajay",
        email: "ajay@example.com",
        password: "weakpass",
      },
      params: {},
      query: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid login payload", () => {
    const parsed = loginSchema.safeParse({
      body: {
        email: "ajay@example.com",
        password: "x",
      },
      params: {},
      query: {},
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid chat mode", () => {
    const parsed = chatMessageSchema.safeParse({
      body: {
        message: "hello",
        settings: { mode: "expert" },
      },
      params: {},
      query: {},
    });
    expect(parsed.success).toBe(false);
  });
});
