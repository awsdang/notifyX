import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./context/ToastContext";
import { router } from "./router";

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
