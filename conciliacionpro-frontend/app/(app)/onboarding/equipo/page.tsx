"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "OWNER" | "EDITOR" | "LECTOR";
type Status = "INVITED" | "ACTIVE" | "DISABLED";

type Company = { id: string; name: string };

type MemberRow = {
  company_id: string;
  user_id: string;
  role: Role;
  status: Status;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  full_name: string | null;
  email: string | null;
};

// 👇 invitaciones pendientes (team_invites)
type InviteRow = {
  id: string;
  company_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | string;
  created_at: string;
  accepted_at: string | null;
  token: string;
};

type RowKind = "MEMBER" | "INVITE";

type CombinedRow = {
  kind: RowKind;
  key: string; // para React key
  company_id: string;
  user_id: string | null;
  role: Role;
  status_ui: Status; // lo que mostramos en la UI
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  full_name: string | null;
  email: string | null;

  // solo para invites
  invite_id?: string;
  invite_token?: string;
};

export default function OnboardingEquipoPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  // modal INVITE (crear)
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("LECTOR");

  // edit role inline (members)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role>("LECTOR");

  // modal EDIT INVITE
  const [editInviteOpen, setEditInviteOpen] = useState(false);
  const [editInviteSaving, setEditInviteSaving] = useState(false);
  const [editInviteId, setEditInviteId] = useState<string>("");
  const [editInviteCompanyId, setEditInviteCompanyId] = useState<string>("");
  const [editInviteEmail, setEditInviteEmail] = useState<string>("");
  const [editInviteName, setEditInviteName] = useState<string>("");
  const [editInviteRole, setEditInviteRole] = useState<Role>("LECTOR");

  // ======================
  // Load companies
  // ======================
  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoading(true);

      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id,name")
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        console.log(error);
        setCompanies([]);
        setCompanyId("");
        setInviteCompanyId("");
        setLoading(false);
        return;
      }

      const list = (data ?? []) as Company[];
      setCompanies(list);

      const firstId = list[0]?.id ?? "";
      setCompanyId(firstId);
      setInviteCompanyId(firstId);

      setLoading(false);
    };

    init();
    return () => {
      alive = false;
    };
  }, [router]);

  // ======================
  // Load members by company
  // ======================
  const loadMembers = async (cid: string) => {
    if (!cid) {
      setMembers([]);
      return;
    }

    const { data, error } = await supabase
      .from("v_company_members")
      .select("company_id,user_id,role,status,invited_at,accepted_at,created_at,updated_at,full_name,email")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("members error:", error);
      setMembers([]);
      return;
    }
    setMembers((data ?? []) as MemberRow[]);
  };

  // ======================
  // Load invites by company (team_invites)
  // ======================
  const loadInvites = async (cid: string) => {
    if (!cid) {
      setInvites([]);
      return;
    }

    const { data, error } = await supabase
      .from("team_invites")
      .select("id,company_id,email,full_name,role,status,created_at,accepted_at,token")
      .eq("company_id", cid)
      .eq("status", "INVITED")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("invites error:", error);
      setInvites([]);
      return;
    }

    setInvites((data ?? []) as InviteRow[]);
  };

  const loadAll = async (cid: string) => {
    await Promise.all([loadMembers(cid), loadInvites(cid)]);
  };

  useEffect(() => {
    loadAll(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ======================
  // Lista combinada (members + invites)
  // ======================
  const rows: CombinedRow[] = useMemo(() => {
    const memberRows: CombinedRow[] = members.map((m) => ({
      kind: "MEMBER",
      key: `m:${m.user_id}`,
      company_id: m.company_id,
      user_id: m.user_id,
      role: m.role,
      status_ui: m.status,
      invited_at: m.invited_at,
      accepted_at: m.accepted_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
      full_name: m.full_name,
      email: m.email,
    }));

    const inviteRows: CombinedRow[] = invites.map((i) => ({
      kind: "INVITE",
      key: `i:${i.id}`,
      company_id: i.company_id,
      user_id: null,
      role: i.role,
      status_ui: "INVITED",
      invited_at: i.created_at,
      accepted_at: i.accepted_at,
      created_at: i.created_at,
      updated_at: i.created_at,
      full_name: i.full_name,
      email: i.email,
      invite_id: i.id,
      invite_token: i.token,
    }));

    return [...inviteRows, ...memberRows];
  }, [members, invites]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status_ui === "ACTIVE").length;
    const invited = rows.filter((r) => r.status_ui === "INVITED").length;
    const disabled = rows.filter((r) => r.status_ui === "DISABLED").length;
    return { total, active, invited, disabled };
  }, [rows]);

  const canInvite = useMemo(() => {
    if (!inviteCompanyId) return false;
    if (!inviteEmail.trim()) return false;
    return true;
  }, [inviteCompanyId, inviteEmail]);

  // ======================
  // Helper: enviar OTP con token
  // ======================
  const sendInviteEmailOtp = async (emailLower: string, tokenStr: string) => {
    const redirectTo = `${window.location.origin}/auth/callback?invite_token=${encodeURIComponent(tokenStr)}`;

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: emailLower,
      options: { emailRedirectTo: redirectTo },
    });

    if (otpErr) throw otpErr;
  };

  // ======================
  // Invite (crear)
  // - 1) Registramos invitación (team_invites)
  // - 2) Enviamos correo usando OTP (magic link)
  // ======================
  const onInvite = async () => {
    if (!canInvite) return;
    setSaving(true);

    try {
      const emailLower = inviteEmail.trim().toLowerCase();

      // 1) crear invitación y obtener token
      const { data: rpcData, error: rpcErr } = await supabase.rpc("invite_member_by_email", {
        p_company_id: inviteCompanyId,
        p_email: emailLower,
        p_full_name: inviteName.trim() || null,
        p_role: inviteRole,
      });

      if (rpcErr) {
        console.log("RPC error:", rpcErr);
        alert(`No se pudo registrar la invitación: ${rpcErr.message}`);
        return;
      }

      const token = (Array.isArray(rpcData) ? rpcData?.[0]?.token : rpcData?.token) ?? null;

      if (!token) {
        console.log("RPC data sin token:", rpcData);
        alert("Invitación registrada, pero no pude obtener el token (RPC no devolvió token).");
        return;
      }

      const tokenStr = String(token);

      // 2) manda magic link
      try {
        await sendInviteEmailOtp(emailLower, tokenStr);
      } catch (otpErr: any) {
        console.log("OTP error:", otpErr);
        alert(`Invitación registrada, pero no se pudo enviar el correo: ${otpErr?.message || "Error OTP"}`);
        return;
      }

      // 3) refrescar UI
      setOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("LECTOR");

      setCompanyId(inviteCompanyId);
      await loadAll(inviteCompanyId);

      alert("✅ Invitación enviada. Le llegará un correo para crear su contraseña.");
    } finally {
      setSaving(false);
    }
  };

  // ======================
  // INVITES: Reenviar (rota token + envía OTP)
  // ======================
  const onResendInvite = async (inviteId: string, email: string) => {
    const ok = confirm(`¿Reenviar invitación a ${email}? (Se generará un link nuevo)`);
    if (!ok) return;

    try {
      setLoading(true);

      const { data: tokenData, error: tokenErr } = await supabase.rpc("rotate_team_invite_token", {
        p_invite_id: inviteId,
      });

      if (tokenErr) {
        alert(`No se pudo reenviar: ${tokenErr.message}`);
        return;
      }

      const tokenStr = String(tokenData ?? "");
      if (!tokenStr) {
        alert("No se pudo reenviar: RPC no devolvió token.");
        return;
      }

      const emailLower = email.trim().toLowerCase();
      await sendInviteEmailOtp(emailLower, tokenStr);

      await loadAll(companyId);
      alert("✅ Invitación reenviada.");
    } catch (e: any) {
      alert(`No se pudo reenviar: ${e?.message || "Error"}`);
    } finally {
      setLoading(false);
    }
  };

  // ======================
  // INVITES: Abrir modal editar
  // ======================
  const openEditInviteModal = (r: CombinedRow) => {
    if (!r.invite_id) return;

    setEditInviteId(r.invite_id);
    setEditInviteCompanyId(r.company_id);
    setEditInviteEmail(r.email || "");
    setEditInviteName(r.full_name || "");
    setEditInviteRole(r.role);
    setEditInviteOpen(true);
  };

  // ======================
  // INVITES: Guardar cambios (opcional reenviar)
  // ======================
  const onSaveInviteEdits = async (resend: boolean) => {
    if (!editInviteId) return;

    const emailLower = editInviteEmail.trim().toLowerCase();
    if (!emailLower) {
      alert("Email requerido.");
      return;
    }

    setEditInviteSaving(true);
    try {
      // rotamos token si vamos a reenviar (recomendado), o si cambiaste email igual conviene rotar
      const rotateToken = true;

      const { data: tokenData, error: updErr } = await supabase.rpc("update_team_invite", {
        p_invite_id: editInviteId,
        p_email: emailLower,
        p_full_name: editInviteName.trim() || null,
        p_role: editInviteRole,
        p_rotate_token: rotateToken,
      });

      if (updErr) {
        alert(`No se pudo actualizar: ${updErr.message}`);
        return;
      }

      const tokenStr = String(tokenData ?? "");
      if (!tokenStr) {
        alert("Actualizado, pero no pude obtener token para reenviar.");
        await loadAll(companyId);
        setEditInviteOpen(false);
        return;
      }

      if (resend) {
        await sendInviteEmailOtp(emailLower, tokenStr);
      }

      await loadAll(companyId);
      setEditInviteOpen(false);
      alert(resend ? "✅ Invitación actualizada y reenviada." : "✅ Invitación actualizada.");
    } catch (e: any) {
      alert(`No se pudo guardar: ${e?.message || "Error"}`);
    } finally {
      setEditInviteSaving(false);
    }
  };

  // ======================
  // INVITES: Eliminar/Cancelar
  // ======================
  const onCancelInvite = async (inviteId: string, email: string) => {
    const ok = confirm(`¿Eliminar (cancelar) invitación para ${email}?`);
    if (!ok) return;

    try {
      setLoading(true);
      const { error } = await supabase.rpc("cancel_team_invite", { p_invite_id: inviteId });
      if (error) {
        alert(`No se pudo cancelar: ${error.message}`);
        return;
      }
      await loadAll(companyId);
      alert("✅ Invitación cancelada.");
    } finally {
      setLoading(false);
    }
  };

  // ======================
  // Update role (solo miembros reales)
  // ======================
  const onSaveRole = async (user_id: string) => {
    const { error } = await supabase
      .from("company_members")
      .update({ role: editRole })
      .eq("company_id", companyId)
      .eq("user_id", user_id);

    if (error) {
      alert("No se pudo actualizar el rol. Revisa permisos (OWNER ACTIVE).");
      return;
    }

    setEditingUserId(null);
    await loadAll(companyId);
  };

  // ======================
  // Disable / Activate (solo miembros reales)
  // ======================
  const onDisable = async (user_id: string) => {
    const ok = confirm("¿Desactivar este usuario en esta empresa?");
    if (!ok) return;

    const { error } = await supabase
      .from("company_members")
      .update({ status: "DISABLED" })
      .eq("company_id", companyId)
      .eq("user_id", user_id);

    if (error) {
      alert("No se pudo desactivar. Revisa permisos (OWNER ACTIVE).");
      return;
    }
    await loadAll(companyId);
  };

  const onActivate = async (user_id: string) => {
    const { error } = await supabase
      .from("company_members")
      .update({ status: "ACTIVE", accepted_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("user_id", user_id);

    if (error) {
      alert("No se pudo activar. Revisa permisos (OWNER ACTIVE).");
      return;
    }
    await loadAll(companyId);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href="/onboarding" className="text-[13px] font-bold text-slate-700 hover:underline cursor-pointer">
          ← Volver
        </Link>

        <div className="rounded-2xl bg-white px-3 py-2 text-[12px] font-extrabold ring-1 ring-slate-200">
          Paso 3 de 3 — Equipo
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-6 text-white">
          <h1 className="text-2xl font-black">Agrega tu equipo</h1>
          <p className="mt-2 text-[13px] text-white/85">Invita miembros y asigna roles por empresa.</p>

          <div className="mt-4 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
            <div className="flex items-center justify-between text-[12px] font-extrabold">
              <span>Progreso</span>
              <span>Paso 3 de 3</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-2 w-full rounded-full bg-white" />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <Section
            title="Empresa"
            subtitle="Selecciona la empresa para gestionar su equipo."
            right={
              <button
                onClick={() => setOpen(true)}
                className="h-10 rounded-2xl px-4 text-[13px] font-extrabold bg-[#123b63] text-white hover:opacity-95 cursor-pointer"
              >
                + Agregar miembro
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Empresa seleccionada">
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
                  <option value="">Selecciona…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Stat label="Total" value={stats.total} />
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Activos" value={stats.active} />
                <MiniStat label="Invitados" value={stats.invited} />
                <MiniStat label="Desact." value={stats.disabled} />
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              ✅ Ahora verás también invitaciones pendientes (team_invites) como estado INVITED.
            </div>
          </Section>

          <Section title="Usuarios autorizados" subtitle="Incluye invitaciones pendientes y usuarios activos.">
            {!companyId ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
                Selecciona una empresa.
              </div>
            ) : loading ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
                Cargando…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
                No hay miembros ni invitaciones todavía.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-[12px] font-extrabold text-slate-700">
                  <div className="col-span-5">Usuario</div>
                  <div className="col-span-2">Rol</div>
                  <div className="col-span-2">Estado</div>
                  <div className="col-span-3 text-right">Acciones</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {rows.map((r) => {
                    const isMember = r.kind === "MEMBER";
                    const isInvite = r.kind === "INVITE";
                    const isEditing = isMember && editingUserId === r.user_id;

                    return (
                      <div key={r.key} className="grid grid-cols-12 items-center px-4 py-3">
                        <div className="col-span-5">
                          <div className="text-[13px] font-extrabold text-slate-900">
                            {r.full_name || (isInvite ? "Invitado (pendiente)" : "Sin nombre")}
                          </div>
                          <div className="text-[12px] text-slate-600">{r.email || "Sin email"}</div>
                        </div>

                        <div className="col-span-2">
                          {isEditing ? (
                            <select value={editRole} onChange={(e) => setEditRole(e.target.value as Role)} className={inputCls}>
                              <option value="OWNER">OWNER</option>
                              <option value="EDITOR">EDITOR</option>
                              <option value="LECTOR">LECTOR</option>
                            </select>
                          ) : (
                            <Pill kind="info">{r.role}</Pill>
                          )}
                        </div>

                        <div className="col-span-2">
                          <Pill kind={r.status_ui === "ACTIVE" ? "ok" : r.status_ui === "INVITED" ? "warn" : "muted"}>
                            {r.status_ui}
                          </Pill>
                        </div>

                        <div className="col-span-3 flex justify-end gap-2">
                          {isInvite ? (
                            <>
                              <button
                                onClick={() => onResendInvite(r.invite_id!, r.email || "")}
                                className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                                disabled={!r.invite_id || !r.email}
                                title="Reenvía el correo de invitación (link nuevo)"
                              >
                                Reenviar
                              </button>

                              <button
                                onClick={() => openEditInviteModal(r)}
                                className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                                disabled={!r.invite_id}
                              >
                                Editar
                              </button>

                              <button
                                onClick={() => onCancelInvite(r.invite_id!, r.email || "")}
                                className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-red-700 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                                disabled={!r.invite_id}
                              >
                                Eliminar
                              </button>
                            </>
                          ) : isEditing ? (
                            <>
                              <button
                                onClick={() => onSaveRole(r.user_id!)}
                                className="h-9 rounded-xl bg-[#123b63] px-3 text-[12px] font-extrabold text-white hover:opacity-95 cursor-pointer"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingUserId(r.user_id);
                                  setEditRole(r.role);
                                }}
                                className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                              >
                                Editar rol
                              </button>

                              {r.status_ui === "DISABLED" ? (
                                <button
                                  onClick={() => onActivate(r.user_id!)}
                                  className="h-9 rounded-xl bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100 cursor-pointer"
                                >
                                  Activar
                                </button>
                              ) : (
                                <button
                                  onClick={() => onDisable(r.user_id!)}
                                  className="h-9 rounded-xl bg-white px-3 text-[12px] font-extrabold text-red-700 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer"
                                >
                                  Desactivar
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          <div className="flex justify-end">
            <Link
              href="/app"
              className="h-11 rounded-2xl bg-[#123b63] px-4 text-white font-extrabold text-[14px] grid place-items-center hover:opacity-95 cursor-pointer"
            >
              Ir al dashboard →
            </Link>
          </div>
        </div>
      </div>

      {/* MODAL: CREAR INVITE */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
            <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-extrabold uppercase text-white/80">Agregar miembro</div>
                  <div className="mt-1 text-xl font-black">Invitar y asignar rol</div>
                  <div className="mt-2 text-[13px] text-white/85">Se enviará un correo (Magic Link). Luego podrá crear contraseña.</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="h-10 w-10 rounded-2xl bg-white/10 ring-1 ring-white/20 grid place-items-center hover:bg-white/15 cursor-pointer"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Empresa *">
                  <select value={inviteCompanyId} onChange={(e) => setInviteCompanyId(e.target.value)} className={inputCls}>
                    <option value="">Selecciona…</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Rol *">
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className={inputCls}>
                    <option value="OWNER">OWNER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="LECTOR">LECTOR</option>
                  </select>
                </Field>

                <Field label="Email *">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className={inputCls}
                    placeholder="usuario@empresa.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </Field>

                <Field label="Nombre (opcional)">
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={inputCls} placeholder="Nombre Apellido" />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="h-11 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  onClick={onInvite}
                  disabled={!canInvite || saving}
                  className={[
                    "h-11 rounded-2xl px-4 text-[14px] font-extrabold",
                    canInvite && !saving ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer" : "bg-slate-200 text-slate-500 cursor-not-allowed",
                  ].join(" ")}
                >
                  {saving ? "Enviando…" : "Invitar y asignar →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT INVITE */}
      {editInviteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
            <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-extrabold uppercase text-white/80">Editar invitación</div>
                  <div className="mt-1 text-xl font-black">Cambiar datos y reenviar</div>
                  <div className="mt-2 text-[13px] text-white/85">Por seguridad se genera un link nuevo al guardar.</div>
                </div>
                <button
                  onClick={() => setEditInviteOpen(false)}
                  className="h-10 w-10 rounded-2xl bg-white/10 ring-1 ring-white/20 grid place-items-center hover:bg-white/15 cursor-pointer"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Empresa">
                  <input value={companies.find((c) => c.id === editInviteCompanyId)?.name || "—"} disabled className={inputCls} />
                </Field>

                <Field label="Rol *">
                  <select value={editInviteRole} onChange={(e) => setEditInviteRole(e.target.value as Role)} className={inputCls}>
                    <option value="OWNER">OWNER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="LECTOR">LECTOR</option>
                  </select>
                </Field>

                <Field label="Email *">
                  <input
                    value={editInviteEmail}
                    onChange={(e) => setEditInviteEmail(e.target.value)}
                    className={inputCls}
                    placeholder="usuario@empresa.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </Field>

                <Field label="Nombre (opcional)">
                  <input value={editInviteName} onChange={(e) => setEditInviteName(e.target.value)} className={inputCls} placeholder="Nombre Apellido" />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditInviteOpen(false)}
                  className="h-11 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
                  disabled={editInviteSaving}
                >
                  Cancelar
                </button>

                <button
                  onClick={() => onSaveInviteEdits(false)}
                  className="h-11 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
                  disabled={editInviteSaving}
                >
                  {editInviteSaving ? "Guardando…" : "Guardar"}
                </button>

                <button
                  onClick={() => onSaveInviteEdits(true)}
                  className="h-11 rounded-2xl bg-[#123b63] px-4 text-white font-extrabold text-[14px] hover:opacity-95 cursor-pointer"
                  disabled={editInviteSaving}
                >
                  {editInviteSaving ? "Enviando…" : "Guardar y reenviar →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* UI bits */
const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200 cursor-text";

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{title}</div>
          {subtitle && <div className="mt-1 text-[13px] text-slate-600">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{label}</div>
      {children}
    </div>
  );
}

function Pill({ children, kind }: { children: React.ReactNode; kind: "ok" | "warn" | "muted" | "info" }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
      : kind === "warn"
      ? "bg-amber-50 text-amber-900 ring-amber-200"
      : kind === "info"
      ? "bg-slate-50 text-slate-900 ring-slate-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";

  return <span className={`inline-flex items-center rounded-xl px-3 py-1 text-[12px] font-extrabold ring-1 ${cls}`}>{children}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-[12px] font-extrabold text-slate-700 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-[11px] font-extrabold text-slate-700 uppercase">{label}</div>
      <div className="mt-1 text-[16px] font-black text-slate-900">{value}</div>
    </div>
  );
}
