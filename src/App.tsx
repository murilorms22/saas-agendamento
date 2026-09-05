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
            {/* 1️⃣ Rotas Estáticas do Sistema (Precedência Estrita) */}
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

            {/* 2️⃣ Rotas Públicas de Agendamento (Raiz e Slugs Dinâmicos) */}
            <Route path="/" element={<RootLayout />}>
              <Route index element={<LandingPage />} />
              <Route path=":slug" element={<LandingPage />} />
            </Route>

            {/* 3️⃣ Rota Fallback */}
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </ProfessionalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
