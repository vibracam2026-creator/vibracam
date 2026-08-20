import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SoundProvider } from "./contexts/SoundContext";
import { Route, Switch, useLocation } from "wouter";
import { LanguageProvider } from "./lib/i18n";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import { BrandLoader } from "./components/BrandLoader";
import NotFound from "./pages/NotFound";

const ForgotPasswordPage = lazy(async () => ({ default: (await import("./pages/AccountRecovery")).ForgotPasswordPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("./pages/AccountRecovery")).ResetPasswordPage }));
const VerifyEmailPage = lazy(async () => ({ default: (await import("./pages/AccountRecovery")).VerifyEmailPage }));
const ParentalConsent = lazy(() => import("./pages/ParentalConsent"));
const ParentalApprovePage = lazy(async () => ({ default: (await import("./pages/ParentalApprove")).ParentalApprovePage }));
const Feed = lazy(() => import("./pages/Feed"));
const Discover = lazy(() => import("./pages/Discover"));
const Profile = lazy(() => import("./pages/Profile"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const FriendRequests = lazy(() => import("./pages/FriendRequests"));
const Stories = lazy(() => import("./pages/Stories"));
const Reels = lazy(() => import("./pages/Reels"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const VideoCall = lazy(() => import("./pages/VideoCall"));
const RandomCall = lazy(() => import("./pages/RandomCall"));
const LiveBroadcast = lazy(() => import("./pages/LiveBroadcast"));
const LiveWatch = lazy(() => import("./pages/LiveWatch"));
const LiveList = lazy(() => import("./pages/LiveList"));
const Settings = lazy(() => import("./pages/Settings"));
const AccountCenter = lazy(() => import("./pages/AccountCenter"));
const SecuritySessions = lazy(() => import("./pages/SecuritySessions"));
const ChatGroups = lazy(() => import("./pages/ChatGroups"));
const ChatGroupConversation = lazy(() => import("./pages/ChatGroupConversation"));
const Channels = lazy(() => import("./pages/Channels"));
const Spaces = lazy(() => import("./pages/Spaces"));
const Admin = lazy(() => import("./pages/Admin"));
const GroupsPage = lazy(async () => ({ default: (await import("./pages/Groups")).GroupsPage }));
const GroupDetail = lazy(async () => ({ default: (await import("./pages/Groups")).GroupDetail }));

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (!loading && !isAuthenticated) setLocation("/login"); }, [isAuthenticated, loading, setLocation]);
  if (loading) return <BrandLoader label="جارٍ تأمين جلستك..."/>;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function Router() {
  return <Suspense fallback={<BrandLoader label="جارٍ تحميل الصفحة..."/>}><Switch>
    <Route path="/" component={Home}/>
    <Route path="/login" component={() => <AuthPage mode="login"/>}/>
    <Route path="/register" component={() => <AuthPage mode="register"/>}/>
    <Route path="/forgot-password" component={ForgotPasswordPage}/>
    <Route path="/reset-password" component={ResetPasswordPage}/>
    <Route path="/verify-email" component={VerifyEmailPage}/>
    <Route path="/parental-consent" component={() => <Protected><ParentalConsent/></Protected>}/>
    <Route path="/parental-approve" component={ParentalApprovePage}/>
    <Route path="/feed" component={() => <Protected><Feed/></Protected>}/>
    <Route path="/discover" component={() => <Protected><Discover/></Protected>}/>
    <Route path="/profile/:id" component={() => <Protected><Profile/></Protected>}/>
    <Route path="/messages/groups" component={() => <Protected><ChatGroups/></Protected>}/>
    <Route path="/messages/groups/:id" component={() => <Protected><ChatGroupConversation/></Protected>}/>
    <Route path="/messages/:peerId" component={() => <Protected><Messages/></Protected>}/>
    <Route path="/messages" component={() => <Protected><Messages/></Protected>}/>
    <Route path="/notifications" component={() => <Protected><Notifications/></Protected>}/>
    <Route path="/friend-requests" component={() => <Protected><FriendRequests/></Protected>}/>
    <Route path="/stories" component={() => <Protected><Stories/></Protected>}/>
    <Route path="/reels" component={() => <Protected><Reels/></Protected>}/>
    <Route path="/marketplace" component={() => <Protected><Marketplace/></Protected>}/>
    <Route path="/account-center" component={() => <Protected><AccountCenter/></Protected>}/>
    <Route path="/settings" component={() => <Protected><Settings/></Protected>}/>
    <Route path="/settings/sessions" component={() => <Protected><SecuritySessions/></Protected>}/>
    <Route path="/admin" component={() => <Protected><Admin/></Protected>}/>
    <Route path="/groups" component={GroupsPage}/>
    <Route path="/groups/:id" component={GroupDetail}/>
    <Route path="/video/:peerId" component={() => <Protected><VideoCall/></Protected>}/>
    <Route path="/random-call" component={() => <Protected><RandomCall/></Protected>}/>
    <Route path="/live" component={() => <Protected><LiveList/></Protected>}/>
    <Route path="/live/broadcast" component={() => <Protected><LiveBroadcast/></Protected>}/>
    <Route path="/live/:id" component={() => <Protected><LiveWatch/></Protected>}/>
    <Route path="/channels" component={() => <Protected><Channels/></Protected>}/>
    <Route path="/spaces" component={() => <Protected><Spaces/></Protected>}/>
    <Route component={NotFound}/>
  </Switch></Suspense>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><SoundProvider><TooltipProvider><Toaster richColors position="top-center"/><LanguageProvider><Router/></LanguageProvider></TooltipProvider></SoundProvider></ThemeProvider></ErrorBoundary>;
}
