import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-full place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Not found</h1>
        <p className="mt-1 text-sm text-zinc-500">That page doesn&apos;t exist or was deleted.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
