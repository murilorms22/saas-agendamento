import { Outlet } from "react-router-dom";

export default function RootLayout() {
  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col bg-gradient-to-br from-background via-background to-primary/5 text-foreground">
      <main className="flex-1 w-full flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
