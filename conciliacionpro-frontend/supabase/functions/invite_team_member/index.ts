import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "OWNER" | "EDITOR" | "LECTOR";

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    // validar usuario llamador
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const callerId = u.user.id;

    // admin
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const company_id = body.company_id as string;
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = String(body.full_name ?? "").trim();
    const role = (body.role as Role) ?? "LECTOR";
    const redirect_to = String(body.redirect_to ?? "").trim();

    if (!company_id || !email || !role) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    // validar OWNER ACTIVE
    const { data: isOwner, error: ownerErr } = await supabaseAdmin.rpc("is_company_owner", {
      p_company_id: company_id,
      p_user_id: callerId,
    });

    if (ownerErr || !isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden (owner only)" }), { status: 403 });
    }

    // buscar usuario por email (simple)
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });

    const existing = list.users.find((x) => (x.email ?? "").toLowerCase() === email);

    let user_id: string;
    let sent_invite_email = false;

    if (!existing) {
      // invitar -> crea usuario + manda correo
      const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirect_to || undefined,
        data: full_name ? { full_name } : undefined,
      });

      if (invErr || !invited?.user) {
        return new Response(JSON.stringify({ error: invErr?.message ?? "Invite failed" }), { status: 500 });
      }

      user_id = invited.user.id;
      sent_invite_email = true;

      // asegurar profile
      await supabaseAdmin.from("profiles").upsert({
        id: user_id,
        email,
        full_name: full_name || email,
      });
    } else {
      user_id = existing.id;

      // asegurar profile (por si no existe)
      await supabaseAdmin.from("profiles").upsert({
        id: user_id,
        email,
        full_name: full_name || (existing.user_metadata?.full_name ?? email),
      });
    }

    const hasSignedIn = Boolean(existing?.last_sign_in_at);
    const status = hasSignedIn ? "ACTIVE" : "INVITED";

    // upsert en company_members
    const { error: upErr } = await supabaseAdmin
      .from("company_members")
      .upsert(
        {
          company_id,
          user_id,
          role,
          status,
          invited_at: status === "INVITED" ? new Date().toISOString() : null,
          accepted_at: status === "ACTIVE" ? new Date().toISOString() : null,
        },
        { onConflict: "company_id,user_id" },
      );

    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 });

    return new Response(
      JSON.stringify({
        ok: true,
        user_id,
        status,
        sent_invite_email,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
