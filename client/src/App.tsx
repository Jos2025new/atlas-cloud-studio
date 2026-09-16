import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

export default function App() {
  return (
    <ErrorBoundary>
      <Home />
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#15171a", border: "" }, className: "atlas-toast" }} />
    </ErrorBoundary>
  );
}
