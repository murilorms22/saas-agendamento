import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./layouts/RootLayout";
import AdminLayout from "./layouts/AdminLayout";
import LandingPage from "./features/landing/LandingPage";
import AdminDashboard from "./features/admin/AdminDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Client Front */}
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
        </Route>

        {/* Admin Dashboard */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
