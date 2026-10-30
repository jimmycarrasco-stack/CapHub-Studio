import { AuthCard } from "@/components/auth-card";
import { getUserById } from "@/lib/auth";
import { checkPasswordToken } from "@/lib/password-tokens";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password", robots: { index: false } };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const userId = checkPasswordToken(token);
  const user = userId ? getUserById(userId) : null;
  return (
    <AuthCard title="Set your password" subtitle={user ? user.email : "CapHub"}>
      {user ? (
        <SetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-zinc-600">
          This link is invalid, already used, or expired. If you already set a password,{" "}
          <a href="/login" className="font-medium text-brand-600 hover:underline">
            sign in
          </a>
          . Otherwise ask your account admin for a new link.
        </p>
      )}
    </AuthCard>
  );
}
