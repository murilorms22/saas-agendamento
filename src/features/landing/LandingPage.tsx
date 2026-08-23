import { useState } from "react";
import { 
  format, 
  addDays, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  isBefore, 
  startOfDay
} from "date-fns";
import { ChevronRight, ChevronLeft, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LandingPage() {
  const [step, setStep] = useState<"selection" | "form">("selection");
  const [selectedService, setSelectedService] = useState<number | null>(null);
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const availableTimes = ["09:00", "10:30", "11:15", "13:00", "14:30", "16:00", "17:45"];
  const services = [
    { id: 1, name: "Consultation & X-Ray", price: "$120", duration: "45 min" },
    { id: 2, name: "Teeth Whitening", price: "$250", duration: "60 min" },
    { id: 3, name: "Deep Cleaning", price: "$180", duration: "45 min" },
  ];

  // Calendar Logic
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const renderDays = () => {
    const dateFormat = "EEEEEE";
    const days = [];
    let startDate = startOfWeek(currentMonth);
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center font-body text-[10px] font-bold text-muted-foreground pb-2 uppercase tracking-wider">
          {format(addDays(startDate, i), dateFormat)}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        
        const isPast = isBefore(day, startOfDay(new Date()));
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);

        days.push(
          <button
            key={day.toString()}
            disabled={isPast || !isCurrentMonth}
            onClick={() => {
              setSelectedDate(cloneDay);
              setSelectedTime(null);
            }}
            className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center font-body text-xs font-semibold transition-all
              ${!isCurrentMonth ? "text-transparent pointer-events-none" : ""}
              ${isPast && isCurrentMonth ? "text-muted-foreground/40 cursor-not-allowed" : ""}
              ${isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : ""}
              ${!isSelected && !isPast && isCurrentMonth ? "hover:bg-primary/10 text-foreground" : ""}
            `}
          >
            {formattedDate}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1 mb-1" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  const handleContinue = () => {
    if (selectedService && selectedDate && selectedTime) {
      setStep("form");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Booked! \nName: ${name}\nWhatsApp: ${whatsapp}\nTime: ${format(selectedDate, "MMM do, yyyy")} at ${selectedTime}`);
  };

  return (
    <div className="h-full w-full bg-background p-3 md:p-6 overflow-y-auto overflow-x-hidden">
      <div className="max-w-7xl mx-auto h-full flex flex-col gap-4 md:gap-6">
        
        <AnimatePresence mode="wait">
          {step === "selection" && (
            <motion.div 
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full gap-4 md:gap-6"
            >
              {/* Top Row: Hero (Left) + Services (Right) */}
              <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:h-[40%] min-h-[300px]">
                
                {/* Hero Box */}
                <div className="lg:w-5/12 bg-primary/5 rounded-[2rem] p-8 flex flex-col justify-center relative overflow-hidden">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-body text-xs font-bold mb-4 w-fit">
                    <CheckCircle2 size={14} /> Premium Dental Care
                  </div>
                  <h1 className="text-4xl xl:text-5xl font-display font-extrabold text-foreground leading-[1.1] mb-3">
                    Smile with <br/><span className="text-primary">Confidence.</span>
                  </h1>
                  <p className="text-sm font-body text-muted-foreground mb-6 leading-relaxed max-w-sm">
                    Modern dentistry in a calm, welcoming environment. Advanced technology with a gentle touch.
                  </p>
                  
                  <div className="flex gap-5 items-center mt-auto">
                    <div className="flex flex-col">
                      <span className="font-display font-bold text-2xl text-foreground">4.9/5</span>
                      <span className="font-body text-[10px] uppercase font-bold text-muted-foreground">Patient Rating</span>
                    </div>
                    <div className="w-px h-8 bg-border"></div>
                    <div className="flex flex-col">
                      <span className="font-display font-bold text-2xl text-foreground">500+</span>
                      <span className="font-body text-[10px] uppercase font-bold text-muted-foreground">Happy Smiles</span>
                    </div>
                  </div>
                </div>

                {/* Services Box */}
                <div className="flex-1 bg-card rounded-[2rem] shadow-floating border border-border/40 p-6 md:p-8 flex flex-col">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-display font-bold text-foreground">Select a Service</h2>
                    <span className="text-xs font-body font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">Step 1 of 3</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
                    {services.map(service => (
                      <button 
                        key={service.id}
                        onClick={() => setSelectedService(service.id)}
                        className={`flex flex-col justify-between p-5 rounded-2xl border transition-all text-left h-full
                          ${selectedService === service.id 
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm' 
                            : 'border-border bg-background hover:border-primary/40 hover:bg-slate-50/50'}
                        `}
                      >
                        <div>
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                            <CheckCircle2 size={16} className={selectedService === service.id ? "opacity-100" : "opacity-0 transition-opacity"} />
                          </div>
                          <span className="block font-body text-sm font-bold text-foreground mb-1">{service.name}</span>
                          <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
                            <Clock size={12}/> {service.duration}
                          </span>
                        </div>
                        <span className="font-display text-lg font-extrabold text-primary mt-4">{service.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Calendar & Time */}
              <div className={`flex-1 bg-card rounded-[2rem] shadow-floating border border-border/40 p-6 md:p-8 flex flex-col transition-opacity duration-500 ${selectedService ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-display font-bold text-foreground">Date & Time</h2>
                  <span className="text-xs font-body font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">Step 2 of 3</span>
                </div>

                <div className="flex flex-col md:flex-row gap-8 lg:gap-12 flex-1">
                  {/* Calendar Side */}
                  <div className="md:w-1/2 flex flex-col">
                    <div className="flex justify-between items-center mb-4 px-2">
                      <span className="font-body text-sm font-bold text-foreground">
                        {format(currentMonth, "MMMM yyyy")}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary/50 hover:bg-secondary text-foreground transition-colors"><ChevronLeft size={16}/></button>
                        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary/50 hover:bg-secondary text-foreground transition-colors"><ChevronRight size={16}/></button>
                      </div>
                    </div>
                    <div className="bg-background rounded-2xl border border-border p-4 flex-1">
                      {renderDays()}
                      {renderCells()}
                    </div>
                  </div>

                  {/* Time Side */}
                  <div className={`md:w-1/2 flex flex-col transition-opacity duration-300 ${selectedDate ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                    <span className="font-body text-sm font-bold text-foreground mb-4 px-2">
                      Available Times for {format(selectedDate, "MMM do")}
                    </span>
                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
                      {availableTimes.map((time) => (
                        <button 
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-3 rounded-xl border font-body text-sm font-bold transition-all
                            ${selectedTime === time 
                              ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30' 
                              : 'bg-background border-border text-foreground hover:border-primary/40'}
                          `}
                        >
                          {time}
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={handleContinue}
                      disabled={!selectedService || !selectedDate || !selectedTime}
                      className="mt-auto w-full bg-primary text-primary-foreground py-4 rounded-2xl font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                    >
                      Continue to Details
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "form" && (
            <motion.div 
              key="form"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="w-full max-w-2xl bg-card rounded-[2rem] shadow-floating border border-border/50 p-8 md:p-12 relative">
                <button 
                  onClick={() => setStep("selection")}
                  className="absolute top-8 left-8 flex items-center gap-2 w-10 h-10 justify-center rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>

                <div className="text-center mt-10 mb-10">
                  <h2 className="text-3xl font-display font-extrabold text-foreground mb-4">
                    Confirm your details
                  </h2>
                  <div className="inline-flex flex-col md:flex-row bg-primary/5 border border-primary/10 rounded-2xl p-4 gap-4 items-center justify-center text-left mx-auto">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <p className="font-body text-base font-bold text-foreground leading-tight">
                        {services.find(s => s.id === selectedService)?.name}
                      </p>
                      <p className="font-body text-sm text-primary font-semibold mt-1">
                        {format(selectedDate, "EEEE, MMMM do")} at {selectedTime}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
                  <div className="space-y-1.5">
                    <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full p-4 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">WhatsApp Number</label>
                    <input 
                      type="tel" 
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full p-4 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-body font-bold text-base shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all mt-8"
                  >
                    Confirm Booking
                  </button>
                  <p className="text-center font-body text-[11px] font-medium text-muted-foreground mt-4">
                    By confirming, you agree to our terms of service and privacy policy.
                  </p>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
