import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardPage from "./pages/DashboardPage";
import SubjectPage from "./pages/SubjectPage";
import TopicPage from "./pages/TopicPage";
import QuestionPage from "./pages/QuestionPage";
import PracticePage from "./pages/PracticePage";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/subjects/:subjectSlug" component={SubjectPage} />
      <Route path="/subjects/:subjectSlug/topics/:topicSlug" component={TopicPage} />
      <Route path="/questions/:questionId" component={QuestionPage} />
      <Route path="/tests/:topicSlug" component={PracticePage} />
      <Route path="/uploads" component={UploadPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
