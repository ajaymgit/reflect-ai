import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AuthRedirect from "./AuthRedirect";
import ProtectedRoute from "./ProtectedRoute";

const authState = { user: null, loading: false };

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

describe("auth guards", () => {
  it("shows auth children when logged out", () => {
    authState.user = null;
    authState.loading = false;
    render(
      <MemoryRouter>
        <AuthRedirect>
          <div>Login Form</div>
        </AuthRedirect>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login Form")).toBeInTheDocument();
  });

  it("shows protected children when logged in", () => {
    authState.user = { id: "u1", name: "Ajay" };
    authState.loading = false;
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Dashboard Home</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  it("shows loading message when auth is loading", () => {
    authState.user = null;
    authState.loading = true;
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Hidden</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText(/opening reflectai/i)).toBeInTheDocument();
  });
});
