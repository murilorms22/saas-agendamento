import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./layouts/RootLayout";
import AdminLayout from "./layouts/AdminLayout";
import LandingPage from "./features/landing/LandingPage";
import PainelInicial from "./features/admin/PainelInicial";
import AdminDashboard from "./features/admin/AdminDashboard";
import AgendaProfissional from "./features/admin/AgendaProfissional";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Área Pública — Tela de Agendamento do Cliente */}
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
        </Route>

        {/* Painel do Profissional */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<PainelInicial />} />
          <Route path="resumo" element={<AdminDashboard />} />
          <Route path="agenda" element={<AgendaProfissional />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
