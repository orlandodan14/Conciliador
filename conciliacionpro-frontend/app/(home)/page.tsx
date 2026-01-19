// ============================================================================
// FILE: app/(home)/page.tsx
// Landing pública (sin AppShell) — explicada para gente no técnica
// ============================================================================

"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* --------------------------------------------------------------------
        FONDO DECORATIVO
        - Solo visual: blobs difuminados + radial light
        - No afecta contenido, va detrás (-z-10)
      -------------------------------------------------------------------- */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#123b63]/35 blur-[120px]" />
        <div className="absolute top-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-emerald-400/15 blur-[90px]" />
        <div className="absolute bottom-[-160px] left-[-120px] h-[520px] w-[520px] rounded-full bg-amber-400/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      {/* --------------------------------------------------------------------
        HEADER / NAV
        - Logo + nombre del producto
        - Links internos (anclas) para scrollear secciones
        - CTA principal: "Registrar mi empresa (1er paso)"
      -------------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 backdrop-blur bg-slate-950/80">
        {/* Marca */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
            <span className="text-lg">🏦</span>
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-wide">Conciliador Pro</div>
            <div className="text-[11px] text-white/60 -mt-0.5">
              Bancos • Ventas • Compras • Contabilidad
            </div>
          </div>
        </div>

        {/* Navegación de secciones (desktop) */}
        <nav className="hidden md:flex items-center gap-6 text-[13px] text-white/70">
          <a href="#features" className="hover:text-white">Qué hace</a>
          <a href="#modules" className="hover:text-white">Módulos</a>
          <a href="#security" className="hover:text-white">Seguridad</a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-2">
          {/* Nuevo: Ya tengo cuenta */}
          <Link
            href="/login"
            className="rounded-xl bg-white/10 px-4 py-2 text-[13px] font-extrabold text-white/85 ring-1 ring-white/15 hover:bg-white/15"
          >
            Ya tengo cuenta
          </Link>

          {/* CTA principal */}
          <Link
            href="/registro-owner"
            className="rounded-xl bg-white px-4 py-2 text-[13px] font-extrabold text-slate-900 hover:opacity-95"
          >
            Registrar mi empresa (1er paso)
          </Link>
        </div>
      </header>

      {/* --------------------------------------------------------------------
        HERO
        - Mensaje simple para NO contables
        - CTA: crear empresa (primer paso)
        - Mini KPIs (ficticios) para dar sensación de valor
      -------------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-8">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          {/* Columna izquierda: texto principal */}
          <div>
            {/* Tag/Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/80 ring-1 ring-white/15">
              <span>✅</span>
              <span>Para dueños y equipos sin experiencia contable</span>
            </div>

            {/* Titular simple (evita jerga) */}
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight md:text-5xl">
              Ordena tu negocio en minutos:
              <span className="text-emerald-300"> bancos</span>,{" "}
              <span className="text-amber-200">ventas</span>,{" "}
              <span className="text-sky-300">compras</span> y{" "}
              <span className="text-white">contabilidad</span> en un solo lugar.
            </h1>

            {/* Explicación en lenguaje “de calle” */}
            <p className="mt-4 text-[15px] leading-relaxed text-white/70">
              Si hoy tienes “pagos por aquí”, “facturas por allá” y no sabes si todo cuadra,
              aquí lo ves claro. Conectas tu banco (o subes tu cartola), registras tus ventas
              y compras, y el sistema te guía para <b>cuadrar</b> todo paso a paso.
            </p>

            {/* CTA + link de explicación */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/registro-owner"
                className="rounded-2xl bg-[#ffffff] px-5 py-3 text-[13px] font-extrabold text-slate-900 hover:opacity-95"
              >
                Registrar mi empresa (primer paso)
              </Link>

              <a
                href="#features"
                className="rounded-2xl bg-white/10 px-5 py-3 text-[13px] font-bold text-white/85 ring-1 ring-white/15 hover:bg-white/15"
              >
                Ver cómo funciona
              </a>

              <div className="text-[12px] text-white/60">
                ✅ Claro y guiado • ✅ Sin tecnicismos • ✅ Control por empresa
              </div>
            </div>

            {/* Mini KPIs (visual de valor; luego puedes poner datos reales) */}
            <div className="mt-8 grid grid-cols-3 gap-3">
              <MiniKpi label="Tiempo" value="↓ 60%" desc="menos trabajo manual" />
              <MiniKpi label="Errores" value="↓ 80%" desc="menos descuadres" />
              <MiniKpi label="Control" value="↑ 10x" desc="todo más ordenado" />
            </div>
          </div>

          {/* Columna derecha: tarjeta demo (simula un panel) */}
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
                ✅ Listo para cuadrar
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Card title="Bancos" value="5" icon="🏦" desc="cartolas + alertas" />
              <Card title="Movimientos" value="1.245" icon="🧾" desc="importados" />
              <Card title="Ventas" value="320" icon="🧡" desc="facturas + pagos" />
              <Card title="Conciliación" value="78%" icon="🔗" desc="auto + manual" />
            </div>

            {/* Flujo explicado sin jerga */}
            <div className="mt-4 rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
              <div className="text-[12px] font-extrabold text-white/80">Cómo funciona (simple)</div>
              <ol className="mt-2 space-y-2 text-[13px] text-white/70">
                <li>1) Conectas tu banco o subes tu cartola (Excel/CSV)</li>
                <li>2) Cargas tus ventas y compras (o las importas)</li>
                <li>3) El sistema te muestra qué cuadra y qué no, con sugerencias</li>
                <li>4) Sacas reportes y, si quieres, pasas a contabilidad ordenada</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
        FEATURES (Qué puedes hacer)
        - Beneficios explicados para no técnicos
      -------------------------------------------------------------------- */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-black">Qué puedes hacer</h2>
        <p className="mt-2 text-[14px] text-white/70">
          Todo pensado para que cualquiera lo use: claro, guiado y con control.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Feature
            icon="🤖"
            title="El sistema te ayuda a cuadrar"
            desc="Te sugiere qué pago corresponde a qué factura usando monto, fecha, referencia y reglas simples."
          />
          <Feature
            icon="🔍"
            title="Todo queda registrado"
            desc="Ves qué se hizo, cuándo y por quién. Ideal para control interno y auditoría."
          />
          <Feature
            icon="📒"
            title="Contabilidad sin enredos"
            desc="Cuando quieras, conviertes lo conciliado en contabilidad ordenada (asientos y reportes)."
          />
          <Feature
            icon="🌎"
            title="Multi-empresa / Multi-país"
            desc="Cada empresa define su país y moneda. La plataforma se adapta a tu realidad."
          />
          <Feature
            icon="🏦"
            title="Gestión de bancos"
            desc="Cuentas, saldos, cartolas, alertas y conciliación por lote, todo desde un panel."
          />
          <Feature
            icon="🧡"
            title="Ventas y compras claras"
            desc="Facturas, pagos, saldos y estados fáciles de entender, vinculados al banco."
          />
        </div>
      </section>

      {/* --------------------------------------------------------------------
        MODULES (Módulos)
        - Aquí agregamos CONTABILIDAD como pediste
      -------------------------------------------------------------------- */}
      <section id="modules" className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-black">Módulos</h2>
        <p className="mt-2 text-[14px] text-white/70">
          Activas lo que necesitas. Todo conversa entre sí.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Module
            title="Conciliación Bancaria"
            bullets={[
              "Importas movimientos (débitos/créditos) desde tu banco",
              "Filtros tipo Excel para encontrar rápido lo que buscas",
              "Conciliación manual o con sugerencias automáticas",
              "Estado claro: cuadra / parcial / no cuadra",
            ]}
          />
          <Module
            title="Ventas / Cobranza"
            bullets={[
              "Facturas y pagos con saldo (fácil de leer)",
              "Estados: pendiente / parcial / pagada / anulada",
              "Vincula ventas con movimientos del banco",
              "Reportes por cliente y antigüedad",
            ]}
          />
          <Module
            title="Compras / Pagos"
            bullets={[
              "Proveedores + facturas de compra + pagos",
              "Conciliación con egresos bancarios",
              "Respaldo y control de auditoría",
              "Preparado para órdenes de compra/pago",
            ]}
          />
          {/* ✅ NUEVO: CONTABILIDAD */}
          <Module
            title="Contabilidad"
            bullets={[
              "Asientos contables desde lo conciliado (sin duplicar trabajo)",
              "Plan de cuentas y centros (según tu país/empresa)",
              "Libro diario / mayor + reportes básicos",
              "Cierre por período con trazabilidad",
            ]}
          />
        </div>
      </section>

      {/* --------------------------------------------------------------------
        SECURITY (Seguridad)
        - Mensaje de confianza + siguiente paso claro
      -------------------------------------------------------------------- */}
      <section id="security" className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/15">
          <h2 className="text-2xl font-black">Seguridad (en serio)</h2>
          <p className="mt-2 text-[14px] text-white/70">
            Sabemos que aquí hay información sensible. Por eso la plataforma está pensada para
            permisos por rol, registro de acciones y datos separados por empresa.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SecurityItem
              title="Roles y permisos"
              desc="Owner, Admin, Contabilidad, Operaciones, Lectura."
              icon="🛡️"
            />
            <SecurityItem
              title="Auditoría"
              desc="Registro de acciones: conciliaciones, cambios, eliminaciones."
              icon="🧷"
            />
            <SecurityItem
              title="Multi-empresa"
              desc="Datos aislados por empresa (según el modelo que definamos)."
              icon="🏢"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] text-white/60">
              Primer paso: crear el Owner (cuenta principal) → luego creas tu Empresa y configuras país/moneda.
            </div>
            <Link
              href="/registro-owner"
              className="rounded-2xl bg-emerald-300 px-5 py-3 text-[13px] font-extrabold text-slate-950 hover:opacity-95"
            >
              Empezar: Registrar mi empresa
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
        FOOTER
      -------------------------------------------------------------------- */}
      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-[12px] text-white/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Conciliador Pro</div>
          <div className="text-white/40">Hecho para operar finanzas sin estrés.</div>
        </div>
      </footer>
    </main>
  );
}

/* ============================================================================
  Subcomponentes de UI (simples)
  - Los dejamos aquí por ahora para que tengas 1 solo archivo fácil de copiar.
  - Después los podemos mover a /components si quieres.
============================================================================ */

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

