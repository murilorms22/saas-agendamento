import { Outlet } from "react-router-dom";
import { Stethoscope } from "lucide-react";

export default function RootLayout() {
  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* Clean Header */}
      <header className="py-4 px-6 flex justify-between items-center bg-card shadow-sm z-50">
        <div className="font-display font-bold text-xl tracking-tight flex items-center gap-2 text-primary">
          <Stethoscope size={24} />
          Nox Dental
        </div>
        <nav>
          <button className="bg-primary text-primary-foreground px-5 py-2 rounded-full font-body font-semibold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all">
            Book Appointment
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-2 px-6 bg-background text-foreground/50 text-center flex justify-between items-center text-xs">
        <div className="font-display font-bold tracking-tight text-primary">
          Nox Dental
        </div>
        <p className="font-body">
          Precision dental care.
        </p>
      </footer>
    </div>
  );
}
