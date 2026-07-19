import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Blogs from './pages/Blogs';
import Banners from './pages/Banners';
import Thoughts from './pages/Thoughts';
import Categories from './pages/Categories';
import Astrologers from './pages/Astrologers';
import Customers from './pages/Customers';
import Sessions from './pages/Sessions';
import Remedies from './pages/Remedies';
import Orders from './pages/Orders';
import Gifts from './pages/Gifts';
import AstroServices from './pages/AstroServices';
import Live from './pages/Live';
import Missed from './pages/Missed';
import Withdrawals from './pages/Withdrawals';
import Reports from './pages/Reports';
import Reviews from './pages/Reviews';
import NewEntries from './pages/NewEntries';
import Notifications from './pages/Notifications';
import Leaderboard from './pages/Leaderboard';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="blogs" element={<Blogs />} />
        <Route path="banners" element={<Banners />} />
        <Route path="thoughts" element={<Thoughts />} />
        <Route path="categories" element={<Categories />} />
        <Route path="remedies" element={<Remedies />} />
        <Route path="orders" element={<Orders />} />
        <Route path="gifts" element={<Gifts />} />
        <Route path="astro-services" element={<AstroServices />} />
        <Route path="live" element={<Live />} />
        <Route path="missed" element={<Missed />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="reports" element={<Reports />} />
        <Route path="new-entries" element={<NewEntries />} />
        <Route path="astrologers" element={<Astrologers />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="sessions" element={<Sessions />} />
      </Route>
    </Routes>
  );
}
