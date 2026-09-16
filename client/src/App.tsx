import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

export default function App() {
  return (
    <ErrorBoundary>
      <Home />
      <Toaster
        theme="dark"
        position="bottom-right"
        duration={3500}
        closeButton
        visibleToasts={3}
        toastOptions={{ style: { background: "#15171a", border: "1px solid rgba(255,255,255,.12)" }, className: "atlas-toast" }}
      />
    </ErrorBoundary>
  );
}
