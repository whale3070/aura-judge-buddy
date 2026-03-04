import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Index from "./pages/Index";
import Submit from "./pages/Submit";
import Admin from "./pages/Admin";
import Ranking from "./pages/Ranking";
import Landing from "./pages/Landing";
import MySubmission from "./pages/MySubmission";
import RoundList from "./pages/RoundList";
import RoundForm from "./pages/RoundForm";
import RoundDetail from "./pages/RoundDetail";
import NotFound from "./pages/NotFound";

function AdminHashRedirect() {
  const { hash } = useParams<{ hash: string }>();
  return <Navigate to={hash ? `/?h=${encodeURIComponent(hash)}` : "/"} replace />;
}

function RootRoute() {
  const [searchParams] = useSearchParams();
  const h = searchParams.get("h");
  return h ? <Admin /> : <Landing />;
}

const queryClient = new QueryClient();

const App = () => (
  <I18nProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/my-submission/:id" element={<MySubmission />} />
            <Route path="/judge" element={<Index />} />
            <Route path="/rounds" element={<RoundList />} />
            <Route path="/rounds/new" element={<RoundForm />} />
            <Route path="/rounds/:id" element={<RoundDetail />} />
            <Route path="/rounds/:id/edit" element={<RoundForm />} />
            <Route path="/admin/:hash" element={<AdminHashRedirect />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </I18nProvider>
);

export default App;
