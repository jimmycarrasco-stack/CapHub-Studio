import Link from "next/link";

export default function Home() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">My App</h1>
      <p className="mx-auto mt-4 max-w-xl text-zinc-600">
        A full-stack starter with accounts, roles and an admin panel. The first person to sign up becomes the admin.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/signup" className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">
          Get started
        </Link>
        <Link href="/login" className="rounded-md px-5 py-2.5 text-sm font-medium ring-1 ring-zinc-300 hover:bg-white">
          Log in
        </Link>
      </div>
    </section>
  );
}
