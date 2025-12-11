import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { usePingService } from "@/hooks/use-ping-service";
import { useTabCleanup } from "@/hooks/use-tab-cleanup";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ForumPage from "@/pages/forum-page";
import MySpacePage from "@/pages/my-space-page";
import AboutPage from "@/pages/about-page";
import ContactPage from "@/pages/contact-page";
import SearchPage from "@/pages/search-page";
import TermsPage from "@/pages/terms-page";
import PrivacyPage from "@/pages/privacy-page";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/" component={HomePage} />
      <Route path="/forum/:id" component={ForumPage} />
      <ProtectedRoute path="/my-space" component={MySpacePage} />
      <ProtectedRoute path="/about" component={AboutPage} />
      <ProtectedRoute path="/contact" component={ContactPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Start ping service to keep server awake on Render
  usePingService({
    interval: 10000, // Ping every 10 seconds
    enabled: true,
    onError: (error) => {
      console.warn('🚨 Keep-alive ping failed:', error.message);
    }
  });

  // Handle tab cleanup to reset storage when tab is closed
  useTabCleanup({
    enabled: true,
    onCleanup: () => {
      console.log('🧹 Tab cleanup completed - storage and session reset');
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
