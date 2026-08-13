import { BrowserRouter, Routes, Route } from 'react-router'
import Home from './views/Home'
import { Toaster } from 'sonner'
import AuthLayout from './layouts/AuthLayout'
import RegisterView from './views/auth/RegisterView'
import RequestNewCodeView from './views/auth/RequestNewCodeView'
import ConfirmAccountView from './views/auth/ConfirmAccountView'
import LoginView from './views/auth/LoginView'
import MainLayout from './layouts/MainLayout'
import ProfileView from './views/user/ProfileView'
import OnboardingView from './views/onboarding/OnboardingView'
import ForgotPasswordView from './views/auth/ForgotPasswordView'
import NewPasswordView from './views/auth/NewPasswordView'
import GroupCreateView from './views/groups/GroupCreateView'
import GroupDetailView from './views/groups/GroupDetailView'
import GroupsListView from './views/groups/GroupsListView'
import JoinGroupView from './views/groups/JoinGroupView'
import ConfirmConsumptionView from './views/groups/ConfirmConsumptionView'
import BarRegisterView from './views/bar/BarRegisterView'
import MyBarsView from './views/bar/MyBarsView'
import BarProfileView from './views/bar/BarProfileView'
import CashierLoginView from './views/cashier/CashierLoginView'
import CashierPanelView from './views/cashier/CashierPanelView'
import CashierSearchView from './views/cashier/CashierSearchView'
import CashierOutingView from './views/cashier/CashierOutingView'
import CashierLayout from './layouts/CashierLayout'
import NotFound from './views/NotFound'

export default function Router() {
    return (
        <BrowserRouter>
            <Toaster position="top-center" />

            <Routes>
                <Route element={<AuthLayout />}>
                    <Route path="/register" element={<RegisterView />} />
                    <Route path="/request-code" element={<RequestNewCodeView />} />
                    <Route path="/confirm-account" element={<ConfirmAccountView />} />
                    <Route path="/login" element={<LoginView />} />
                    <Route path="/forgot-password" element={<ForgotPasswordView />} />
                    <Route path="/new-password" element={<NewPasswordView />} />
                </Route>

                <Route path='/profile' element={<MainLayout />}>
                    <Route index element={<ProfileView />} />
                </Route>

                <Route element={<MainLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/onboarding" element={<OnboardingView />} />
                    <Route path="/groups" element={<GroupsListView />} />
                    <Route path="/groups/create" element={<GroupCreateView />} />
                    <Route path="/groups/:slug" element={<GroupDetailView />} />
                    <Route path="/groups/:slug/confirmar-consumo" element={<ConfirmConsumptionView />} />
                    <Route path="/bar/registro" element={<BarRegisterView />} />
                    <Route path="/bar/mis-bares" element={<MyBarsView />} />
                    <Route path="/bar/:id/perfil" element={<BarProfileView />} />
                </Route>
                <Route path="/unirse/:inviteCode" element={<JoinGroupView />} />

                <Route path="/bar/:barId/cajero/login" element={<CashierLoginView />} />
                <Route element={<CashierLayout />}>
                    <Route path="/bar/:barId/cajero" element={<CashierPanelView />} />
                    <Route path="/bar/:barId/cajero/buscar" element={<CashierSearchView />} />
                    <Route path="/bar/:barId/cajero/salida/:outingId" element={<CashierOutingView />} />
                </Route>

                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    )
}
