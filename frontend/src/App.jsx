
import { Routes, Route } from 'react-router-dom'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import TrackPage from './pages/TrackPage'

import DashboardLayout from './layouts/DashboardLayout'
import DashboardHome from './pages/dashboard/DashboardHome'

import CashierPage from './pages/dashboard/CashierPage'
import OrdersPage from './pages/dashboard/OrdersPage'
import OrderDetailPage from './pages/dashboard/OrderDetailPage'
import ProductionPage from './pages/dashboard/ProductionPage'
import DispatchPage from './pages/dashboard/DispatchPage'
import CourierPage from './pages/dashboard/CourierPage'
import InventoryPage from './pages/dashboard/InventoryPage'
import ServicesPage from './pages/dashboard/ServicesPage'
import ReportPage from './pages/dashboard/ReportPage'
import MessagesPage from './pages/dashboard/MessagesPage'
import UsersPage from './pages/dashboard/UsersPage'
import SettingsPage from './pages/dashboard/SettingsPage'
import DisputePage from './pages/dashboard/DisputePage'
import DisputeDetailPage from './pages/dashboard/DisputeDetailPage'

export default function App() {
  return (
    <Routes>
      {/* Halaman publik */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profil" element={<ProfilePage />} />
      <Route path="/lacak" element={<TrackPage />} />

      {/* Dashboard staf */}
      <Route path="/app" element={<DashboardLayout />}>
        <Route path="dashboard" element={<DashboardHome />} />

        {/* Kasir */}
        <Route path="kasir" element={<CashierPage />} />

        {/* Daftar dan detail order */}
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:status" element={<OrdersPage />} />
        <Route path="order/:id" element={<OrderDetailPage />} />

        {/* Produksi */}
        <Route path="produksi" element={<ProductionPage />} />

        {/* Delivery & dispatch */}
        <Route path="dispatch" element={<DispatchPage />} />

        {/* Tugas kurir */}
        <Route path="kurir" element={<CourierPage />} />

        {/* Inventori */}
        <Route path="inventori" element={<InventoryPage />} />

        {/* Layanan & resep */}
        <Route path="layanan" element={<ServicesPage />} />

        {/* Dispute */}
        <Route path="dispute" element={<DisputePage />} />
        <Route path="dispute/:id" element={<DisputeDetailPage />} />

        {/* Laporan */}
        <Route path="laporan" element={<ReportPage />} />

        {/* Pesan website */}
        <Route path="pesan" element={<MessagesPage />} />

        {/* Manajemen pengguna */}
        <Route path="pengguna" element={<UsersPage />} />

        {/* Pengaturan usaha */}
        <Route path="pengaturan" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
