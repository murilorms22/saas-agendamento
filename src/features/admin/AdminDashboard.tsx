import { useState } from "react";
import { format } from "date-fns";
import { Check, X, Clock, CalendarDays, CheckCircle2, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Appointment = {
  id: string;
  clientName: string;
  service: string;
  time: string;
  status: "Pendente" | "Confirmado" | "Rejeitado";
};

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([
    { id: "1", clientName: "Marcus Aurelius", service: "Teeth Whitening", time: "09:00", status: "Pendente" },
    { id: "2", clientName: "Lucius Seneca", service: "Consultation & X-Ray", time: "10:30", status: "Confirmado" },
    { id: "3", clientName: "Epictetus", service: "Deep Cleaning", time: "14:30", status: "Pendente" },
    { id: "4", clientName: "Zeno of Citium", service: "Consultation & X-Ray", time: "16:00", status: "Pendente" },
  ]);

  const handleStatus = (id: string, newStatus: "Confirmado" | "Rejeitado") => {
    setAppointments(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
  };

  const pendingCount = appointments.filter(a => a.status === "Pendente").length;

  return (
    <div className="space-y-10 pb-12">
      {/* Header & Quick Summary */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end border-b border-border/20 pb-8 gap-6">
        <div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            Agenda Hoje
          </h1>
          <p className="text-muted-foreground font-body text-sm font-medium mt-1 flex items-center gap-2">
            <CalendarDays size={16} />
            {format(new Date(), "EEEE, MMMM do, yyyy")}
          </p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-card/50 rounded-2xl p-5 border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Clock size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{pendingCount}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Pendentes</span>
            </div>
          </div>
          <div className="bg-card/50 rounded-2xl p-5 border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-secondary/50 text-foreground flex items-center justify-center shrink-0">
              <User size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{appointments.length}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Total Hoje</span>
            </div>
          </div>
        </div>
      </header>

      {/* Grid de Agendamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {appointments.map((appointment) => (
            <motion.div 
              layout
              key={appointment.id} 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
              className={`flex flex-col p-6 rounded-3xl border transition-all duration-500 shadow-floating
                ${appointment.status === "Confirmado" ? "bg-card/30 border-border/10 opacity-60" : ""}
                ${appointment.status === "Rejeitado" ? "bg-card/10 border-border/5 opacity-30 grayscale" : ""}
                ${appointment.status === "Pendente" ? "bg-card border-border/30" : ""}
              `}
            >
              
              <div className="flex items-start justify-between mb-6">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <span className="font-display font-bold text-lg leading-tight">{appointment.time}</span>
                  </div>
                  <div className="flex flex-col justify-center">
                    <h3 className="font-display font-bold text-xl text-foreground mb-1 leading-tight">
                      {appointment.clientName}
                    </h3>
                    <p className="font-body text-sm font-medium text-muted-foreground">
                      {appointment.service}
                    </p>
                  </div>
                </div>
                
                {/* Status Badge */}
                <div className={`px-3 py-1.5 rounded-full font-body font-semibold text-xs flex items-center gap-1.5 transition-colors
                  ${appointment.status === "Confirmado" ? "bg-emerald-500/10 text-emerald-500" : ""}
                  ${appointment.status === "Rejeitado" ? "bg-rose-500/10 text-rose-500" : ""}
                  ${appointment.status === "Pendente" ? "bg-primary/10 text-primary" : ""}
                `}>
                  {appointment.status === "Confirmado" && <CheckCircle2 size={14} />}
                  {appointment.status === "Rejeitado" && <X size={14} />}
                  {appointment.status === "Pendente" && <Clock size={14} />}
                  {appointment.status}
                </div>
              </div>

              {/* Ações (Visíveis apenas se pendente) */}
              <AnimatePresence>
                {appointment.status === "Pendente" && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: "auto", opacity: 1, marginTop: "1rem" }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    className="flex gap-3 overflow-hidden"
                  >
                    <button 
                      onClick={() => handleStatus(appointment.id, "Confirmado")}
                      className="flex-1 py-3 rounded-xl font-body font-semibold text-sm bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      Confirmar
                    </button>
                    <button 
                      onClick={() => handleStatus(appointment.id, "Rejeitado")}
                      className="flex-1 py-3 rounded-xl font-body font-semibold text-sm bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center gap-2"
                    >
                      <X size={18} />
                      Rejeitar
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
