// ============================================================================
// FILE: app/page.tsx
// ============================================================================

"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Fondo bonito */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#123b63]/35 blur-[120px]" />
        <div className="absolute top-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-emerald-400/15 blur-[90px]" />
        <div className="absolute bottom-[-160px] left-[-120px] h-[520px] w-[520px] rounded-full bg-amber-400/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      {/* Barra superior */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
            <span className="text-lg">🏦</span>
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-wide">Conciliador Pro</div>
            <div className="text-[11px] text-white/60 -mt-0.5">Bancos • Ventas • Compras • Contabilidad</div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-[13px] text-white/70">
          <a href="#features" className="hover:text-white">Qué hace</a>
          <a href="#modules" className="hover:text-white">Módulos</a>
          <a href="#security" className="hover:text-white">Seguridad</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/registro-owner"
            className="rounded-xl bg-white px-4 py-2 text-[13px] font-extrabold text-slate-900 hover:opacity-95"
          >
            Registrar Owner
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-8">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/80 ring-1 ring-white/15">
              <span>⚡</span>
              <span>Automatiza tu operación financiera sin caos</span>
            </div>

            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight md:text-5xl">
              Control total: <span className="text-emerald-300">bancos</span>,{" "}
              <span className="text-amber-200">ventas</span> y{" "}
              <span className="text-sky-300">conciliación</span> en un solo lugar.
            </h1>

            <p className="mt-4 text-[15px] leading-relaxed text-white/70">
              Diseñada para crecer contigo: multi-empresa, multi-país, reglas contables claras,
              conciliación automática y trazabilidad completa. Empieza simple… y escala a nivel ERP.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/registro-owner"
                className="rounded-2xl bg-[#ffffff] px-5 py-3 text-[13px] font-extrabold text-slate-900 hover:opacity-95"
              >
                Crear mi empresa (Owner)
              </Link>

              <a
                href="#features"
                className="rounded-2xl bg-white/10 px-5 py-3 text-[13px] font-bold text-white/85 ring-1 ring-white/15 hover:bg-white/15"
              >
                Ver cómo funciona
              </a>

              <div className="text-[12px] text-white/60">
                ✅ Enfocado en procesos reales • ✅ Claro para equipos no técnicos
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <MiniKpi label="Tiempo" value="↓ 60%" desc="menos trabajo manual" />
              <MiniKpi label="Errores" value="↓ 80%" desc="menos descuadres" />
              <MiniKpi label="Control" value="↑ 10x" desc="más trazabilidad" />
            </div>
          </div>

          {/* TARJETA DEMO */}
          <div className="rounded-3xl bg-white/8 p-5 ring-1 ring-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-extrabold tracking-[0.12em] text-white/70">
                  VISTA GENERAL
                </div>
                <div className="mt-1 text-lg font-black">Panel Financiero</div>
                <div className="text-[12px] text-white/60">Empresa Demo • CLP • Chile</div>
              </div>
              <div className="rounded-2xl bg-emerald-300/15 px-3 py-2 text-[12px] font-extrabold text-emerald-200 ring-1 ring-emerald-200/20">
                ✅ Listo para conciliar
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Card title="Bancos" value="5" icon="🏦" desc="cartolas + alertas" />
              <Card title="Movimientos" value="1.245" icon="🧾" desc="clasificados" />
              <Card title="Ventas" value="320" icon="🧡" desc="saldo + pagos" />
              <Card title="Conciliación" value="78%" icon="🔗" desc="auto + manual" />
            </div>

            <div className="mt-4 rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
              <div className="text-[12px] font-extrabold text-white/80">Ejemplo de flujo</div>
              <ol className="mt-2 space-y-2 text-[13px] text-white/70">
                <li>1) Conectas banco o subes cartola</li>
                <li>2) El sistema clasifica y sugiere matches</li>
                <li>3) Conciliación + contabilización con 1 click</li>
                <li>4) Reportes por empresa / banco / período</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-black">Qué puedes hacer</h2>
        <p className="mt-2 text-[14px] text-white/70">
          Construida para operación real: claridad, velocidad y auditabilidad.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Feature
            icon="🤖"
            title="Match automático inteligente"
            desc="Sugiere conciliaciones por monto, referencia, rut, similitud de texto y reglas de negocio."
          />
          <Feature
            icon="🔍"
            title="Trazabilidad total"
            desc="Cada movimiento y documento queda con historial: quién, cuándo, qué se cambió."
          />
          <Feature
            icon="🧾"
            title="Contabilización ordenada"
            desc="Flujo preparado para asientos, centros de costo y reportes, sin perder control."
          />
          <Feature
            icon="🌎"
            title="Multi-empresa / Multi-país"
            desc="Cada empresa define su país, moneda, formato y reglas. La plataforma se adapta."
          />
          <Feature
            icon="🏦"
            title="Gestión de bancos"
            desc="Cuentas, saldos, cartolas, estados, alertas de movimientos y conciliación por lote."
          />
          <Feature
            icon="🧡"
            title="Gestión de ventas"
            desc="Facturas, pagos, saldos, estados (pendiente/parcial/pagada/anulada) y vínculo a banco."
          />
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-black">Módulos</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Module
            title="Conciliación Bancaria"
            bullets={[
              "Movimientos (debitos/créditos) + detalle expandible",
              "Filtros potentes estilo Excel",
              "Conciliación manual y automática",
              "Estado: conciliado / parcial / no conciliado",
            ]}
          />
          <Module
            title="Ventas / Cobranza"
            bullets={[
              "Facturas y pagos con saldo",
              "Estados: pendiente / parcial / pagada / anulada",
              "Link a movimiento bancario",
              "Reportes por cliente y antigüedad",
            ]}
          />
          <Module
            title="Compras / Pagos"
            bullets={[
              "Proveedores + facturas de compra + pagos",
              "Conciliación con egresos bancarios",
              "Control de respaldo y auditoría",
              "Preparado para ordenes de compra/pago",
            ]}
          />
          <Module
            title="Reportes"
            bullets={[
              "Cuadre por banco / período / empresa",
              "Detección de movimientos huérfanos",
              "KPIs de conciliación",
              "Exportación (Excel / CSV)",
            ]}
          />
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/15">
          <h2 className="text-2xl font-black">Seguridad (en serio)</h2>
          <p className="mt-2 text-[14px] text-white/70">
            La plataforma está pensada para credenciales, permisos y trazabilidad desde el inicio.
            (El flujo real lo implementamos cuando conectemos autenticación + base de datos).
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SecurityItem title="Roles y permisos" desc="Owner, Admin, Contabilidad, Operaciones, Lectura." icon="🛡️" />
            <SecurityItem title="Auditoría" desc="Registro de acciones: conciliaciones, cambios, eliminaciones." icon="🧷" />
            <SecurityItem title="Multi-tenant" desc="Datos aislados por empresa (según el modelo que definamos)." icon="🏢" />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] text-white/60">
              Siguiente paso: crear Owner → crear Empresa → configurar país/moneda → crear usuarios.
            </div>
            <Link
              href="/registro-owner"
              className="rounded-2xl bg-emerald-300 px-5 py-3 text-[13px] font-extrabold text-slate-950 hover:opacity-95"
            >
              Empezar: Registrar Owner
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-[12px] text-white/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Conciliador Pro</div>
          <div className="text-white/40">Hecho para operar finanzas sin estrés.</div>
        </div>
      </footer>
    </main>
  );
}

// =========================
// Subcomponentes (solo UI)
// =========================

function MiniKpi({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
      <div className="text-[11px] font-bold text-white/60">{label}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
      <div className="text-[11px] text-white/55">{desc}</div>
    </div>
  );
}

function Card({ title, value, icon, desc }: { title: string; value: string; icon: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-extrabold text-white/80">{title}</div>
        <div className="text-lg">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-[12px] text-white/60">{desc}</div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-3xl bg-white/8 p-5 ring-1 ring-white/10 hover:bg-white/10 transition">
      <div className="text-2xl">{icon}</div>
      <div className="mt-3 text-[16px] font-black">{title}</div>
      <div className="mt-2 text-[13px] leading-relaxed text-white/65">{desc}</div>
    </div>
  );
}

function Module({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/10">
      <div className="text-[16px] font-black">{title}</div>
      <ul className="mt-3 space-y-2 text-[13px] text-white/70">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-emerald-200">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SecurityItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div className="text-[13px] font-extrabold text-white/85">{title}</div>
      </div>
      <div className="mt-2 text-[13px] text-white/65">{desc}</div>
    </div>
  );
}
