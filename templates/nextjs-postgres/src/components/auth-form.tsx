"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/actions/auth";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: FormState, data: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isSignup = mode === "signup";
  const input = "w-full rounded-md px-3 py-2 ring-1 ring-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900";

  return (
    <form action={formAction} className="mx-auto mt-16 w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <h1 className="text-xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
      {isSignup && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required autoComplete="name" className={input} />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Password</span>
        <input name="password" type="password" required minLength={isSignup ? 8 : 1} autoComplete={isSignup ? "new-password" : "current-password"} className={input} />
      </label>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
        {pending ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="font-medium text-zinc-900 underline">Log in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="font-medium text-zinc-900 underline">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
