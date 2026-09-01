import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import RootLayout from "./layouts/RootLayout";
import AdminLayout from "./layouts/AdminLayout";
import LandingPage from "./features/landing/LandingPage";
import LoginPage from "./features/auth/LoginPage";
import PainelInicial from "./features/admin/PainelInicial";
import AdminDashboard from "./features/admin/AdminDashboard";
import AgendaProfissional from "./features/admin/AgendaProfissional";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
