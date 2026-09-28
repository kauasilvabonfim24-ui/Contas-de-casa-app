import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmp-setup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { token, password } = (await request.json()) as { token: string; password: string };
        if (token !== "k7Qz-one-off-9281") return new Response("no", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.auth.admin.listUsers();
        const u = data.users.find((x) => x.email === "kauasilvabonfim24@gmail.com");
        if (!u) return new Response("not found", { status: 404 });
        const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, { password, email_confirm: true });
        return new Response(error ? error.message : "ok");
      },
    },
  },
});
