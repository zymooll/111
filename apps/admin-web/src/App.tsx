import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { PropsWithChildren } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminLayout } from './layouts/AdminLayout';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { CatalogPage } from './pages/CatalogPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportsPage } from './pages/ImportsPage';
import { LoginPage } from './pages/LoginPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { UsersPage } from './pages/UsersPage';

function ProtectedLayout() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AdminLayout />;
}

function ManagerOnly({ children }: PropsWithChildren) {
  const { user } = useAuth();
  if (user?.role === 'review_moderator') return <Navigate to="/reviews" replace />;
  return children;
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          colorSuccess: '#16a34a',
          colorWarning: '#f59e0b',
          colorError: '#e5484d',
          borderRadius: 10,
          borderRadiusLG: 14,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
          Menu: { itemBorderRadius: 10, itemMarginInline: 12, itemHeight: 46 },
          Table: { headerBg: '#f8fafc', headerColor: '#475569' },
          Card: { headerFontSize: 16 },
        },
      }}
    >
      <AntApp>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/users" element={<ManagerOnly><UsersPage /></ManagerOnly>} />
              <Route path="/catalog" element={<ManagerOnly><CatalogPage /></ManagerOnly>} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/imports" element={<ManagerOnly><ImportsPage /></ManagerOnly>} />
              <Route path="/audit-logs" element={<ManagerOnly><AuditLogsPage /></ManagerOnly>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
