import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfessionalProvider } from "./store/useProfessional";
import { AuthGuard } from "./components/AuthGuard";
import RootLayout from "./layouts/RootLayout";
import AdminLayout from "./layouts/AdminLayout";
import LandingPage from "./features/landing/LandingPage";
import LoginPage from "./features/auth/LoginPage";
import PainelInicial from "./features/admin/PainelInicial";
import AdminDashboard from "./features/admin/AdminDashboard";
import AgendaProfissional from "./features/admin/AgendaProfissional";
import Configuracoes from "./features/admin/Configuracoes";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfessionalProvider>
          <Routes>
            {/* Área Pública — Tela de Agendamento do Cliente */}
            <Route path="/" element={<RootLayout />}>
              <Route index element={<LandingPage />} />
            </Route>

            {/* Autenticação do Profissional */}
            <Route path="/login" element={<LoginPage />} />

            {/* Painel do Profissional (Protegido com AuthGuard) */}
            <Route
              path="/admin"
              element={
                <AuthGuard>
                  <AdminLayout />
                </AuthGuard>
              }
            >
              <Route index element={<PainelInicial />} />
              <Route path="resumo" element={<AdminDashboard />} />
              <Route path="agenda" element={<AgendaProfissional />} />
              <Route path="configuracoes" element={<Configuracoes />} />
            </Route>
          </Routes>
        </ProfessionalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
