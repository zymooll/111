import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DishDetailPage } from './pages/DishDetailPage'
import { FilterPage } from './pages/FilterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { MinePage } from './pages/MinePage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { ReviewPage } from './pages/ReviewPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/mine" element={<MinePage />} />
        <Route path="/dish/:dishId" element={<DishDetailPage />} />
        <Route path="/filter/:kind" element={<FilterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/review/new" element={<ReviewPage />} />
        <Route path="/dish/:dishId/review" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
