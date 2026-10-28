import { desc } from "drizzle-orm";
import { setUserRole } from "@/lib/actions/admin";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-zinc-600">{rows.length} user{rows.length === 1 ? "" : "s"}</p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 text-zinc-500">{u.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  {u.id === admin.id ? (
                    <span className="text-zinc-500">{u.role} (you)</span>
                  ) : (
                    // key includes the role so the form remounts (and shows the new role) after saving
                    <form key={`${u.id}-${u.role}`} action={setUserRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="rounded-md px-2 py-1 ring-1 ring-zinc-300">
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <button className="rounded-md px-2 py-1 text-xs ring-1 ring-zinc-300 hover:bg-zinc-50">Save</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
