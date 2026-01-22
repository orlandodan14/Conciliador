export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white/60 px-6 py-3 text-xs text-slate-600 backdrop-blur">
      <div className="flex items-center justify-between">
        <span>© {new Date().getFullYear()} ConciliaciónPro</span>
        <span className="text-slate-500">Soporte • Versión 0.1</span>
      </div>
    </footer>
  );
}
